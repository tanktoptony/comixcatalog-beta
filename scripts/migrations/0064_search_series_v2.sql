-- search_series_by_relevance_v2: same results as search_series_by_relevance
-- (0041), without reading the whole series table.
--
-- Measured 2026-10-13 (EXPLAIN ANALYZE, "batman"): Seq Scan on series, 208,923
-- rows read, 165,576 thrown away, 7.1 s; 40-55 s for broad terms under load.
-- The trigram indexes exist (series_title_normalized_trgm_idx,
-- series_title_search_text_trgm_idx) but the lexical match was
--     title_normalized like '%term%'  OR  <every query word is in title_search_text>
-- and the second half can't use an index, so Postgres scanned everything.
--
-- v2 runs the two halves as separate index lookups and unions the ids:
--   1. title_normalized like '%term%'                      (trigram index)
--   2. multi-word queries only: title_search_text contains the longest word
--      (trigram index), then every word is checked, exactly as before.
-- Eligibility, the relevance CASE, the sort and the typo (fuzzy) fallback
-- are unchanged. Created alongside v1 so both can be compared on live data
-- before the app switches; v1 stays until then.

create or replace function public.search_series_by_relevance_v2(
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
language plpgsql stable as $$
#variable_conflict use_column
declare
  v_compact text := regexp_replace(lower(coalesce(normalized_term, '')), '[^a-z0-9]+', '', 'g');
  v_spaced text := btrim(regexp_replace(lower(coalesce(normalized_term, '')), '[^a-z0-9]+', ' ', 'g'));
  v_words text[];
  v_anchor text;
  v_limit int := greatest(1, least(coalesce(result_limit, 400), 1000));
  v_found bigint := 0;
begin
  if v_compact = '' then
    return;
  end if;

  select coalesce(array_agg(w), '{}'::text[]) into v_words
  from unnest(regexp_split_to_array(lower(normalized_term), '[^a-z0-9]+')) as w
  where length(w) >= 2 and w <> all (array['a', 'an', 'and', 'of', 'the']);

  -- The longest word is the most selective one to look up through the index.
  select w into v_anchor from unnest(v_words) as w order by length(w) desc, w limit 1;

  return query
  with candidates as (
    select s.id from public.series s
    where s.title_normalized like '%' || v_compact || '%'
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
    s.resolved_publisher_cached::text, s.featured_cover_path_cached::text, s.us_market
  from candidates c
  join public.series s on s.id = c.id
  where s.gcd_id is not null
    and s.issue_count_cached > 0
    and s.year_start_cached is not null
    and (s.us_market is true or s.resolved_publisher_cached = any (allowed_publishers))
  order by
    case
      when s.title_normalized = v_compact then 1000::double precision
      when s.title_search_text = ' ' || v_spaced || ' '
        or s.title_search_text like ' ' || v_spaced || ' %'
        then 800::double precision
      when s.title_normalized like v_compact || '%'
        then (600 - least(300, length(s.title_normalized) - length(v_compact)))::double precision
      when s.title_normalized like '%' || v_compact || '%'
        then (500 - least(200, length(s.title_normalized) - length(v_compact)))::double precision
      else 400::double precision
    end desc,
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
    s.resolved_publisher_cached::text, s.featured_cover_path_cached::text, s.us_market
  from public.series s
  where s.title_normalized % v_compact
    and similarity(s.title_normalized, v_compact) >= 0.32
    and s.gcd_id is not null
    and s.issue_count_cached > 0
    and s.year_start_cached is not null
    and (s.us_market is true or s.resolved_publisher_cached = any (allowed_publishers))
  order by (100 + similarity(s.title_normalized, v_compact) * 100) desc, s.issue_count_cached desc
  limit v_limit;
end;
$$;

-- Rollback:
--   drop function if exists public.search_series_by_relevance_v2(text, text[], int);
