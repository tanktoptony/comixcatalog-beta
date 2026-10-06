insert into storage.buckets (id, name, public)
values ('cover-scans', 'cover-scans', false)
on conflict (id) do update set public = false;

create table if not exists public.cover_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  storage_path text,
  model text,
  extracted jsonb,
  candidates jsonb,
  outcome text not null check (outcome in ('matched','not_in_catalog','not_a_comic','error','capped')),
  chosen_gcd_issue_id integer,
  input_tokens integer,
  output_tokens integer
);
create index if not exists cover_scans_user_created_idx on public.cover_scans(user_id, created_at desc);
alter table public.cover_scans enable row level security;
create policy "Users can read own cover scans" on public.cover_scans for select using (auth.uid() = user_id);
create policy "Owners can read their cover scan photos" on storage.objects for select using (bucket_id = 'cover-scans' and (storage.foldername(name))[1] = auth.uid()::text);
