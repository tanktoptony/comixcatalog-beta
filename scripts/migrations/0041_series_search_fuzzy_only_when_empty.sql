-- Keep typo tolerance as a last resort. Lexical hits are intentional matches;
-- mixing trigram rows into a short lexical result set introduced noise such
-- as Headbuster for "tug and buster".

create extension if not exists pg_trgm;

alter table public.series
  add column if not exists title_search_text text
  generated always as (
    ' ' || btrim(regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g')) || ' '
  ) stored;

create index if not exists series_title_normalized_trgm_idx
  on public.series using gin (title_normalized gin_trgm_ops);

create index if not exists series_title_search_text_trgm_idx
  on public.series using gin (title_search_text gin_trgm_ops);

create or replace function public.search_series_by_relevance(
  normalized_term text,
  allowed_publishers text[],
  result_limit int default 400
)
returns table (
  id uuid,
  gcd_id integer,
  title text,
  issue_count_cached integer,
  year_start_cached integer,
  year_end_cached integer,
  resolved_publisher_cached text,
  featured_cover_path_cached text,
  us_market boolean
)
language sql stable as $$
  with params as materialized (
    select
      regexp_replace(lower(normalized_term), '[^a-z0-9]+', '', 'g') as compact_term,
      btrim(regexp_replace(lower(normalized_term), '[^a-z0-9]+', ' ', 'g')) as spaced_term,
      array(
        select word
        from unnest(regexp_split_to_array(lower(normalized_term), '[^a-z0-9]+')) word
        where length(word) >= 2
          and word <> all(array['a', 'an', 'and', 'of', 'the'])
      ) as query_words
  ),
  eligible as not materialized (
    select s.*
    from public.series s
    where s.gcd_id is not null
      and s.issue_count_cached > 0
      and s.year_start_cached is not null
      and (s.us_market is true or s.resolved_publisher_cached = any(allowed_publishers))
  ),
  lexical as materialized (
    select
      s.id, s.gcd_id, s.title, s.issue_count_cached,
      s.year_start_cached, s.year_end_cached,
      s.resolved_publisher_cached, s.featured_cover_path_cached, s.us_market,
      case
        when s.title_normalized = p.compact_term then 1000::double precision
        when s.title_search_text = ' ' || p.spaced_term || ' '
          or s.title_search_text like ' ' || p.spaced_term || ' %'
          then 800::double precision
        when s.title_normalized like p.compact_term || '%'
          then (600 - least(300, length(s.title_normalized) - length(p.compact_term)))::double precision
        when s.title_normalized like '%' || p.compact_term || '%'
          then (500 - least(200, length(s.title_normalized) - length(p.compact_term)))::double precision
        else 400::double precision
      end as relevance
    from eligible s
    cross join params p
    where p.compact_term <> ''
      and (
        s.title_normalized like '%' || p.compact_term || '%'
        or (
          cardinality(p.query_words) >= 2
          and not exists (
            select 1
            from unnest(p.query_words) word
            where s.title_search_text not like '% ' || word || ' %'
          )
        )
      )
  ),
  fuzzy as materialized (
    select
      s.id, s.gcd_id, s.title, s.issue_count_cached,
      s.year_start_cached, s.year_end_cached,
      s.resolved_publisher_cached, s.featured_cover_path_cached, s.us_market,
      (100 + similarity(s.title_normalized, p.compact_term) * 100)::double precision as relevance
    from eligible s
    cross join params p
    where not exists (select 1 from lexical)
      and length(p.compact_term) >= 4
      and s.title_normalized % p.compact_term
      and similarity(s.title_normalized, p.compact_term) >= 0.32
      and not exists (select 1 from lexical l where l.id = s.id)
  ),
  combined as (
    select * from lexical
    union all
    select * from fuzzy
  )
  select
    c.id, c.gcd_id, c.title, c.issue_count_cached,
    c.year_start_cached, c.year_end_cached,
    c.resolved_publisher_cached, c.featured_cover_path_cached, c.us_market
  from combined c
  order by c.relevance desc, c.issue_count_cached desc
  limit greatest(1, least(result_limit, 1000));
$$;
