-- Run after scripts/migrations/0038_series_search_fuzzy.sql.
-- Uses the real US_PUBLISHER_ALLOWLIST (src/lib/publisher.js, 2026-10-05) so
-- visibility matches the site. Every boolean column must be true.
with allow as (select array['Marvel Comics','DC Comics','Image Comics','Dark Horse Comics','IDW Publishing','BOOM! Studios','Valiant Comics','Dynamite Entertainment','Archie Comics','Top Cow Comics','Vertigo','Mirage Studios','WildStorm','Oni Press','Caliber Comics','Eclipse Comics','First Comics','AfterShock Comics','Ahoy Comics','Black Mask Studios','AWA Studios','Now Comics','Fantagraphics','Avatar Press','Titan Comics','Antarctic Press','Zenescope Entertainment','VIZ Media','Archaia','Rebellion','Aspen Comics','Vault Comics','Skybound','Mad Cave Studios','Heavy Metal','Action Lab Entertainment','Devil''s Due','Dell Comics','Gold Key','Charlton Comics','Harvey Comics','EC Comics','Fawcett Comics','Atlas Comics','Topps Comics','Malibu Comics','Chaos! Comics','Udon Entertainment Corp.','Udon Comics','UDON','Aardvark-Vanaheim','Aardvark-Vanaheim Inc.','Aardvark-Vanaheim Press','Aardvark Vanaheim Press','Aardvark-Vanaheim Inc. and Renegade Press','Aardvark']::text[] as a)
select
  (select title = 'Cerebus' and year_start_cached = 1977
     from public.search_series_by_relevance('cerbus', (select a from allow), 1)) as cerbus_finds_cerebus_1977,
  (select title = 'Street Fighter II: The Animated Movie Official'
     from public.search_series_by_relevance('street fighter ii animated', (select a from allow), 1)) as sf2_animated_movie_first,
  (select title ilike '%street fighter%'
     from public.search_series_by_relevance('streetfighter', (select a from allow), 1)) as streetfighter_one_word,
  (select title ilike '%spider-man%'
     from public.search_series_by_relevance('spiderman', (select a from allow), 1)) as spiderman_no_hyphen,
  (select title = 'Absolute Batman' and year_start_cached = 2024
     from public.search_series_by_relevance('absolute batman', (select a from allow), 1)) as absolute_batman_first,
  (select title = 'X-O Manowar'
     from public.search_series_by_relevance('x o', (select a from allow), 1)) as xo_manowar_first;

-- Speed: run this one by itself twice; the second run's "Execution Time" at
-- the bottom should be under ~2800 ms.
-- explain analyze select * from public.search_series_by_relevance('x o', array['Marvel Comics','DC Comics','Image Comics','Dark Horse Comics','IDW Publishing','BOOM! Studios','Valiant Comics','Dynamite Entertainment','Archie Comics','Top Cow Comics','Vertigo','Mirage Studios','WildStorm','Oni Press','Caliber Comics','Eclipse Comics','First Comics','AfterShock Comics','Ahoy Comics','Black Mask Studios','AWA Studios','Now Comics','Fantagraphics','Avatar Press','Titan Comics','Antarctic Press','Zenescope Entertainment','VIZ Media','Archaia','Rebellion','Aspen Comics','Vault Comics','Skybound','Mad Cave Studios','Heavy Metal','Action Lab Entertainment','Devil''s Due','Dell Comics','Gold Key','Charlton Comics','Harvey Comics','EC Comics','Fawcett Comics','Atlas Comics','Topps Comics','Malibu Comics','Chaos! Comics','Udon Entertainment Corp.','Udon Comics','UDON','Aardvark-Vanaheim','Aardvark-Vanaheim Inc.','Aardvark-Vanaheim Press','Aardvark Vanaheim Press','Aardvark-Vanaheim Inc. and Renegade Press','Aardvark']::text[], 1000);
