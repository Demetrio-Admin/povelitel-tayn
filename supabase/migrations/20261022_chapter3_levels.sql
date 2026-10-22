-- v0.40: глава III «Безымянная роща» — уровни героя 16–20 и граница уровня до начала главы.
-- Уровни 16–20 выдаются только после события ch3_start; до него опыт копится, а уровень не выше 15 (повторные бои глав I–II
-- не должны открывать 16–20 без сюжета). Повторяемо: таблица порогов обновляется, _grant заменяется.
begin;
alter table public.game_hero_levels add column if not exists max_hp int, add column if not exists max_mana int;
insert into public.game_hero_levels (level, xp, max_hp, max_mana) values
  (1, 0, 120, 100), (2, 60, 126, 110), (3, 150, 132, 110), (4, 270, 138, 115), (5, 430, 144, 120),
  -- v0.10.0: уровни 6–10 (первая глава)
  (6, 650, 152, 125), (7, 940, 160, 135), (8, 1300, 170, 140), (9, 1750, 180, 145), (10, 2350, 190, 155),
  -- v0.18.0: уровни 11–15 (глава II)
  (11, 3100, 202, 165), (12, 4000, 214, 175), (13, 5100, 226, 185), (14, 6400, 240, 195), (15, 7900, 255, 205),
  -- v0.38.0: уровни 16–20 (глава III «Безымянная роща»)
  (16, 9600, 270, 215), (17, 11500, 285, 225), (18, 13600, 300, 235), (19, 15900, 316, 245), (20, 18400, 332, 255)
  on conflict (level) do update set xp = excluded.xp, max_hp = excluded.max_hp, max_mana = excluded.max_mana;
create or replace function public._grant(uid uuid, pr player_progress, reward jsonb) returns player_progress
language plpgsql security definer set search_path = public as $$
declare before int; lvl int; mx_hp numeric; mx_mana numeric; k text; v jsonb;
begin
  if coalesce((reward ->> 'heroXP')::numeric, 0) > 0 or coalesce((reward -> 'topUp' ->> 'heroXP')::numeric, 0) > 0 then
    before := pr.hero_level;
    pr.hero_xp := _clamp(greatest(pr.hero_xp + coalesce((reward ->> 'heroXP')::numeric, 0), coalesce((reward -> 'topUp' ->> 'heroXP')::numeric, 0)), 0, 100000000);
    -- v0.40: уровни 16–20 открывает глава III (событие ch3_start); до неё опыт копится, а уровень не выше 15
    lvl := greatest(pr.hero_level, coalesce((select max(level) from game_hero_levels where xp <= pr.hero_xp and (level <= 15 or _has_event(uid, 'ch3_start'))), 1));
    if lvl > before then
      select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = before;
      if pr.hp is null then pr.hp := mx_hp; end if;
      if pr.mana is null then pr.mana := mx_mana; end if;
    end if;
    pr.hero_level := lvl;
  end if;
  if coalesce((reward ->> 'coins')::numeric, 0) <> 0 then perform _inv_add(uid, 'coins', (reward ->> 'coins')::numeric); end if;
  for k, v in select * from jsonb_each(coalesce(reward -> 'items', '{}'::jsonb)) order by key collate "C" loop perform _award_item(uid, k, (v #>> '{}')::numeric); end loop;
  for k, v in select * from jsonb_each(coalesce(reward -> 'schoolXP', '{}'::jsonb)) loop
    pr.school_xp := jsonb_set(pr.school_xp, array[k], to_jsonb(_clamp(coalesce((pr.school_xp ->> k)::numeric, 0) + (v #>> '{}')::numeric, 0, 1000000000)));
  end loop;
  for k, v in select * from jsonb_each(coalesce(reward -> 'topUp' -> 'school', '{}'::jsonb)) loop
    pr.school_xp := jsonb_set(pr.school_xp, array[k], to_jsonb(greatest(coalesce((pr.school_xp ->> k)::numeric, 0), (v #>> '{}')::numeric)));
  end loop;
  for k, v in select * from jsonb_each(coalesce(reward -> 'topUp' -> 'items', '{}'::jsonb)) loop
    perform _award_item(uid, k, greatest(0, (v #>> '{}')::numeric - _inv(uid, k) - coalesce((_bag(uid)->'pending'->>k)::numeric,0)));
  end loop;
  return pr;
end $$;

-- Враги главы III в каталоге профиля героя (hero_enemy_catalog / hero_enemy_spawns): без них победы в роще не попадают в профиль.
insert into public.hero_enemy_catalog(enemy,level,difficulty,rank) values
('glass_stoat',16,'normal',1600),
('echo_wisp',17,'normal',1700),
('glass_wolf',17,'normal',1701),
('needle',18,'normal',1800),
('needle_elite',18,'elite',1810),
('glass_guardian',19,'elite',1910),
('iva_reflection',20,'boss',2020)
on conflict(enemy) do update set level=excluded.level,difficulty=excluded.difficulty,rank=excluded.rank;
insert into public.hero_enemy_spawns(spawn,enemy) values
('gb_stoat_1','glass_stoat'),
('gb_stoat_2','glass_stoat'),
('ge_echo_1','echo_wisp'),
('ge_echo_2','echo_wisp'),
('gg_wolf_1','glass_wolf'),
('gg_wolf_2','glass_wolf'),
('gr_needle_1','needle'),
('gr_needle_2','needle'),
('gr_needle_elite','needle_elite'),
('gh_guardian','glass_guardian'),
('gh_reflection','iva_reflection')
on conflict(spawn) do update set enemy=excluded.enemy;
commit;
