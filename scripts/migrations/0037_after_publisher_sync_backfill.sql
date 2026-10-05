-- Run once only after syncGcdPublishers.js has completed a full publisher pass.
-- The allowlist clause preserves every series visible before this change.
update public.series s
set us_market = (
  coalesce(gp.country, '') = 'us'
  or (
    coalesce(gp.country, '') = 'ca'
    and lower(coalesce(gp.name, '')) not in (
      'les editions heritage',
      'les editions héritage',
      'les éditions heritage',
      'les éditions héritage',
      'editions heritage',
      'editions héritage',
      'éditions heritage',
      'éditions héritage'
    )
  )
  or s.resolved_publisher_cached = any(array[
    'Marvel Comics','DC Comics','Image Comics','Dark Horse Comics',
    'IDW Publishing','BOOM! Studios','Valiant Comics','Dynamite Entertainment',
    'Archie Comics','Top Cow Comics','Vertigo','Mirage Studios','WildStorm',
    'Oni Press','Caliber Comics','Eclipse Comics','First Comics',
    'AfterShock Comics','Ahoy Comics','Black Mask Studios','AWA Studios',
    'Now Comics','Fantagraphics','Avatar Press','Titan Comics',
    'Antarctic Press','Zenescope Entertainment','VIZ Media','Archaia',
    'Rebellion','Aspen Comics','Vault Comics','Skybound','Mad Cave Studios',
    'Heavy Metal','Action Lab Entertainment','Devil''s Due','Dell Comics',
    'Gold Key','Charlton Comics','Harvey Comics','EC Comics','Fawcett Comics',
    'Atlas Comics','Topps Comics','Malibu Comics','Chaos! Comics',
    'Udon Entertainment Corp.','Udon Comics'
  ]::text[])
)
from public.gcd_series gs
left join public.gcd_publishers gp on gp.gcd_id = gs.publisher_gcd_id
where gs.gcd_id = s.gcd_id;
