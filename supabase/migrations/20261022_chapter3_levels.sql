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
commit;
