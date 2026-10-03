-- Witch RPG v0.6: серверный игрок (Supabase). Схема v2 (+ v0.9: мана, максимумы HP/маны по уровню, player_action).
-- Выполните целиком: Supabase → SQL Editor → New query → Run. Скрипт можно запускать повторно.
--
-- Модель: у каждого игрока (в том числе гостя) есть постоянный user_id из Supabase Auth. Всё, что принадлежит игроку,
-- лежит в таблицах с user_id. Ник — это публичное имя, уникальный логин и ничего больше; ключом он нигде не служит.
-- Клиент ничего не пишет в таблицы напрямую: только вызывает функции ниже, а они сами проверяют auth.uid().
-- Пароли хранит Supabase Auth (bcrypt) — в этих таблицах паролей нет.

-- ---------------------------------------------------------------- наследие v1
-- Облачные «сейвы целиком» больше не используются: старая таблица откладывается, а не удаляется.
do $$ begin
  if to_regclass('public.saves') is not null and to_regclass('public.legacy_saves') is null then
    alter table public.saves rename to legacy_saves;
  end if;
end $$;
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.nickname_available(text);

-- ---------------------------------------------------------------- профиль
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.profiles
  add column if not exists nickname            text,   -- как написал игрок; null у гостя
  add column if not exists nickname_normalized text,   -- нижний регистр; по нему проверяются уникальность и вход
  add column if not exists hero_id             text,
  add column if not exists last_seen_at        timestamptz not null default now(),
  add column if not exists registered_at       timestamptz;   -- когда гость выбрал ник
alter table public.profiles alter column nickname drop not null;
alter table public.profiles add column if not exists legacy_nickname text;
-- аккаунты из v1 (вход по почте) на ники не переносятся: прежнее имя сохраняем справочно, а ник освобождаем
update public.profiles set legacy_nickname = nickname, nickname = null where nickname is not null and nickname_normalized is null;
alter table public.profiles drop constraint if exists nickname_len;
alter table public.profiles drop constraint if exists nickname_format;
alter table public.profiles drop constraint if exists nickname_valid;
alter table public.profiles drop constraint if exists nickname_pair;
alter table public.profiles drop constraint if exists hero_valid;
alter table public.profiles add constraint nickname_valid check (nickname is null or nickname ~ '^[A-Za-zА-Яа-яЁё0-9_]{3,20}$');
alter table public.profiles add constraint nickname_pair  check ((nickname is null) = (nickname_normalized is null)
                                                               and (nickname_normalized is null or nickname_normalized ~ '^[a-zа-яё0-9_]{3,20}$'));
alter table public.profiles add constraint hero_valid     check (hero_id is null or hero_id ~ '^[a-z0-9_]{1,32}$');
drop index if exists public.profiles_nickname_key;
-- уникальность гарантирует сама база: два одновременных «Дмитрий» не пройдут
create unique index if not exists profiles_nickname_normalized_key on public.profiles (nickname_normalized) where nickname_normalized is not null;

-- ---------------------------------------------------------------- прогресс и мир игрока
create table if not exists public.player_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  rev        bigint  not null default 0,        -- растёт с каждым изменением
  hero_level int     not null default 1 check (hero_level between 1 and 100),
  hero_xp    bigint  not null default 0 check (hero_xp between 0 and 100000000),
  school_xp  jsonb   not null default '{"telekinesis":0,"fire":0,"seal":0}',
  research   jsonb,                              -- идущее изучение дара или null
  pos_x      double precision, pos_y double precision,                  -- null: ещё не ходил, клиент ставит стартовую точку
  safe_x     double precision, safe_y double precision,
  hp         double precision,
  play_ms    bigint  not null default 0,
  combats    jsonb   not null default '[]',      -- последние 50 боёв
  tutorial   jsonb   not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.player_progress
  add column if not exists recent_syncs jsonb not null default '[]';  -- id последних сохранений: повтор после обрыва связи не начислит дважды
-- v0.9: текущая мана (null — «полный запас», как у hp; старые персонажи получают максимум при первой загрузке клиентом)
alter table public.player_progress add column if not exists mana double precision;
alter table public.player_progress
  alter column pos_x type double precision, alter column pos_y type double precision,
  alter column safe_x type double precision, alter column safe_y type double precision, alter column hp type double precision;
create table if not exists public.player_inventory (
  user_id  uuid not null references auth.users (id) on delete cascade,
  item_id  text not null check (item_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  quantity bigint not null default 0 check (quantity between 0 and 1000000000),
  primary key (user_id, item_id)
);
create table if not exists public.player_abilities (
  user_id    uuid not null references auth.users (id) on delete cascade,
  ability_id text not null check (ability_id in ('telekinesis', 'fire', 'seal')),
  level      int  not null default 0 check (level between 0 and 10),
  unlocked   boolean not null default false,
  primary key (user_id, ability_id)
);
create table if not exists public.player_quests (
  user_id    uuid not null references auth.users (id) on delete cascade,
  quest_id   text not null check (quest_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  status     text not null default 'done',
  progress   jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);
-- открытые пути, побеждённые враги, состояние предметов мира
create table if not exists public.player_world (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null check (kind in ('path', 'enemy', 'object')),
  key     text not null check (key ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  data    jsonb,
  primary key (user_id, kind, key)
);

-- ---------------------------------------------------------------- правила игры, которые знает сервер
-- Пороги уровней героя (те же, что HERO_LEVELS в src/config/balance.hero.js; совпадение проверяет tools/sql/diff-test.mjs).
-- Уровень считает сервер по опыту — клиент не может просто прислать «уровень 100».
create table if not exists public.game_hero_levels (
  level int primary key check (level between 1 and 100),
  xp    bigint not null check (xp >= 0)
);
-- v0.9: максимум HP и маны уровня — сервер не примет запас больше максимума
alter table public.game_hero_levels add column if not exists max_hp int, add column if not exists max_mana int;
insert into public.game_hero_levels (level, xp, max_hp, max_mana) values
  (1, 0, 120, 100), (2, 60, 126, 110), (3, 150, 132, 110), (4, 270, 138, 115), (5, 430, 144, 120),
  -- v0.10.0: уровни 6–10 (первая глава)
  (6, 650, 152, 125), (7, 940, 160, 135), (8, 1300, 170, 140), (9, 1750, 180, 145), (10, 2350, 190, 155)
  on conflict (level) do update set xp = excluded.xp, max_hp = excluded.max_hp, max_mana = excluded.max_mana;
alter table public.game_hero_levels enable row level security;

-- ---------------------------------------------------------------- Row Level Security
alter table public.profiles         enable row level security;
alter table public.player_progress  enable row level security;
alter table public.player_inventory enable row level security;
alter table public.player_abilities enable row level security;
alter table public.player_quests    enable row level security;
alter table public.player_world     enable row level security;

do $$ declare t text; r record; begin
  -- старые политики v1 и прошлых запусков убираем, чтобы не осталось лазеек
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('profiles','player_progress','player_inventory','player_abilities','player_quests','player_world')
  loop execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
  foreach t in array array['player_progress','player_inventory','player_abilities','player_quests','player_world'] loop
    execute format('create policy "свои данные: чтение" on public.%I for select to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;
create policy "свои данные: чтение" on public.profiles for select to authenticated using (id = auth.uid());
-- политик на запись нет: клиент меняет данные только через функции ниже

revoke all on public.profiles, public.player_progress, public.player_inventory, public.player_abilities, public.player_quests, public.player_world, public.game_hero_levels from anon, authenticated;
grant select on public.profiles, public.player_progress, public.player_inventory, public.player_abilities, public.player_quests, public.player_world to authenticated;

-- ---------------------------------------------------------------- вспомогательное
-- число из jsonb или null (не число, слишком большое)
create or replace function public._num(j jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(j) = 'number' and abs((j #>> '{}')::numeric) < 1e15 then (j #>> '{}')::numeric end
$$;
create or replace function public._clamp(v numeric, lo numeric, hi numeric) returns numeric language sql immutable as $$
  select least(hi, greatest(lo, v))
$$;
create or replace function public._valid_id(s text) returns boolean language sql immutable as $$
  select s ~ '^[A-Za-z0-9_.:-]{1,64}$'
$$;

-- Полное состояние игрока одним jsonb. Те же поля, что в src/cloud/playerModel.js (toSnapshot) + блок meta.
create or replace function public._snapshot(uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr player_progress%rowtype; pf profiles%rowtype;
begin
  select * into pr from player_progress where user_id = uid;
  select * into pf from profiles where id = uid;
  if pr.user_id is null then return null; end if;
  return jsonb_build_object(
    'level', pr.hero_level, 'xp', pr.hero_xp, 'school', pr.school_xp,
    'abilities', coalesce((select jsonb_object_agg(ability_id, jsonb_build_object('level', level, 'unlocked', unlocked)) from player_abilities where user_id = uid), '{}'::jsonb),
    'inventory', coalesce((select jsonb_object_agg(item_id, quantity) from player_inventory where user_id = uid), '{}'::jsonb),
    'quests',    coalesce((select jsonb_agg(quest_id order by quest_id) from player_quests where user_id = uid and status = 'done'), '[]'::jsonb),
    'paths',     coalesce((select jsonb_agg(key order by key) from player_world where user_id = uid and kind = 'path'), '[]'::jsonb),
    'enemies',   coalesce((select jsonb_agg(key order by key) from player_world where user_id = uid and kind = 'enemy'), '[]'::jsonb),
    'objects',   coalesce((select jsonb_object_agg(key, data) from player_world where user_id = uid and kind = 'object'), '{}'::jsonb),
    'research', pr.research,
    'pos',  case when pr.pos_x  is null then null else jsonb_build_object('x', pr.pos_x,  'y', pr.pos_y)  end,
    'safe', case when pr.safe_x is null then null else jsonb_build_object('x', pr.safe_x, 'y', pr.safe_y) end,
    'hp', pr.hp, 'mana', pr.mana, 'play', pr.play_ms, 'combats', pr.combats, 'tutorial', pr.tutorial,
    'meta', jsonb_build_object('hero', pf.hero_id, 'nickname', pf.nickname, 'registered', pf.nickname is not null,
                               'rev', pr.rev, 'createdAt', pf.created_at, 'registeredAt', pf.registered_at, 'lastSeenAt', pf.last_seen_at)
  );
end $$;

-- ---------------------------------------------------------------- «ник свободен?» (подсказка в форме; настоящая защита — индекс)
create or replace function public.nickname_available(norm text) returns boolean
language sql security definer stable set search_path = public as $$
  select norm ~ '^[a-zа-яё0-9_]{3,20}$' and not exists (select 1 from public.profiles where nickname_normalized = norm);
$$;

-- ---------------------------------------------------------------- создание и загрузка игрока
-- Вызывается один раз после появления пользователя (гость — анонимный пользователь Supabase). Повторный вызов ничего не портит.
create or replace function public.create_player(hero text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if hero is null or hero !~ '^[a-z0-9_]{1,32}$' then raise exception 'invalid_hero' using errcode = '22023'; end if;
  insert into profiles (id, hero_id) values (uid, hero) on conflict (id) do update set hero_id = coalesce(profiles.hero_id, excluded.hero_id);
  insert into player_progress (user_id) values (uid) on conflict (user_id) do nothing;
  return _snapshot(uid);
end $$;

-- Состояние игрока или null, если персонажа ещё нет.
create or replace function public.get_player() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update profiles set last_seen_at = now() where id = uid;
  return _snapshot(uid);
end $$;

-- Новая игра: стирает прогресс этого же игрока и выдаёт нового героя. Ник и user_id сохраняются.
create or replace function public.reset_player(hero text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if hero is null or hero !~ '^[a-z0-9_]{1,32}$' then raise exception 'invalid_hero' using errcode = '22023'; end if;
  perform 1 from player_progress where user_id = uid for update;
  delete from player_inventory where user_id = uid;
  delete from player_abilities where user_id = uid;
  delete from player_quests    where user_id = uid;
  delete from player_world     where user_id = uid;
  insert into profiles (id, hero_id) values (uid, hero) on conflict (id) do update set hero_id = excluded.hero_id, last_seen_at = now();
  insert into player_progress (user_id) values (uid)
    on conflict (user_id) do update set rev = player_progress.rev + 1, hero_level = 1, hero_xp = 0,
      school_xp = '{"telekinesis":0,"fire":0,"seal":0}', research = null, pos_x = null, pos_y = null, safe_x = null, safe_y = null,
      hp = null, mana = null, play_ms = 0, combats = '[]', tutorial = '[]', updated_at = now();
  return _snapshot(uid);
end $$;

-- ---------------------------------------------------------------- сохранение: слияние изменений
-- patch — не весь сейв, а то, что изменилось (см. src/cloud/playerModel.js). Всё в одной транзакции, строка игрока заблокирована:
-- два устройства по очереди слияются, а не затирают друг друга. Лимиты ниже отсекают явные подделки.
create or replace function public.sync_player(patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pr player_progress%rowtype;
  k text; v jsonb; n numeric; q numeric; cnt int; arr jsonb; mx_hp numeric; mx_mana numeric;
  max_spend   constant numeric := 100000000;  -- тратить можно сколько есть
  max_counter constant numeric := 1000000000;
  -- Сколько можно получить за одно сохранение. Самая большая награда игры сейчас — 220 опыта и 80 монет (Страж узла, v0.10),
  -- клиент сохраняет через секунду после события, поэтому честная игра в эти потолки не упирается.
  gain_xp     constant numeric := 1000;
  gain_school constant numeric := 500;
  gain_coins  constant numeric := 500;
  gain_item   constant numeric := 50;
  gain_play   constant numeric := 600000;     -- 10 минут
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if patch is null or jsonb_typeof(patch) <> 'object' then raise exception 'bad_patch' using errcode = '22023'; end if;
  select * into pr from player_progress where user_id = uid for update;
  if not found then raise exception 'no_player' using errcode = 'P0002'; end if;
  -- повтор того же сохранения (ответ потерялся в сети): ничего не применяем, просто отдаём состояние
  if jsonb_typeof(patch -> 'id') = 'string' and pr.recent_syncs ? (patch ->> 'id') then
    return _snapshot(uid);
  end if;
  if jsonb_typeof(patch -> 'id') = 'string' and char_length(patch ->> 'id') between 8 and 64 then
    pr.recent_syncs := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from (
      select e, i from jsonb_array_elements(pr.recent_syncs || to_jsonb(patch ->> 'id')) with ordinality as t(e, i) order by i desc limit 20) z);
  end if;

  -- опыт героя только растёт (не больше gain_xp за раз), уровень сервер считает сам по таблице порогов
  n := _num(patch -> 'xp');
  if n is not null then pr.hero_xp := _clamp(least(greatest(pr.hero_xp, trunc(n)), pr.hero_xp + gain_xp), 0, 100000000); end if;
  pr.hero_level := greatest(pr.hero_level, coalesce((select max(level) from game_hero_levels where xp <= pr.hero_xp), 1));

  -- опыт даров: дельта (может быть отрицательной — трата на изучение)
  if jsonb_typeof(patch -> 'school') = 'object' then
    foreach k in array array['telekinesis', 'fire', 'seal'] loop
      n := _num(patch -> 'school' -> k);
      if n is not null then
        pr.school_xp := jsonb_set(pr.school_xp, array[k], to_jsonb(_clamp(coalesce((pr.school_xp ->> k)::numeric, 0) + _clamp(trunc(n), -max_spend, gain_school), 0, max_counter)));
      end if;
    end loop;
  end if;

  -- предметы: дельты
  if jsonb_typeof(patch -> 'inv') = 'object' then
    for k, v in select * from jsonb_each(patch -> 'inv') loop
      n := _num(v);
      if n is null or not _valid_id(k) then continue; end if;
      select quantity into q from player_inventory where user_id = uid and item_id = k;
      if not found then
        select count(*) into cnt from player_inventory where user_id = uid;
        if cnt >= 100 then continue; end if;
        q := 0;
      end if;
      insert into player_inventory (user_id, item_id, quantity)
        values (uid, k, _clamp(q + _clamp(trunc(n), -max_spend, case when k = 'coins' then gain_coins else gain_item end), 0, max_counter))
        on conflict (user_id, item_id) do update set quantity = excluded.quantity;
    end loop;
  end if;

  -- дары: уровень только растёт, «открыто» только включается
  if jsonb_typeof(patch -> 'abilities') = 'object' then
    for k, v in select * from jsonb_each(patch -> 'abilities') loop
      continue when k not in ('telekinesis', 'fire', 'seal') or jsonb_typeof(v) <> 'object';
      n := coalesce(_num(v -> 'level'), 0);
      insert into player_abilities (user_id, ability_id, level, unlocked)
        values (uid, k, _clamp(trunc(n), 0, 10), coalesce((v -> 'unlocked') = 'true'::jsonb, false))
        on conflict (user_id, ability_id) do update
          set level = _clamp(greatest(player_abilities.level, trunc(n)), 0, 10), unlocked = player_abilities.unlocked or excluded.unlocked;
    end loop;
  end if;

  -- события (задания и сюжет): только добавляются
  if jsonb_typeof(patch -> 'quests') = 'array' then
    for v in select * from jsonb_array_elements(patch -> 'quests') loop
      continue when jsonb_typeof(v) <> 'string' or not _valid_id(v #>> '{}');
      select count(*) into cnt from player_quests where user_id = uid;
      continue when cnt >= 1000;
      insert into player_quests (user_id, quest_id) values (uid, v #>> '{}') on conflict do nothing;
    end loop;
  end if;
  -- открытые пути и побеждённые враги: только добавляются
  for k, arr in select 'path'::text, patch -> 'paths' union all select 'enemy'::text, patch -> 'enemies' loop
    continue when jsonb_typeof(arr) <> 'array';
    for v in select * from jsonb_array_elements(arr) loop
      continue when jsonb_typeof(v) <> 'string' or not _valid_id(v #>> '{}');
      select count(*) into cnt from player_world where user_id = uid and kind = k;
      continue when cnt >= 1000;
      insert into player_world (user_id, kind, key) values (uid, k, v #>> '{}') on conflict do nothing;
    end loop;
  end loop;
  -- состояние предметов мира: последний записал
  if jsonb_typeof(patch -> 'objects') = 'object' then
    for k, v in select * from jsonb_each(patch -> 'objects') loop
      continue when not _valid_id(k);
      if jsonb_typeof(v) = 'null' then
        delete from player_world where user_id = uid and kind = 'object' and key = k;
      elsif jsonb_typeof(v) = 'object' then
        if not exists (select 1 from player_world where user_id = uid and kind = 'object' and key = k) then
          select count(*) into cnt from player_world where user_id = uid and kind = 'object';
          continue when cnt >= 500;
        end if;
        insert into player_world (user_id, kind, key, data) values (uid, 'object', k, v)
          on conflict (user_id, kind, key) do update set data = excluded.data;
      end if;
    end loop;
  end if;

  -- изучение, позиция, точка возрождения, здоровье: последний записал
  if jsonb_typeof(patch -> 'research') = 'object' and (patch -> 'research') ? 'value' then
    pr.research := case when jsonb_typeof(patch -> 'research' -> 'value') = 'object' then patch -> 'research' -> 'value' else null end;
  end if;
  if jsonb_typeof(patch -> 'pos') = 'object' and _num(patch -> 'pos' -> 'x') is not null and _num(patch -> 'pos' -> 'y') is not null then
    pr.pos_x := _num(patch -> 'pos' -> 'x'); pr.pos_y := _num(patch -> 'pos' -> 'y');
  end if;
  if jsonb_typeof(patch -> 'safe') = 'object' and _num(patch -> 'safe' -> 'x') is not null and _num(patch -> 'safe' -> 'y') is not null then
    pr.safe_x := _num(patch -> 'safe' -> 'x'); pr.safe_y := _num(patch -> 'safe' -> 'y');
  end if;
  -- HP и мана: последний записал, в пределах 0…максимум текущего уровня (v0.9)
  select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = pr.hero_level;
  if mx_hp is null then select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels order by level desc limit 1; end if;
  if jsonb_typeof(patch -> 'hp') = 'object' and (patch -> 'hp') ? 'value' then
    n := _num(patch -> 'hp' -> 'value'); pr.hp := case when n is null then null else _clamp(n, 0, mx_hp) end;   -- null — «полный запас»
  end if;
  if jsonb_typeof(patch -> 'mana') = 'object' and (patch -> 'mana') ? 'value' then
    n := _num(patch -> 'mana' -> 'value'); pr.mana := case when n is null then null else _clamp(n, 0, mx_mana) end;
  end if;

  -- время игры: дельта (за раз не больше 10 минут)
  n := _num(patch -> 'play'); if n is not null then pr.play_ms := pr.play_ms + _clamp(trunc(n), 0, gain_play); end if;
  -- история боёв: дописывается, хранятся последние 50
  if jsonb_typeof(patch -> 'combats') = 'array' then
    select coalesce(jsonb_agg(e order by i), '[]'::jsonb) into pr.combats from (
      select e, i from jsonb_array_elements(pr.combats || coalesce((select jsonb_agg(x) from jsonb_array_elements(patch -> 'combats') x where jsonb_typeof(x) = 'object'), '[]'::jsonb))
        with ordinality as t(e, i) order by i desc limit 50) z;
  end if;
  -- показанные подсказки: только добавляются
  if jsonb_typeof(patch -> 'tutorial') = 'array' then
    for v in select * from jsonb_array_elements(patch -> 'tutorial') loop
      continue when jsonb_typeof(v) <> 'string' or not _valid_id(v #>> '{}') or pr.tutorial ? (v #>> '{}') or jsonb_array_length(pr.tutorial) >= 1000;
      pr.tutorial := pr.tutorial || v;
    end loop;
  end if;

  update player_progress set hero_level = pr.hero_level, hero_xp = pr.hero_xp, school_xp = pr.school_xp, research = pr.research,
    pos_x = pr.pos_x, pos_y = pr.pos_y, safe_x = pr.safe_x, safe_y = pr.safe_y, hp = pr.hp, mana = pr.mana, play_ms = pr.play_ms,
    combats = pr.combats, tutorial = pr.tutorial, recent_syncs = pr.recent_syncs, rev = pr.rev + 1, updated_at = now()
    where user_id = uid;
  update profiles set last_seen_at = now() where id = uid;
  return _snapshot(uid);
end $$;

-- ---------------------------------------------------------------- v0.10.0: правила крафта и сюжетных предметов
-- Генерируется из src/config/recipes.js и src/config/storyItems.js (serverRules): node tools/sql/gen-rules.mjs. Руками не править.
-- @rules:begin
create or replace function public._game_rules() returns jsonb language sql immutable as $r$ select '{"recipes":{"elixir_life":{"result":"elixir_life","amount":1,"needs":{"moon_herb":2,"forest_mushroom":1},"requires":[],"crafted":null,"blockedBy":[]},"elixir_mana":{"result":"elixir_mana","amount":1,"needs":{"moon_herb":1,"rune_dust":1},"requires":[],"crafted":null,"blockedBy":[]},"resin_flask":{"result":"resin_flask","amount":1,"needs":{"tree_resin":2,"rune_dust":1},"requires":[],"crafted":null,"blockedBy":[]},"lunar_wick":{"result":"lunar_wick","amount":1,"needs":{"moon_herb":1,"tree_resin":1,"rune_dust":1,"lunar_flame":3},"requires":["lunar_quest_start"],"crafted":"lunar_wick_crafted","blockedBy":["lunar_wick_crafted","lunar_quest_complete"]},"revealing_compound":{"result":"revealing_compound","amount":1,"needs":{"moon_herb":1,"forest_mushroom":1,"rune_dust":1},"requires":["lunar_quest_complete"],"crafted":"revealing_compound_crafted","blockedBy":["revealing_compound_crafted","gate_marks_revealed"]},"restoration_bundle":{"result":"restoration_bundle","amount":1,"needs":{"moon_herb":2,"tree_resin":2,"rune_dust":2,"lunar_shard":1,"rare_core":1},"requires":["lunar_quest_complete"],"crafted":"restoration_bundle_crafted","blockedBy":["restoration_bundle_crafted","chapter_1_complete"]}},"uses":{"lunar_wick":{"requires":["lunar_quest_start"],"blockedBy":["lunar_quest_complete"],"events":["lunar_quest_complete"],"reward":{"heroXP":50,"schoolXP":{"telekinesis":40},"items":{"lunar_shard":3},"topUp":{"school":{"telekinesis":150},"items":{"lunar_shard":5}}}},"revealing_compound":{"requires":["guardian_defeated"],"blockedBy":["gate_marks_revealed"],"events":["gate_marks_revealed"],"reward":{"heroXP":30}},"restoration_bundle":{"requires":["chapter_trial_defeated","unlock_seal_1"],"blockedBy":["chapter_1_complete"],"mana":20,"events":["chapter_1_complete"],"reward":{"heroXP":100,"coins":30,"schoolXP":{"seal":40}}}},"firstCraft":{"event":"first_craft_complete","reward":{"heroXP":15}},"migration":{"event":"mig_v10","guardian":"forest_guardian_01","item":"rare_core","notIf":["restoration_bundle_crafted","chapter_1_complete"]}}'::jsonb $r$;
-- @rules:end

-- ---------------------------------------------------------------- v0.9 / v0.10.0: атомарные действия игрока
-- То, что нельзя доверить дельтам patch: проверка, списание, событие и награда происходят здесь, в одной транзакции.
--   {"op":"heal","id":"…"}        — лечение у Мирры: цена ceil((max_hp − hp) / 10) монет; при нехватке ничего не меняется
--   {"op":"starter_kit","id":"…"} — один раз на персонажа: событие mirra_starter_kit + настой жизни и лунный эликсир
--   v0.10.0 (правила — _game_rules(), из src/config/recipes.js и storyItems.js):
--   {"op":"craft","recipe":"…"}   — изготовление в котле: рецепт известен, сюжетный не сделан, хватает всего; первый крафт +15 опыта
--   {"op":"use","item":"…"}       — применение сюжетного предмета (фитиль / состав / связка + 20 маны): событие и награда один раз
--   {"op":"migrate_v10"}          — разовая компенсация ядра старым сохранениям (флаг mig_v10)
-- Ответ: состояние игрока + "action": {"ok", "reason", …}. Повтор того же id (ответ потерялся) ничего не применяет и возвращает
-- сохранённый результат (+ "duplicate": true). Новый id не обходит уже выполненное событие: условия проверяются заново.
-- Зеркало на JS — applyAction в src/cloud/playerModel.js; совпадение — tools/sql/diff-test.mjs.
alter table public.player_progress add column if not exists recent_actions jsonb not null default '[]';  -- v0.10: [{id, result}] последних 20 действий

create or replace function public._has_event(uid uuid, ev text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from player_quests where user_id = uid and quest_id = ev and status = 'done')
$$;
create or replace function public._inv(uid uuid, item text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select quantity::numeric from player_inventory where user_id = uid and item_id = item), 0)
$$;
create or replace function public._inv_add(uid uuid, item text, delta numeric) returns void
language sql security definer set search_path = public as $$
  insert into player_inventory (user_id, item_id, quantity) values (uid, item, _clamp(delta, 0, 1000000000))
    on conflict (user_id, item_id) do update set quantity = _clamp(player_inventory.quantity + delta, 0, 1000000000)
$$;
create or replace function public._add_event(uid uuid, ev text) returns void
language sql security definer set search_path = public as $$
  insert into player_quests (user_id, quest_id) values (uid, ev) on conflict (user_id, quest_id) do update set status = 'done'
$$;

-- Разовая награда операции (зеркало grant в playerModel.js): опыт и уровень по таблице (перед повышением «полные» HP/мана
-- фиксируются числом), монеты, предметы, опыт школ, topUp — «не меньше».
create or replace function public._grant(uid uuid, pr player_progress, reward jsonb) returns player_progress
language plpgsql security definer set search_path = public as $$
declare before int; lvl int; mx_hp numeric; mx_mana numeric; k text; v jsonb;
begin
  if coalesce((reward ->> 'heroXP')::numeric, 0) > 0 then
    before := pr.hero_level;
    pr.hero_xp := _clamp(pr.hero_xp + (reward ->> 'heroXP')::numeric, 0, 100000000);
    lvl := greatest(pr.hero_level, coalesce((select max(level) from game_hero_levels where xp <= pr.hero_xp), 1));
    if lvl > before then
      select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = before;
      if pr.hp is null then pr.hp := mx_hp; end if;
      if pr.mana is null then pr.mana := mx_mana; end if;
    end if;
    pr.hero_level := lvl;
  end if;
  if coalesce((reward ->> 'coins')::numeric, 0) <> 0 then perform _inv_add(uid, 'coins', (reward ->> 'coins')::numeric); end if;
  for k, v in select * from jsonb_each(coalesce(reward -> 'items', '{}'::jsonb)) loop perform _inv_add(uid, k, (v #>> '{}')::numeric); end loop;
  for k, v in select * from jsonb_each(coalesce(reward -> 'schoolXP', '{}'::jsonb)) loop
    pr.school_xp := jsonb_set(pr.school_xp, array[k], to_jsonb(_clamp(coalesce((pr.school_xp ->> k)::numeric, 0) + (v #>> '{}')::numeric, 0, 1000000000)));
  end loop;
  for k, v in select * from jsonb_each(coalesce(reward -> 'topUp' -> 'school', '{}'::jsonb)) loop
    pr.school_xp := jsonb_set(pr.school_xp, array[k], to_jsonb(greatest(coalesce((pr.school_xp ->> k)::numeric, 0), (v #>> '{}')::numeric)));
  end loop;
  for k, v in select * from jsonb_each(coalesce(reward -> 'topUp' -> 'items', '{}'::jsonb)) loop
    perform _inv_add(uid, k, greatest(0, (v #>> '{}')::numeric - _inv(uid, k)));
  end loop;
  return pr;
end $$;

create or replace function public.player_action(action jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pr player_progress%rowtype;
  op text; aid text; mx_hp numeric; mx_mana numeric; cur numeric; price numeric; coins numeric; res jsonb;
  rules jsonb; r jsonb; u jsonb; m jsonb; k text; v jsonb; missing jsonb; first boolean; prev jsonb; core boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if action is null or jsonb_typeof(action) <> 'object' then raise exception 'bad_action' using errcode = '22023'; end if;
  select * into pr from player_progress where user_id = uid for update;
  if not found then raise exception 'no_player' using errcode = 'P0002'; end if;
  op := action ->> 'op';
  aid := case when jsonb_typeof(action -> 'id') = 'string' and char_length(action ->> 'id') between 8 and 64 then action ->> 'id' end;
  if aid is not null and pr.recent_syncs ? aid then
    -- повтор: сохранённый результат первой попытки (или просто «повтор» для действий до v0.10)
    select e -> 'result' into prev from jsonb_array_elements(pr.recent_actions) e where e ->> 'id' = aid limit 1;
    return _snapshot(uid) || jsonb_build_object('action', coalesce(prev || '{"duplicate": true}'::jsonb, jsonb_build_object('ok', null, 'reason', 'duplicate')));
  end if;
  if aid is not null then
    pr.recent_syncs := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from (
      select e, i from jsonb_array_elements(pr.recent_syncs || to_jsonb(aid)) with ordinality as t(e, i) order by i desc limit 20) z);
  end if;
  select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = pr.hero_level;
  if mx_hp is null then select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels order by level desc limit 1; end if;
  rules := _game_rules();
  if op = 'heal' then
    cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
    price := ceil((mx_hp - cur) / 10.0 - 1e-9);
    select quantity into coins from player_inventory where user_id = uid and item_id = 'coins';
    coins := coalesce(coins, 0);
    if price <= 0 then res := jsonb_build_object('ok', false, 'reason', 'full', 'price', 0);
    elsif coins < price then res := jsonb_build_object('ok', false, 'reason', 'coins', 'price', price);
    else
      update player_inventory set quantity = quantity - price where user_id = uid and item_id = 'coins';
      pr.hp := mx_hp;
      res := jsonb_build_object('ok', true, 'price', price);
    end if;
  elsif op = 'starter_kit' then
    if exists (select 1 from player_quests where user_id = uid and quest_id = 'mirra_starter_kit') then
      res := jsonb_build_object('ok', false, 'reason', 'already');
    else
      insert into player_quests (user_id, quest_id) values (uid, 'mirra_starter_kit');
      insert into player_inventory (user_id, item_id, quantity) values (uid, 'elixir_life', 1), (uid, 'elixir_mana', 1)
        on conflict (user_id, item_id) do update set quantity = least(player_inventory.quantity + 1, 1000000000);
      res := jsonb_build_object('ok', true);
    end if;
  elsif op = 'craft' then
    r := case when jsonb_typeof(action -> 'recipe') = 'string' then rules -> 'recipes' -> (action ->> 'recipe') end;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif exists (select 1 from jsonb_array_elements_text(r -> 'requires') e where not _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif exists (select 1 from jsonb_array_elements_text(r -> 'blockedBy') e where _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'done');
    else
      select coalesce(jsonb_agg(key order by key collate "C"), '[]'::jsonb) into missing
        from jsonb_each(r -> 'needs') where _inv(uid, key) < (value #>> '{}')::numeric;
      if jsonb_array_length(missing) > 0 then res := jsonb_build_object('ok', false, 'reason', 'missing', 'missing', missing);
      else
        for k, v in select * from jsonb_each(r -> 'needs') loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
        perform _inv_add(uid, r ->> 'result', (r ->> 'amount')::numeric);
        if r ->> 'crafted' is not null then perform _add_event(uid, r ->> 'crafted'); end if;
        first := not _has_event(uid, rules -> 'firstCraft' ->> 'event');
        if first then
          perform _add_event(uid, rules -> 'firstCraft' ->> 'event');
          pr := _grant(uid, pr, rules -> 'firstCraft' -> 'reward');
        end if;
        res := jsonb_build_object('ok', true, 'recipe', action ->> 'recipe', 'result', r ->> 'result', 'amount', (r ->> 'amount')::numeric, 'firstCraft', first);
      end if;
    end if;
  elsif op = 'use' then
    u := case when jsonb_typeof(action -> 'item') = 'string' then rules -> 'uses' -> (action ->> 'item') end;
    if u is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif exists (select 1 from jsonb_array_elements_text(u -> 'blockedBy') e where _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'done');
    elsif exists (select 1 from jsonb_array_elements_text(u -> 'requires') e where not _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif _inv(uid, action ->> 'item') < 1 then res := jsonb_build_object('ok', false, 'reason', 'missing');
    elsif u ? 'mana' and _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana) < (u ->> 'mana')::numeric then
      res := jsonb_build_object('ok', false, 'reason', 'mana', 'mana', (u ->> 'mana')::numeric);
    else
      if u ? 'mana' then pr.mana := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana) - (u ->> 'mana')::numeric; end if;
      perform _inv_add(uid, action ->> 'item', -1);
      for k in select * from jsonb_array_elements_text(u -> 'events') loop perform _add_event(uid, k); end loop;
      pr := _grant(uid, pr, u -> 'reward');
      res := jsonb_build_object('ok', true, 'item', action ->> 'item', 'events', u -> 'events');
    end if;
  elsif op = 'migrate_v10' then
    m := rules -> 'migration';
    if _has_event(uid, m ->> 'event') then res := jsonb_build_object('ok', false, 'reason', 'already');
    else
      perform _add_event(uid, m ->> 'event');
      core := exists (select 1 from player_world where user_id = uid and kind = 'enemy' and key = m ->> 'guardian')
        and _inv(uid, m ->> 'item') <= 0
        and not exists (select 1 from jsonb_array_elements_text(m -> 'notIf') e where _has_event(uid, e));
      if core then perform _inv_add(uid, m ->> 'item', 1); end if;
      res := jsonb_build_object('ok', true, 'core', case when core then 1 else 0 end);
    end if;
  else
    res := jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  if aid is not null then
    pr.recent_actions := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from (
      select e, i from jsonb_array_elements(pr.recent_actions || jsonb_build_array(jsonb_build_object('id', aid, 'result', res))) with ordinality as t(e, i)
      order by i desc limit 20) z);
  end if;
  update player_progress set hp = pr.hp, mana = pr.mana, hero_xp = pr.hero_xp, hero_level = pr.hero_level, school_xp = pr.school_xp,
    recent_syncs = pr.recent_syncs, recent_actions = pr.recent_actions, rev = pr.rev + 1, updated_at = now() where user_id = uid;
  return _snapshot(uid) || jsonb_build_object('action', res);
end $$;

-- ---------------------------------------------------------------- превращение гостя в игрока с ником
-- Эти две функции вызывает только Edge Function account (ключ service_role); из браузера они недоступны.
create or replace function public.claim_nickname(uid uuid, nick text, norm text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if nick !~ '^[A-Za-zА-Яа-яЁё0-9_]{3,20}$' or norm !~ '^[a-zа-яё0-9_]{3,20}$' then raise exception 'invalid_nickname' using errcode = '22023'; end if;
  select nickname into cur from profiles where id = uid for update;
  if not found then raise exception 'no_player' using errcode = 'P0002'; end if;
  if cur is not null then raise exception 'already_registered' using errcode = 'P0001'; end if;
  update profiles set nickname = nick, nickname_normalized = norm, registered_at = now() where id = uid;   -- unique_violation, если ник занят
end $$;
create or replace function public.release_nickname(uid uuid) returns void
language sql security definer set search_path = public as $$
  update profiles set nickname = null, nickname_normalized = null, registered_at = null where id = uid;
$$;

-- ---------------------------------------------------------------- права на функции
revoke all on function public._num(jsonb), public._clamp(numeric, numeric, numeric), public._valid_id(text), public._snapshot(uuid) from public, anon, authenticated;
-- v0.10.0: служебные функции действий — только изнутри player_action
revoke all on function public._game_rules(), public._has_event(uuid, text), public._inv(uuid, text), public._inv_add(uuid, text, numeric),
  public._add_event(uuid, text), public._grant(uuid, player_progress, jsonb) from public, anon, authenticated;
revoke all on function public.create_player(text), public.get_player(), public.reset_player(text), public.sync_player(jsonb), public.player_action(jsonb) from public, anon;
grant execute on function public.create_player(text), public.get_player(), public.reset_player(text), public.sync_player(jsonb), public.player_action(jsonb) to authenticated;
revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;
revoke all on function public.claim_nickname(uuid, text, text), public.release_nickname(uuid) from public, anon, authenticated;
grant execute on function public.claim_nickname(uuid, text, text), public.release_nickname(uuid) to service_role;
-- _num/_clamp/_valid_id нужны вызывающим функциям, а они security definer (права владельца), поэтому отдельный доступ клиенту не нужен
