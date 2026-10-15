-- Rollback: drop index concurrently if exists idx_series_title;
create index concurrently idx_series_title on public.series (title);
