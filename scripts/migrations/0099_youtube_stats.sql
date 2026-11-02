begin;

-- Reporting API reach arrives daily and may be corrected later. Keeping the
-- weighted click numerator lets weekly CTR be recomputed without averaging.
create table public.youtube_reach_daily (
  day date not null,
  video_id text not null,
  impressions bigint not null default 0,
  clicks numeric not null default 0,
  imported_at timestamptz not null default now(),
  primary key (day, video_id)
);

-- Report ids make imports idempotent while still allowing newer reports to
-- overwrite corrected daily reach rows.
create table public.youtube_report_imports (
  report_id text primary key,
  report_type text not null,
  start_time timestamptz,
  end_time timestamptz,
  rows integer not null default 0,
  imported_at timestamptz not null default now()
);

-- Weekly snapshots keep email and reporting reads independent of Google API
-- availability and retain the video metadata shown in summaries.
create table public.youtube_weekly_video_stats (
  week_start date not null,
  video_id text not null,
  title text,
  duration_seconds integer,
  published_at timestamptz,
  views bigint not null default 0,
  watch_minutes numeric not null default 0,
  subscribers_gained integer not null default 0,
  subscribers_lost integer not null default 0,
  impressions bigint,
  impressions_ctr numeric,
  updated_at timestamptz not null default now(),
  primary key (week_start, video_id)
);

create table public.youtube_weekly_channel_stats (
  week_start date primary key,
  views bigint not null default 0,
  watch_minutes numeric not null default 0,
  subscribers_gained integer not null default 0,
  subscribers_lost integer not null default 0,
  impressions bigint,
  impressions_ctr numeric,
  updated_at timestamptz not null default now()
);

-- These ingestion tables are deliberately service-role only.
alter table public.youtube_reach_daily enable row level security;
alter table public.youtube_report_imports enable row level security;
alter table public.youtube_weekly_video_stats enable row level security;
alter table public.youtube_weekly_channel_stats enable row level security;
revoke all on public.youtube_reach_daily from anon, authenticated;
revoke all on public.youtube_report_imports from anon, authenticated;
revoke all on public.youtube_weekly_video_stats from anon, authenticated;
revoke all on public.youtube_weekly_channel_stats from anon, authenticated;

commit;

-- Rollback:
-- drop table if exists public.youtube_weekly_channel_stats;
-- drop table if exists public.youtube_weekly_video_stats;
-- drop table if exists public.youtube_report_imports;
-- drop table if exists public.youtube_reach_daily;
