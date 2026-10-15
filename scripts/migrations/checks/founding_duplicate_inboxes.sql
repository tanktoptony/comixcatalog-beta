select
  public.normalize_email(u.email) as normalized_inbox,
  count(*)::int as founder_count,
  pg_catalog.array_agg(p.id order by p.created_at, p.id) as founder_ids,
  pg_catalog.array_agg(u.email order by p.created_at, p.id) as emails
from public.profiles p
join auth.users u on u.id = p.id
where p.is_founding_collector
group by public.normalize_email(u.email)
having count(*) > 1
order by founder_count desc, normalized_inbox;
