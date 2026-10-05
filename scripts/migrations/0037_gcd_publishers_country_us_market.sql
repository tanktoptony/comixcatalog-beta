-- Run after 0034-0036, whose numbers are reserved by slop-remediation-spec.md.
alter table public.gcd_publishers
  add column if not exists country text,
  add column if not exists synced_at timestamptz;

create unique index if not exists gcd_publishers_gcd_id_uidx
  on public.gcd_publishers (gcd_id);

alter table public.series
  add column if not exists us_market boolean;

create index if not exists series_us_market_search_idx
  on public.series (title_normalized, issue_count_cached desc)
  where us_market is true;

drop function if exists public.search_series_by_relevance(text, text[], int);

create function public.search_series_by_relevance(
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
  select s.id, s.gcd_id, s.title, s.issue_count_cached,
         s.year_start_cached, s.year_end_cached,
         s.resolved_publisher_cached, s.featured_cover_path_cached,
         s.us_market
  from public.series s
  where s.gcd_id is not null
    and s.issue_count_cached > 0
    and s.year_start_cached is not null
    and (s.us_market is true or s.resolved_publisher_cached = any(allowed_publishers))
    and s.title_normalized ilike '%' || normalized_term || '%'
  order by
    case
      when s.title_normalized = normalized_term then 1000
      when lower(s.title) ~ ('^' || normalized_term || '[^a-z0-9]') then 800
      when s.title_normalized like normalized_term || '%'
        then 600 - least(300, length(s.title_normalized) - length(normalized_term))
      else 250 - least(200, length(s.title_normalized) - length(normalized_term))
    end desc,
    s.issue_count_cached desc
  limit result_limit;
$$;
