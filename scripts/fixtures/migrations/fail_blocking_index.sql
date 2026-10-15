-- Rollback: drop index if exists idx_series_title;
create index idx_series_title on public.series (title);
