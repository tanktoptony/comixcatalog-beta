-- 0109_new_user_default_avatar.sql
--
-- New accounts no longer get the red-mask avatar (hero_01) stamped on them.
--
-- handle_new_user() wrote coalesce(avatar_key, 'hero_01'), so every signup
-- that didn't pick an avatar got the same mask. That bypassed the 12 CC badge
-- colorways (#275), which avatarForProfile() only uses when avatar_key is
-- null. On 2026-11-20, 30 of 51 profiles wore the identical mask, and the
-- Founding Collectors wall was mostly one icon.
--
-- The function body is otherwise unchanged from production. The 30 existing
-- mask-only profiles were reset to null separately (rollback list kept
-- outside the repo).
--
-- Rollback:
--   rerun this function with the insert's avatar_key value set back to
--   coalesce(new.raw_user_meta_data->>'avatar_key', 'hero_01'). To restore
--   the reset profiles, set avatar_key = 'hero_01' for the ids in
--   relink/2026-11-20-mask-avatar-rollback.json.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  base_username text;
  final_username text;
  suffix_num integer := 0;
begin
  base_username := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');

  if base_username is null or length(base_username) < 3 then
    base_username := 'user';
  end if;

  final_username := left(base_username, 20);

  while exists (
    select 1
    from public.profiles
    where username = final_username
  ) loop
    suffix_num := suffix_num + 1;
    final_username := left(base_username, greatest(1, 20 - length(suffix_num::text))) || suffix_num::text;
  end loop;

  insert into public.profiles (
    id,
    username,
    avatar_key,
    is_public
  )
  values (
    new.id,
    final_username,
    nullif(new.raw_user_meta_data->>'avatar_key', ''),
    true
  );

  return new;
end;
$function$;
