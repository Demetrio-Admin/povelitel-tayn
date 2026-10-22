-- v0.40: глава III «Безымянная роща» — уровни героя 16–20 и враги рощи в профиле героя.
-- Уровень, как и раньше, считается по опыту без дополнительных границ. Повторяемо: таблица порогов обновляется.
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
