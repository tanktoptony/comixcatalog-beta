-- Rollback: drop the column and revert the type (fixture)
alter table public.series add column note text;
alter table public.profiles alter column bio type text;
update public.profiles set bio = '' where bio is null;
