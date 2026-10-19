-- 0081: us_market = false is final in series search.
--
-- Search let a series through when us_market was true OR its resolved
-- publisher was on the US allowlist. Foreign editions (Panini Deutschland,
-- Editora Abril, Norma...) resolve to "DC Comics" or "Marvel Comics", so the
-- allowlist kept them in US search even after us_market was corrected. The
-- allowlist now only decides for rows whose us_market is unknown (null).
-- Body taken from the live definition (pg_get_functiondef) with only those
-- two conditions changed. APPLIED IN PROD 2026-10-18.

begin;

CREATE OR REPLACE FUNCTION public.search_series_by_relevance_v2(normalized_term text, allowed_publishers text[], result_limit integer DEFAULT 400)
 RETURNS TABLE(id uuid, gcd_id integer, title text, issue_count_cached integer, year_start_cached integer, year_end_cached integer, resolved_publisher_cached text, featured_cover_path_cached text, us_market boolean, reprint_count integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
    and (s.us_market is true or (s.us_market is null and s.resolved_publisher_cached = any (allowed_publishers)))
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
    and (s.us_market is true or (s.us_market is null and s.resolved_publisher_cached = any (allowed_publishers)))
  order by (100 + similarity(s.title_normalized, v_compact) * 100) desc,
    s.reprint_count desc,
    s.issue_count_cached desc
  limit v_limit;
end;
$function$;

commit;

-- Rollback: re-run this file with both conditions changed back to
--   (s.us_market is true or s.resolved_publisher_cached = any (allowed_publishers))
