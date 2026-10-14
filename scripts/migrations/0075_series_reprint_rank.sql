-- Numbered 0075 (was 0066, which the marketplace orders migration also used). Already applied in prod 2026-10-14; kept as the record.
-- Rank series by historical importance within each lexical match tier.
-- GCD reprints identify the classic run collectors mean: The X-Men (1963)
-- 5,296 vs X-Men (1991) 1,179 and X-Men (2001) 186; Amazing Spider-Man (1963)
-- 14,685 vs 1999 3,467 and 2018 1,165; Avengers (1963) 8,124 vs 1998 1,116;
-- Batman (1940) 10,136 and Detective Comics (1937) 10,227 vs Batman (2016)
-- 3,258. One leading "The" is ignored for exact, whole-word, and prefix tiers.

-- The function also returns reprint_count so the search route can use it as
-- its own tiebreak. Changing the return columns needs a drop + create; the
-- transaction keeps search from ever seeing a missing function.

begin;

alter table public.series add column if not exists reprint_count integer not null default 0;

drop function if exists public.search_series_by_relevance_v2(text, text[], int);

create function public.search_series_by_relevance_v2(
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
  us_market boolean,
  reprint_count integer
)
language plpgsql stable as $$
#variable_conflict use_column
declare
  v_compact text := regexp_replace(lower(coalesce(normalized_term, '')), '[^a-z0-9]+', '', 'g');
  v_spaced text := btrim(regexp_replace(lower(coalesce(normalized_term, '')), '[^a-z0-9]+', ' ', 'g'));
  v_compact_without_the text;
  v_spaced_without_the text;
  v_words text[];
  v_anchor text;
  v_limit int := greatest(1, least(coalesce(result_limit, 400), 1000));
  v_found bigint := 0;
begin
  if v_compact = '' then
    return;
  end if;

  -- Only a whole leading word "the": "the x-men" -> "x-men", never "thessaly".
  v_spaced_without_the := case when v_spaced like 'the %' then substr(v_spaced, 5) else v_spaced end;
  v_compact_without_the := replace(v_spaced_without_the, ' ', '');

  select coalesce(array_agg(w), '{}'::text[]) into v_words
  from unnest(regexp_split_to_array(lower(normalized_term), '[^a-z0-9]+')) as w
  where length(w) >= 2 and w <> all (array['a', 'an', 'and', 'of', 'the']);

  -- The longest word is the most selective one to look up through the index.
  select w into v_anchor from unnest(v_words) as w order by length(w) desc, w limit 1;

  return query
  with candidates as (
    select s.id from public.series s
    where s.title_normalized like '%' || v_compact || '%'
       or s.title_normalized like '%' || v_compact_without_the || '%'
    union
    select s.id from public.series s
    where cardinality(v_words) >= 2
      and v_anchor is not null
      and s.title_search_text like '% ' || v_anchor || ' %'
      and not exists (
        select 1 from unnest(v_words) as word
        where s.title_search_text not like '% ' || word || ' %'
      )
  )
  select
    s.id, s.gcd_id::integer, s.title::text, s.issue_count_cached,
    s.year_start_cached, s.year_end_cached,
    s.resolved_publisher_cached::text, s.featured_cover_path_cached::text, s.us_market,
    s.reprint_count
  from candidates c
  join public.series s on s.id = c.id
  where s.gcd_id is not null
    and s.issue_count_cached > 0
    and s.year_start_cached is not null
    and (s.us_market is true or s.resolved_publisher_cached = any (allowed_publishers))
  order by
    case
      when s.title_normalized = v_compact
        or s.title_normalized = 'the' || v_compact
        or s.title_normalized = v_compact_without_the
        or 'the' || s.title_normalized = v_compact
        then 1000::double precision
      when regexp_replace(s.title_search_text, '^ the ', ' ') = ' ' || v_spaced_without_the || ' '
        or regexp_replace(s.title_search_text, '^ the ', ' ') like ' ' || v_spaced_without_the || ' %'
        then 800::double precision
      when (case when s.title_search_text like ' the %' then substr(s.title_normalized, 4) else s.title_normalized end)
        like v_compact_without_the || '%'
        then (600 - least(300, length(case when s.title_search_text like ' the %' then substr(s.title_normalized, 4) else s.title_normalized end) - length(v_compact_without_the)))::double precision
      when s.title_normalized like '%' || v_compact || '%'
        or s.title_normalized like '%' || v_compact_without_the || '%'
        then (500 - least(200, length(s.title_normalized) - length(v_compact_without_the)))::double precision
      else 400::double precision
    end desc,
    s.reprint_count desc,
    s.issue_count_cached desc
  limit v_limit;

  get diagnostics v_found = row_count;
  if v_found > 0 or length(v_compact) < 4 then
    return;
  end if;

  -- Typo tolerance only when nothing matched lexically (same rule as 0041).
  return query
  select
    s.id, s.gcd_id::integer, s.title::text, s.issue_count_cached,
    s.year_start_cached, s.year_end_cached,
    s.resolved_publisher_cached::text, s.featured_cover_path_cached::text, s.us_market,
    s.reprint_count
  from public.series s
  where s.title_normalized % v_compact
    and similarity(s.title_normalized, v_compact) >= 0.32
    and s.gcd_id is not null
    and s.issue_count_cached > 0
    and s.year_start_cached is not null
    and (s.us_market is true or s.resolved_publisher_cached = any (allowed_publishers))
  order by (100 + similarity(s.title_normalized, v_compact) * 100) desc,
    s.reprint_count desc,
    s.issue_count_cached desc
  limit v_limit;
end;
$$;

commit;

-- Rollback: drop this function and re-run 0064_search_series_v2.sql (search
-- needs the function to exist), then
--   alter table public.series drop column if exists reprint_count;
