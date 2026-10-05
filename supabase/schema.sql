-- Колдовство: Магическая RPG v0.6: серверный игрок (Supabase). Схема v2 (+ v0.9: мана, максимумы HP/маны по уровню, player_action).
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
  school_xp  jsonb   not null default '{"telekinesis":0,"fire":0,"seal":0,"ice":0}',
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
-- v0.12.0: HP и мана восстанавливаются по времени сервера (в том числе офлайн). vitals_at — момент, на который верны hp и mana;
-- combat_since — начало боя, о завершении которого сервер ещё не знает (пока бой идёт, восстановления нет).
alter table public.player_progress add column if not exists vitals_at timestamptz;
alter table public.player_progress add column if not exists combat_since timestamptz;
-- v0.14.0: что сервер запомнил о герое в начале боя (уровень, дары, ветки, зелья, HP, мана, место боя). По этому состоянию Edge Function combat
-- проигрывает запись боя и решает исход. Очищается вместе с combat_since.
alter table public.player_progress add column if not exists combat_ctx jsonb;
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
  ability_id text not null check (ability_id in ('telekinesis', 'fire', 'seal', 'ice')),
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
  (6, 650, 152, 125), (7, 940, 160, 135), (8, 1300, 170, 140), (9, 1750, 180, 145), (10, 2350, 190, 155),
  -- v0.18.0: уровни 11–15 (глава II)
  (11, 3100, 202, 165), (12, 4000, 214, 175), (13, 5100, 226, 185), (14, 6400, 240, 195), (15, 7900, 255, 205)
  on conflict (level) do update set xp = excluded.xp, max_hp = excluded.max_hp, max_mana = excluded.max_mana;
alter table public.game_hero_levels enable row level security;

-- ---------------------------------------------------------------- Row Level Security
alter table public.profiles         enable row level security;
alter table public.player_progress  enable row level security;
alter table public.player_inventory enable row level security;
alter table public.player_abilities enable row level security;
-- v0.18.0: четвёртый дар — Лёд ('ice'): список даров в проверке таблицы и опыт школы у старых персонажей
alter table public.player_abilities drop constraint if exists player_abilities_ability_id_check;
alter table public.player_abilities add constraint player_abilities_ability_id_check check (ability_id in ('telekinesis', 'fire', 'seal', 'ice'));
alter table public.player_progress alter column school_xp set default '{"telekinesis":0,"fire":0,"seal":0,"ice":0}';
update public.player_progress set school_xp = school_xp || '{"ice":0}'::jsonb where not (school_xp ? 'ice');
-- v0.17.0: кошелёк сапфиров. Отдельно от прогресса: «Новая игра» (reset_player) его не трогает — купленное не пропадает.
-- daily — счётчик ускорений за сутки UTC ({ d: номер дня, n: шагов }), welcome — приветственные сапфиры уже выданы.
create table if not exists public.player_wallet (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  sapphires  bigint not null default 0 check (sapphires >= 0),
  daily      jsonb  not null default '{}',
  welcome    boolean not null default false,
  updated_at timestamptz not null default now()
);
-- Журнал всех начислений и списаний: что, сколько, баланс после, зачем. ref — ключ от повтора (одна покупка / выдача — одна запись).
create table if not exists public.sapphire_ledger (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  delta      bigint not null,
  balance    bigint not null check (balance >= 0),
  kind       text not null check (kind in ('admin', 'purchase', 'reward', 'welcome', 'speedup', 'respec', 'preset')),
  reason     text,
  ref        text,
  created_at timestamptz not null default now()
);
create unique index if not exists sapphire_ledger_ref_key on public.sapphire_ledger (user_id, ref) where ref is not null;
create index if not exists sapphire_ledger_user_idx on public.sapphire_ledger (user_id, id desc);
alter table public.player_wallet enable row level security;
alter table public.sapphire_ledger enable row level security;
revoke all on public.player_wallet, public.sapphire_ledger from anon, authenticated;
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

-- ---------------------------------------------------------------- v0.12.0: восстановление HP и маны по времени сервера
-- Чистая функция над строкой игрока: возвращает её с hp и mana, доведёнными до «сейчас». В базу не пишет (пишут вызывающие).
--  • скорость и дом Мирры берутся из _game_rules() -> 'vitals' (то же, что читает JS-зеркало playerModel.advanceVitals);
--  • дом определяется по сохранённой позиции игрока (pos_x/pos_y): офлайн мана восстанавливается так, как он оставил героя;
--  • пока идёт бой (combat_since), восстановления нет; бой старше staleCombatSec считается отступлением (HP не ниже доли максимума);
--  • «полные» hp/mana (null) фиксируются числом — повышение уровня не лечит «втихую».
create or replace function public._advance(pr player_progress) returns player_progress
language plpgsql stable set search_path = public as $$
declare
  v jsonb := _game_rules() -> 'vitals';
  mx_hp numeric; mx_mana numeric; h numeric; m numeric;
  t0 timestamptz := date_trunc('milliseconds', now());
  from_t timestamptz; stale_at timestamptz; el numeric; mana_rate numeric; in_house boolean; fl numeric;
begin
  select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = pr.hero_level;
  if mx_hp is null then select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels order by level desc limit 1; end if;
  h := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
  m := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana);
  from_t := coalesce(pr.vitals_at, t0);
  if pr.combat_since is not null then
    stale_at := pr.combat_since + make_interval(secs => (v ->> 'staleCombatSec')::double precision);
    if t0 < stale_at then
      from_t := t0;                                    -- бой идёт: время не засчитывается
    else
      fl := greatest(1, ceil(mx_hp * (v ->> 'defeatHpFraction')::numeric - 1e-9));
      h := greatest(h, fl);                            -- о конце боя сервер так и не узнал: это отступление
      from_t := greatest(from_t, stale_at);
      pr.combat_since := null;
      pr.combat_ctx := null;
    end if;
  end if;
  el := greatest(0, extract(epoch from (t0 - from_t))::numeric);
  -- позиции ещё нет — персонаж стоит на старте, а старт в доме Мирры
  in_house := pr.pos_x is null or pr.pos_y is null or (pr.pos_x between (v #>> '{house,x}')::numeric and (v #>> '{house,x}')::numeric + (v #>> '{house,w}')::numeric
    and pr.pos_y between (v #>> '{house,y}')::numeric and (v #>> '{house,y}')::numeric + (v #>> '{house,h}')::numeric);
  mana_rate := case when in_house then (v ->> 'manaRegenHouse')::numeric else (v ->> 'manaRegenWorld')::numeric end;
  pr.hp := least(mx_hp, h + el * (v ->> 'hpRegenPerSec')::numeric);
  pr.mana := least(mx_mana, m + el * mana_rate);
  pr.vitals_at := t0;
  return pr;
end $$;

-- Полное состояние игрока одним jsonb. Те же поля, что в src/cloud/playerModel.js (toSnapshot) + блок meta.
create or replace function public._snapshot(uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr player_progress%rowtype; pf profiles%rowtype;
begin
  select * into pr from player_progress where user_id = uid;
  select * into pf from profiles where id = uid;
  if pr.user_id is null then return null; end if;
  pr := _advance(pr);   -- hp и mana на «сейчас» (читающий запрос ничего не записывает)
  return jsonb_build_object(
    'level', pr.hero_level, 'xp', pr.hero_xp, 'school', pr.school_xp,
    'abilities', coalesce((select jsonb_object_agg(ability_id, jsonb_build_object('level', level, 'unlocked', unlocked)) from player_abilities where user_id = uid), '{}'::jsonb),
    'inventory', coalesce((select jsonb_object_agg(item_id, quantity) from player_inventory where user_id = uid), '{}'::jsonb),
    'quests',    coalesce((select jsonb_agg(quest_id order by quest_id) from player_quests where user_id = uid and status = 'done'), '[]'::jsonb),
    'paths',     coalesce((select jsonb_agg(key order by key) from player_world where user_id = uid and kind = 'path'), '[]'::jsonb),
    'enemies',   coalesce((select jsonb_agg(key order by key) from player_world where user_id = uid and kind = 'enemy'), '[]'::jsonb),
    'objects',   coalesce((select jsonb_object_agg(key, data) from player_world where user_id = uid and kind = 'object'), '{}'::jsonb),
    'research', pr.research,
    'wallet', coalesce((select jsonb_build_object('sapphires', w.sapphires, 'daily', w.daily, 'welcome', w.welcome) from player_wallet w where w.user_id = uid),
                       '{"sapphires": 0, "daily": {}, "welcome": false}'::jsonb),
    'pos',  case when pr.pos_x  is null then null else jsonb_build_object('x', pr.pos_x,  'y', pr.pos_y)  end,
    'safe', case when pr.safe_x is null then null else jsonb_build_object('x', pr.safe_x, 'y', pr.safe_y) end,
    'hp', pr.hp, 'mana', pr.mana, 'play', pr.play_ms, 'combats', pr.combats, 'tutorial', pr.tutorial,
    'vitalsAt', (extract(epoch from pr.vitals_at) * 1000)::bigint,
    'combatSince', case when pr.combat_since is null then null else (extract(epoch from pr.combat_since) * 1000)::bigint end,
    'combatCtx', pr.combat_ctx,
    'meta', jsonb_build_object('playerId', to_jsonb(pf)->>'player_id', 'hero', pf.hero_id, 'nickname', pf.nickname, 'registered', pf.nickname is not null,
                               'rev', pr.rev, 'createdAt', pf.created_at, 'registeredAt', pf.registered_at, 'lastSeenAt', pf.last_seen_at)
  );
end $$;

alter table public.profiles add column if not exists login_nickname text;
update public.profiles set login_nickname=nickname_normalized where login_nickname is null and nickname_normalized is not null;
create unique index if not exists profiles_login_nickname_key on public.profiles(login_nickname) where login_nickname is not null;

-- ---------------------------------------------------------------- «ник свободен?» (подсказка в форме; настоящая защита — индекс)
create or replace function public.nickname_login(norm text) returns text language sql stable security definer set search_path='' as $$
 select login_nickname from public.profiles where nickname_normalized=norm
$$;
revoke all on function public.nickname_login(text) from public;
grant execute on function public.nickname_login(text) to anon,authenticated;
create or replace function public.nickname_available(norm text) returns boolean language sql stable security definer set search_path='' as $$
 select norm ~ '^[a-zа-яё0-9_]{3,20}$' and not exists(select 1 from public.profiles where nickname_normalized=norm or login_nickname=norm)
$$;
create or replace function public.claim_nickname(uid uuid,nick text,norm text) returns void language plpgsql security definer set search_path='' as $$
declare cur text;
begin
 perform pg_advisory_xact_lock(hashtextextended('game-nickname',0));
 if nick !~ '^[A-Za-zА-Яа-яЁё0-9_]{3,20}$' or norm<>lower(nick) or (nick ~ '[A-Za-z]' and nick ~ '[А-Яа-яЁё]') or nick !~ '[A-Za-zА-Яа-яЁё]' then raise exception 'invalid_nickname' using errcode='22023'; end if;
 select nickname into cur from public.profiles where id=uid for update;
 if not found then raise exception 'no_player' using errcode='P0002'; end if;
 if cur is not null then raise exception 'already_registered' using errcode='P0001'; end if;
 if exists(select 1 from public.profiles where id<>uid and (nickname_normalized=norm or login_nickname=norm)) then raise exception 'nickname_taken' using errcode='23505'; end if;
 update public.profiles set nickname=nick,nickname_normalized=norm,login_nickname=norm,registered_at=now() where id=uid;
end $$;
create or replace function public.release_nickname(uid uuid) returns void language sql security definer set search_path='' as $$
 update public.profiles set nickname=null,nickname_normalized=null,login_nickname=null,registered_at=null where id=uid
$$;

create or replace function public._require_game_access() returns void language plpgsql security definer set search_path='' as $$
declare denied boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('chat-user:'||auth.uid()::text,0));
  if to_regclass('game_chat.sanctions') is not null then
    execute 'select exists(select 1 from game_chat.sanctions where user_id=$1 and kind=''game'' and revoked_at is null and (expires_at is null or expires_at>now()))' into denied using auth.uid();
    if denied then raise exception 'game_banned' using errcode='P0001'; end if;
  end if;
end $$;
revoke all on function public._require_game_access() from public,anon,authenticated;

-- ---------------------------------------------------------------- создание и загрузка игрока
-- Вызывается один раз после появления пользователя (гость — анонимный пользователь Supabase). Повторный вызов ничего не портит.
create or replace function public.create_player(hero text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public._require_game_access();
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
  perform public._require_game_access();
  update profiles set last_seen_at = now() where id = uid;
  return _snapshot(uid);
end $$;

-- Новая игра: стирает прогресс этого же игрока и выдаёт нового героя. Ник и user_id сохраняются.
create or replace function public.reset_player(hero text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public._require_game_access();
  if hero is null or hero !~ '^[a-z0-9_]{1,32}$' then raise exception 'invalid_hero' using errcode = '22023'; end if;
  perform 1 from player_progress where user_id = uid for update;
  delete from player_inventory where user_id = uid;
  delete from player_abilities where user_id = uid;
  delete from player_quests    where user_id = uid;
  delete from player_world     where user_id = uid;
  insert into profiles (id, hero_id) values (uid, hero) on conflict (id) do update set hero_id = excluded.hero_id, last_seen_at = now();
  insert into player_progress (user_id) values (uid)
    on conflict (user_id) do update set rev = player_progress.rev + 1, hero_level = 1, hero_xp = 0,
      school_xp = '{"telekinesis":0,"fire":0,"seal":0,"ice":0}', research = null, pos_x = null, pos_y = null, safe_x = null, safe_y = null,
      hp = null, mana = null, vitals_at = date_trunc('milliseconds', now()), combat_since = null, combat_ctx = null, play_ms = 0, combats = '[]', tutorial = '[]', updated_at = now();
  return _snapshot(uid);
end $$;

-- ---------------------------------------------------------------- сохранение: слияние изменений
-- patch — не весь сейв, а то, что изменилось (см. src/cloud/playerModel.js). Всё в одной транзакции, строка игрока заблокирована:
-- два устройства по очереди слияются, а не затирают друг друга.
-- v0.15.0: прогресс клиент больше не пишет. Опыт героя и даров, предметы, дары, события, пути, побеждённые враги и изучение приходят
-- только от операций player_action (event, quest_accept, quest_turn_in, research_start, research_finish, respec, world, craft, use,
-- combat_start) и combat_apply; поля xp, school, inv, abilities, quests, paths, enemies, research в patch игнорируются.
-- Остаётся «мелочь», которой нельзя выиграть: позиция, точка возрождения, время игры, история боёв, подсказки и состояние объектов мира,
-- которых нет в правилах сервера (след врага, прочитанная книга).
create or replace function public.sync_player(patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pr player_progress%rowtype;
  k text; v jsonb; cnt int; rules jsonb := _game_rules();
  gain_play   constant numeric := 600000;     -- 10 минут
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public._require_game_access();
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
  pr := _advance(pr);   -- v0.12.0: сначала восстановление до «сейчас», затем изменения клиента

  -- состояние предметов мира: последний записал. Серверные ключи (правила мира, победы rep:*, ветки player_build) не принимаются.
  if jsonb_typeof(patch -> 'objects') = 'object' then
    for k, v in select * from jsonb_each(patch -> 'objects') loop
      continue when not _valid_id(k);
      continue when rules -> 'world' ? k or k like 'rep:%' or k = 'player_build' or k = 'daily';
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

  -- позиция и точка возрождения: последний записал
  if jsonb_typeof(patch -> 'pos') = 'object' and _num(patch -> 'pos' -> 'x') is not null and _num(patch -> 'pos' -> 'y') is not null then
    pr.pos_x := _num(patch -> 'pos' -> 'x'); pr.pos_y := _num(patch -> 'pos' -> 'y');
  end if;
  if jsonb_typeof(patch -> 'safe') = 'object' and _num(patch -> 'safe' -> 'x') is not null and _num(patch -> 'safe' -> 'y') is not null then
    pr.safe_x := _num(patch -> 'safe' -> 'x'); pr.safe_y := _num(patch -> 'safe' -> 'y');
  end if;
  -- HP и ману клиент не записывает (поля hp и mana в patch игнорируются). v0.13.0: устаревшее mana_spent тоже игнорируется —
  -- ману тратят только операции player_action (world, use); восстанавливает сервер по времени, лечат heal, drink, combat_*.

  -- время игры: дельта (за раз не больше 10 минут)
  if _num(patch -> 'play') is not null then pr.play_ms := pr.play_ms + _clamp(trunc(_num(patch -> 'play')), 0, gain_play); end if;
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
    pos_x = pr.pos_x, pos_y = pr.pos_y, safe_x = pr.safe_x, safe_y = pr.safe_y, hp = pr.hp, mana = pr.mana,
    vitals_at = pr.vitals_at, combat_since = pr.combat_since, combat_ctx = pr.combat_ctx, play_ms = pr.play_ms,
    combats = pr.combats, tutorial = pr.tutorial, recent_syncs = pr.recent_syncs, rev = pr.rev + 1, updated_at = now()
    where user_id = uid;
  update profiles set last_seen_at = now() where id = uid;
  return _snapshot(uid);
end $$;

-- ---------------------------------------------------------------- v0.10.0: правила крафта и сюжетных предметов
-- Генерируется из src/config/recipes.js и src/config/storyItems.js (serverRules): node tools/sql/gen-rules.mjs. Руками не править.
-- @rules:begin
create or replace function public._game_rules() returns jsonb language sql immutable as $r$ select '{"recipes":{"elixir_life":{"result":"elixir_life","amount":1,"needs":{"moon_herb":2,"forest_mushroom":1},"requires":[],"crafted":null,"blockedBy":[]},"elixir_mana":{"result":"elixir_mana","amount":1,"needs":{"moon_herb":1,"rune_dust":1},"requires":[],"crafted":null,"blockedBy":[]},"resin_flask":{"result":"resin_flask","amount":1,"needs":{"tree_resin":2,"rune_dust":1},"requires":[],"crafted":null,"blockedBy":[]},"lunar_wick":{"result":"lunar_wick","amount":1,"needs":{"moon_herb":1,"tree_resin":1,"rune_dust":1,"lunar_flame":3},"requires":["lunar_quest_start"],"crafted":"lunar_wick_crafted","blockedBy":["lunar_wick_crafted","lunar_quest_complete"]},"revealing_compound":{"result":"revealing_compound","amount":1,"needs":{"moon_herb":1,"forest_mushroom":1,"rune_dust":1},"requires":["lunar_quest_complete"],"crafted":"revealing_compound_crafted","blockedBy":["revealing_compound_crafted","gate_marks_revealed"]},"restoration_bundle":{"result":"restoration_bundle","amount":1,"needs":{"moon_herb":2,"tree_resin":2,"rune_dust":2,"lunar_shard":1,"rare_core":1},"requires":["lunar_quest_complete"],"crafted":"restoration_bundle_crafted","blockedBy":["restoration_bundle_crafted","chapter_1_complete"]},"warm_potion":{"result":"warm_potion","amount":1,"needs":{"moon_herb":1,"frost_herb":1,"forest_mushroom":1},"requires":["ch2_nerys_met"],"crafted":"warm_potion_crafted","blockedBy":[]},"stabilizing_potion":{"result":"stabilizing_potion","amount":1,"needs":{"frost_herb":2,"rune_dust":1,"lunar_shard":1},"requires":["ch2_lab_open"],"crafted":null,"blockedBy":[]},"brittle_flask":{"result":"brittle_flask","amount":1,"needs":{"ice_crystal":1,"tree_resin":1,"rune_dust":1},"requires":["unlock_ice_2"],"crafted":"brittle_flask_crafted","blockedBy":[]},"crystal_guard":{"result":"crystal_guard","amount":1,"needs":{"ice_crystal":1,"forest_mushroom":1,"tree_resin":1},"requires":["ch2_quarter_cleared"],"crafted":null,"blockedBy":[]},"reinforced_resin":{"result":"reinforced_resin","amount":1,"needs":{"tree_resin":2,"crimson_ember":1,"frost_herb":1},"requires":["ch2_cargo_found"],"crafted":null,"blockedBy":[]},"astral_lens":{"result":"astral_lens","amount":1,"needs":{"rune_dust":2,"lunar_shard":1,"ice_crystal":1},"requires":["ch2_cargo_reported"],"crafted":null,"blockedBy":[]},"amulet_frost":{"result":"amulet_frost","amount":1,"needs":{"lunar_shard":4,"rune_dust":4,"ice_crystal":3,"frost_shard":1,"coins":250},"requires":["ch2_quarter_cleared"],"crafted":"amulet_frost_crafted","blockedBy":["amulet_frost_crafted"]}},"uses":{"lunar_wick":{"requires":["lunar_quest_start"],"blockedBy":["lunar_quest_complete"],"events":["lunar_quest_complete"],"reward":{"heroXP":50,"schoolXP":{"telekinesis":40},"items":{"lunar_shard":3},"topUp":{"school":{"telekinesis":150},"items":{"lunar_shard":5}}}},"revealing_compound":{"requires":["guardian_defeated"],"blockedBy":["gate_marks_revealed"],"events":["gate_marks_revealed"],"reward":{"heroXP":30}},"restoration_bundle":{"requires":["chapter_trial_defeated","unlock_seal_1"],"blockedBy":["chapter_1_complete"],"mana":20,"events":["chapter_1_complete"],"reward":{"heroXP":100,"coins":30,"schoolXP":{"seal":40}}}},"firstCraft":{"event":"first_craft_complete","reward":{"heroXP":15}},"migration":{"event":"mig_v10","guardian":"forest_guardian_01","item":"rare_core","notIf":["restoration_bundle_crafted","chapter_1_complete"]},"vitals":{"hpRegenPerSec":1,"manaRegenWorld":0.5,"manaRegenHouse":2,"house":{"x":640,"y":4880,"w":520,"h":420},"defeatHpFraction":0.2,"staleCombatSec":900},"potions":{"elixir_life":{"kind":"heal","amount":0.45},"elixir_mana":{"kind":"mana","amount":0.6}},"world":{"glade_rock":{"kind":"cast","mark":"moved","mana":12,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":["first_world_interaction"],"requires":[],"requiresEnemy":[]},"glade_rock_reward":{"kind":"loot","mark":"collected","reward":{"coins":20},"parent":{"id":"glade_rock","state":"moved"}},"moon_plant":{"kind":"loot","mark":"collected","reward":{"items":{"moon_herb":1}},"mana":4,"ability":"telekinesis","minLevel":1,"school":{"telekinesis":6},"events":["first_world_interaction"],"requires":[],"requiresEnemy":[]},"glade_cache":{"kind":"loot","mark":"opened","reward":{"items":{"coins":15,"tree_resin":1}},"requires":[],"requiresEnemy":[]},"corrupted_roots":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":["fire_gate_open"],"path":"west_forest","requires":[],"requiresEnemy":[]},"trail_cache":{"kind":"loot","mark":"opened","reward":{"items":{"coins":20,"forest_mushroom":1}},"requires":[],"requiresEnemy":[]},"flame_a":{"kind":"loot","mark":"collected","reward":{"items":{"lunar_flame":1}},"mana":4,"ability":"telekinesis","minLevel":1,"school":{"telekinesis":6},"events":[],"requires":["lunar_quest_start"],"requiresEnemy":[]},"altar_stone":{"kind":"cast","mark":"moved","mana":12,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":[],"requires":[],"requiresEnemy":[]},"altar_stone_reward":{"kind":"loot","mark":"collected","reward":{"items":{"lunar_flame":1}},"parent":{"id":"altar_stone","state":"moved"}},"flame_c":{"kind":"loot","mark":"collected","reward":{"items":{"lunar_flame":1}},"requires":["lunar_quest_start"],"requiresEnemy":["lunar_guard"]},"heavy_boulder":{"kind":"cast","mark":"moved","mana":20,"ability":"telekinesis","minLevel":2,"blockedBy":[],"school":{"telekinesis":6},"events":["heavy_path_open"],"path":"fire_circle_path","requires":[],"requiresEnemy":[]},"ritual_torch":{"kind":"cast","mark":"burning","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":[],"requires":[],"requiresEnemy":[]},"dry_bush":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":[],"requires":[],"requiresEnemy":[]},"dry_bush_reward":{"kind":"loot","mark":"collected","reward":{"items":{"crimson_ember":1}},"parent":{"id":"dry_bush","state":"destroyed"}},"moonstone":{"kind":"loot","mark":"collected","reward":{"items":{"moonstone":1}},"requires":[],"requiresEnemy":[]},"west_chest":{"kind":"loot","mark":"opened","reward":{"items":{"coins":40,"lunar_shard":2,"rune_dust":1},"heroXP":15},"requires":[],"requiresEnemy":[]},"ancient_gate":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ancient_gate_open"],"school":{"seal":6},"events":["ancient_gate_open"],"path":"node_glade","requires":["guardian_defeated","gate_marks_revealed","unlock_seal_1","seal_training_complete"],"requiresEnemy":[]},"house_trunk":{"kind":"loot","mark":"looted","reward":{"items":{"forest_mushroom":1,"tree_resin":1}},"requires":[],"requiresEnemy":[]},"herb_g1":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"herb_g2":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"herb_g3":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"herb_t1":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"resin_t1":{"kind":"gather","item":"tree_resin","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"mush_t1":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"bramble_t1":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":[],"requires":[],"requiresEnemy":[]},"bramble_t1_reward":{"kind":"loot","mark":"collected","reward":{"items":{"tree_resin":2}},"parent":{"id":"bramble_t1","state":"destroyed"}},"rune_sigil":{"kind":"gather","item":"rune_dust","amount":1,"respawnSec":240,"mana":4,"requires":[],"requiresEnemy":[]},"rune_slab":{"kind":"cast","mark":"moved","mana":8,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":[],"requires":[],"requiresEnemy":[]},"rune_slab_reward":{"kind":"loot","mark":"collected","reward":{"items":{"rune_dust":2}},"parent":{"id":"rune_slab","state":"moved"}},"herb_a1":{"kind":"gather","item":"moon_herb","amount":1,"respawnSec":150,"mana":4,"requires":[],"requiresEnemy":[]},"resin_a1":{"kind":"gather","item":"tree_resin","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"crystal_a1":{"kind":"gather","item":"lunar_shard","amount":1,"respawnSec":420,"mana":4,"requires":[],"requiresEnemy":[]},"mush_a1":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"mush_j1":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"resin_j1":{"kind":"gather","item":"tree_resin","amount":1,"respawnSec":200,"mana":4,"requires":[],"requiresEnemy":[]},"hollow_cache":{"kind":"loot","mark":"opened","reward":{"items":{"forest_mushroom":2,"rune_dust":1},"coins":10},"requires":[],"requiresEnemy":[]},"guard_cache":{"kind":"loot","mark":"opened","reward":{"items":{"rune_dust":1}},"requires":[],"requiresEnemy":["lunar_guard"]},"dust_stash":{"kind":"stash","guard":"rootling_02","items":{"rune_dust":2},"requires":[],"requiresEnemy":[]},"approach_cache":{"kind":"loot","mark":"opened","reward":{"items":{"rune_dust":2}},"requires":[],"requiresEnemy":["rootling_05"]},"seal_sigil":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["seal_training_complete"],"school":{"seal":6},"events":["seal_training_complete"],"requires":["gate_marks_revealed"],"requiresEnemy":[]},"frostherb_r1":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":240,"mana":4,"requires":["ch2_start"],"requiresEnemy":[]},"frostherb_r2":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":240,"mana":4,"requires":["ch2_start"],"requiresEnemy":[]},"resin_r1":{"kind":"gather","item":"tree_resin","amount":1,"respawnSec":240,"mana":4,"requires":[],"requiresEnemy":[]},"plaza_trace":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_trace_astral"],"school":{"seal":6},"events":["ch2_trace_astral"],"requires":["ch2_met_ilaria"],"requiresEnemy":[]},"plaza_debris":{"kind":"cast","mark":"moved","mana":8,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":["ch2_trace_debris"],"requires":["ch2_met_ilaria"],"requiresEnemy":[]},"plaza_debris_reward":{"kind":"loot","mark":"collected","reward":{"items":{"frost_herb":2}},"parent":{"id":"plaza_debris","state":"moved"}},"archive_document":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_archive_read"],"school":{"seal":6},"events":["ch2_archive_read"],"requires":["ch2_trace_found"],"requiresEnemy":[]},"wh_cargo":{"kind":"cast","mark":"moved","mana":12,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":["ch2_cargo_found"],"requires":[],"requiresEnemy":["wh_elite"]},"wh_cargo_reward":{"kind":"loot","mark":"collected","reward":{"items":{"ice_crystal":1}},"parent":{"id":"wh_cargo","state":"moved"}},"wh_equipment":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_serials_read"],"school":{"seal":6},"events":["ch2_serials_read"],"requires":["ch2_cargo_found"],"requiresEnemy":[]},"frost_barrier":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":["ch2_quarter_open"],"requires":["ch2_frost_wave"],"requiresEnemy":[]},"ice_construct":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":["ch2_construct_unstable"],"requires":["ch2_quarter_open"],"requiresEnemy":[]},"fq_door":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_rescue_door"],"school":{"seal":6},"events":["ch2_rescue_door"],"requires":[],"requiresEnemy":["fq_collector"]},"fq_cellar":{"kind":"cast","mark":"moved","mana":12,"ability":"telekinesis","minLevel":1,"blockedBy":[],"school":{"telekinesis":6},"events":["ch2_rescue_cellar"],"requires":[],"requiresEnemy":["fq_critter"]},"fq_cellar_reward":{"kind":"loot","mark":"collected","reward":{"items":{"frost_herb":1}},"parent":{"id":"fq_cellar","state":"moved"}},"fq_water":{"kind":"cast","mark":"frozen","mana":14,"ability":"ice","minLevel":1,"blockedBy":[],"school":{"ice":6},"events":["ch2_water_frozen"],"requires":[],"requiresEnemy":[]},"lab_seal":{"kind":"cast","mark":"frozen","mana":14,"ability":"ice","minLevel":1,"blockedBy":[],"school":{"ice":6},"events":["ch2_lab_open"],"requires":["ch2_lab_found"],"requiresEnemy":[]},"lab_herb_1":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":240,"mana":4,"requires":["ch2_lab_open"],"requiresEnemy":[]},"lab_herb_2":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":240,"mana":4,"requires":["ch2_lab_open"],"requiresEnemy":[]},"lab_chest":{"kind":"loot","mark":"opened","reward":{"items":{"rune_dust":2,"lunar_shard":2,"frost_herb":2}},"requires":["ch2_lab_open"],"requiresEnemy":[]},"lab_journal":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_lab_journal"],"school":{"seal":6},"events":["ch2_lab_journal"],"requires":[],"requiresEnemy":["lab_construct"]},"final_debris":{"kind":"cast","mark":"moved","mana":20,"ability":"telekinesis","minLevel":2,"blockedBy":[],"school":{"telekinesis":6},"events":["ch2_fin_tk"],"requires":["ch2_final_start"],"requiresEnemy":[]},"final_ice_wall":{"kind":"cast","mark":"destroyed","mana":16,"ability":"fire","minLevel":1,"blockedBy":[],"school":{"fire":6},"events":["ch2_fin_fire"],"requires":["ch2_final_start"],"requiresEnemy":[]},"final_rift":{"kind":"cast","mark":"frozen","mana":14,"ability":"ice","minLevel":1,"blockedBy":[],"school":{"ice":6},"events":["ch2_fin_ice"],"requires":["ch2_final_start"],"requiresEnemy":[]},"final_ward":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_fin_seal"],"school":{"seal":6},"events":["ch2_fin_seal"],"requires":["ch2_final_start"],"requiresEnemy":[]},"final_letters":{"kind":"cast","mana":20,"ability":"seal","minLevel":1,"blockedBy":["ch2_letters_read"],"school":{"seal":6},"events":["ch2_letters_read"],"requires":[],"requiresEnemy":["final_severin"]},"fw_herb_1":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_herb_2":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_herb_3":{"kind":"gather","item":"frost_herb","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_crystal_1":{"kind":"gather","item":"ice_crystal","amount":1,"respawnSec":900,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_crystal_2":{"kind":"gather","item":"ice_crystal","amount":1,"respawnSec":900,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"fw_cache":{"kind":"stash","guard":"fw_alpha","items":{"frost_shard":1,"ice_crystal":1},"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_dust_1":{"kind":"gather","item":"rune_dust","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_dust_2":{"kind":"gather","item":"rune_dust","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_mush_1":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_mush_2":{"kind":"gather","item":"forest_mushroom","amount":1,"respawnSec":300,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_shard_1":{"kind":"gather","item":"lunar_shard","amount":1,"respawnSec":900,"mana":4,"requires":["chapter_2_complete"],"requiresEnemy":[]},"gy_cache":{"kind":"stash","guard":"gy_warden","items":{"frost_shard":1,"lunar_shard":2},"requires":["chapter_2_complete"],"requiresEnemy":[]}},"events":{"prologue_seen":{"requires":[],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"mirra_taught_alchemy":{"requires":[],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"fire_required_01":{"requires":[],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"heavy_blocked_01":{"requires":[],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_telekinesis_1":{"requires":[],"unlock":{"telekinesis":1},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"lunar_quest_start":{"requires":["unlock_telekinesis_1"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_fire_1":{"requires":["heavy_path_open"],"unlock":{"fire":1},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_seal_1":{"requires":["gate_marks_revealed"],"unlock":{"seal":1},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_start":{"requires":["chapter_1_complete"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_city_arrived":{"requires":["ch2_start"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_met_ilaria":{"requires":["ch2_plaza_cleared"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_trace_found":{"requires":["ch2_trace_astral","ch2_trace_debris"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_met_severin":{"requires":["ch2_archive_read"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"city_merchant_open":{"requires":["ch2_city_arrived"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_cargo_start":{"requires":["ch2_met_severin"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_cargo_reported":{"requires":["ch2_cargo_found","ch2_serials_read"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_severin_asked":{"requires":["ch2_cargo_reported"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_frost_wave":{"requires":["ch2_lab_critter"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_nerys_met":{"requires":["ch2_construct_unstable"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_rescue_done":{"requires":["ch2_rescue_door","ch2_rescue_cellar"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_ice_1":{"requires":["ch2_rescue_done","warm_potion_crafted"],"unlock":{"ice":1},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_ice_trained":{"requires":["ch2_training_done"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_choice_start":{"requires":["ch2_ice_trained"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_quarter_cleared":{"requires":["ch2_ice_guardian_defeated","ch2_deep_1","ch2_deep_2"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"unlock_ice_2":{"requires":["ch2_quarter_cleared"],"unlock":{"ice":2},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_brittle_done":{"requires":["ch2_brittle_1","ch2_brittle_2","brittle_flask_crafted"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_lab_found":{"requires":["ch2_brittle_done"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_stabilized":{"requires":["ch2_vol_1","ch2_vol_2"],"unlock":{},"blockedBy":[],"consume":{"stabilizing_potion":2},"branch":{},"marks":[],"sapphires":0},"ch2_lab_reported":{"requires":["ch2_stabilized","ch2_lab_journal"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_view_danger":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":["ch2_severin_confronted"],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_view_methods":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":["ch2_severin_confronted"],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_view_market":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":["ch2_severin_confronted"],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_view_unsure":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":["ch2_severin_confronted"],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_severin_confronted":{"requires":["ch2_lab_reported"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_coven_met":{"requires":["ch2_severin_confronted"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_coven_supplies":{"requires":["ch2_coven_met"],"unlock":{},"blockedBy":[],"consume":{"crystal_guard":1,"frost_herb":2},"branch":{},"marks":[],"sapphires":0},"ch2_coven_ready":{"requires":["ch2_unstable_1","ch2_unstable_2","ch2_coven_supplies"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_final_start":{"requires":["ch2_coven_ready"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"ch2_ice3_frost":{"requires":["ch2_fin_tk","ch2_fin_fire","ch2_fin_ice","ch2_fin_seal"],"unlock":{"ice":3},"blockedBy":["ch2_ice3"],"consume":{},"branch":{"ice":"frost"},"marks":["ch2_ice3"],"sapphires":0},"ch2_ice3_shard":{"requires":["ch2_fin_tk","ch2_fin_fire","ch2_fin_ice","ch2_fin_seal"],"unlock":{"ice":3},"blockedBy":["ch2_ice3"],"consume":{},"branch":{"ice":"shard"},"marks":["ch2_ice3"],"sapphires":0},"ch2_epilogue":{"requires":["ch2_letters_read"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":[],"sapphires":0},"chapter_2_complete":{"requires":["ch2_epilogue"],"unlock":{},"blockedBy":[],"consume":{},"branch":{},"marks":["title_frost_survivor"],"sapphires":5}},"eventRewards":{"first_world_interaction":{"heroXP":10},"lunar_quest_complete":{"heroXP":50,"items":{"lunar_shard":3},"schoolXP":{"telekinesis":40},"topUp":{"school":{"telekinesis":150},"items":{"lunar_shard":5}}},"telekinesis_2_complete":{"heroXP":30},"heavy_path_open":{"heroXP":20},"unlock_fire_1":{"heroXP":30},"fire_gate_open":{"heroXP":20,"schoolXP":{"fire":20}},"unlock_seal_1":{"heroXP":60},"ch2_city_arrived":{"heroXP":220,"coins":60},"ch2_met_ilaria":{"heroXP":200,"coins":50,"items":{"frost_herb":1}},"ch2_trace_found":{"heroXP":300,"coins":80,"items":{"frost_herb":2,"rune_dust":1}},"ch2_archive_read":{"heroXP":320,"coins":90},"ch2_met_severin":{"heroXP":340,"coins":80,"items":{"warm_potion":1}},"ch2_cargo_reported":{"heroXP":270,"coins":120,"items":{"frost_herb":2}},"ch2_frost_wave":{"heroXP":280,"coins":90},"ch2_nerys_met":{"heroXP":60},"ch2_rescue_done":{"heroXP":300,"coins":140,"items":{"moon_herb":1,"frost_herb":1,"forest_mushroom":1}},"unlock_ice_1":{"heroXP":60},"ch2_ice_trained":{"heroXP":240,"coins":60},"ch2_quarter_cleared":{"heroXP":340,"coins":160,"items":{"ice_crystal":2}},"unlock_ice_2":{"heroXP":60,"items":{"ice_crystal":1,"tree_resin":1,"rune_dust":1}},"ch2_brittle_done":{"heroXP":240,"coins":70},"ch2_stabilized":{"heroXP":120},"ch2_lab_reported":{"heroXP":300,"coins":180,"items":{"frost_shard":1,"lunar_shard":2}},"ch2_severin_confronted":{"heroXP":380,"coins":80},"ch2_coven_met":{"heroXP":60},"ch2_coven_ready":{"heroXP":300,"coins":180,"items":{"ice_crystal":2}},"ch2_epilogue":{"heroXP":250},"chapter_2_complete":{"heroXP":300,"coins":150,"items":{"frost_shard":1}}},"quests":{"sq_herbs":{"start":"sq_herbs_start","done":"sq_herbs_done","requires":null,"objectives":[{"type":"item","item":"moon_herb","count":3}],"consume":{"moon_herb":3},"reward":{"heroXP":15,"coins":25,"items":{"elixir_life":1}}},"sq_hunter":{"start":"sq_hunter_start","done":"sq_hunter_done","requires":null,"objectives":[{"type":"enemy","id":"scavenger_02"}],"consume":{},"reward":{"heroXP":25,"coins":40,"items":{"tree_resin":2,"resin_flask":1,"amulet_focus":1}}},"sq_dust":{"start":"sq_dust_start","done":"sq_dust_done","requires":"lunar_quest_start","objectives":[{"type":"item","item":"rune_dust","count":1}],"consume":{"rune_dust":1},"reward":{"heroXP":20,"items":{"lunar_shard":1,"elixir_mana":1,"amulet_lunar":1},"schoolXP":{"telekinesis":15}}}},"research":{"telekinesis_2":{"ability":"telekinesis","toLevel":2,"branch":null,"locked":false,"heroLevel":3,"abilityLevel":1,"event":"lunar_quest_complete","schoolXP":150,"items":{"lunar_shard":5,"moon_herb":2,"rune_dust":1},"durationMs":300000,"startEvent":"telekinesis_2_start","completeEvent":"telekinesis_2_complete"},"fire_2":{"ability":"fire","toLevel":2,"branch":null,"locked":false,"heroLevel":6,"abilityLevel":1,"event":null,"schoolXP":180,"items":{"crimson_ember":6},"durationMs":900000,"startEvent":null,"completeEvent":null},"telekinesis_3_lord":{"ability":"telekinesis","toLevel":3,"branch":"lord","locked":false,"heroLevel":7,"abilityLevel":2,"event":null,"schoolXP":250,"items":{"lunar_shard":8,"rune_dust":3},"durationMs":3600000,"startEvent":null,"completeEvent":null},"telekinesis_3_breaker":{"ability":"telekinesis","toLevel":3,"branch":"breaker","locked":false,"heroLevel":7,"abilityLevel":2,"event":null,"schoolXP":250,"items":{"lunar_shard":8,"rune_dust":3},"durationMs":3600000,"startEvent":null,"completeEvent":null},"seal_2":{"ability":"seal","toLevel":2,"branch":null,"locked":false,"heroLevel":7,"abilityLevel":1,"event":null,"schoolXP":100,"items":{"lunar_shard":6},"durationMs":1800000,"startEvent":null,"completeEvent":null},"fire_3_arsonist":{"ability":"fire","toLevel":3,"branch":"arsonist","locked":false,"heroLevel":8,"abilityLevel":2,"event":null,"schoolXP":300,"items":{"crimson_ember":10},"durationMs":5400000,"startEvent":null,"completeEvent":null},"fire_3_blaster":{"ability":"fire","toLevel":3,"branch":"blaster","locked":false,"heroLevel":8,"abilityLevel":2,"event":null,"schoolXP":300,"items":{"crimson_ember":10},"durationMs":5400000,"startEvent":null,"completeEvent":null},"seal_3_seer":{"ability":"seal","toLevel":3,"branch":"seer","locked":false,"heroLevel":8,"abilityLevel":2,"event":null,"schoolXP":300,"items":{"lunar_shard":10,"rune_dust":4},"durationMs":7200000,"startEvent":null,"completeEvent":null},"seal_3_piercer":{"ability":"seal","toLevel":3,"branch":"piercer","locked":false,"heroLevel":8,"abilityLevel":2,"event":null,"schoolXP":300,"items":{"lunar_shard":10,"rune_dust":4},"durationMs":7200000,"startEvent":null,"completeEvent":null}},"build":{"respecCoins":150,"branches":{"telekinesis":{"lord":{"fromLevel":3},"breaker":{"fromLevel":3}},"fire":{"arsonist":{"fromLevel":3},"blaster":{"fromLevel":3}},"seal":{"seer":{"fromLevel":3},"piercer":{"fromLevel":3}},"ice":{"frost":{"fromLevel":3},"shard":{"fromLevel":3}}},"slots":{"base":3,"extraAtLevel":null},"amuletSlots":2,"amulets":["amulet_focus","amulet_forest","amulet_lunar","amulet_frost"],"gifts":["telekinesis","fire","seal","ice"],"amuletUpgrades":[{"coins":120,"items":{"tree_resin":2,"rune_dust":1}},{"coins":220,"items":{"ice_crystal":2,"rune_dust":2}},{"coins":400,"items":{"frost_shard":2,"lunar_shard":3}}]},"spawnStart":{"scavenger_01":{"event":"combat_intro_01","requires":null},"lunar_guard":{"event":"lunar_guard_01","requires":"lunar_quest_start"},"forest_guardian_01":{"event":"forest_guardian_01","requires":null},"scavenger_02":{"event":"hunter_threat_01","requires":"sq_hunter_start"}},"sapphires":{"speedup":{"chunkMs":900000,"price":1,"maxCutPct":0.75,"minLeftMs":60000,"dailyChunks":24},"respec":5,"presetPrice":30,"presetMax":3,"welcome":3},"shop":{"requires":"city_merchant_open","buy":{"moon_herb":18,"forest_mushroom":20,"tree_resin":16,"rune_dust":28,"lunar_shard":45,"frost_herb":22,"ice_crystal":55},"sell":{"moon_herb":5,"forest_mushroom":6,"tree_resin":5,"rune_dust":9,"lunar_shard":14,"frost_herb":7,"ice_crystal":18},"maxQty":99},"daily":{"requires":"ch2_quarter_cleared","offers":5,"picks":3,"dayMs":86400000,"order":["herbs_alchemist","archive_crystal","warm_test","guard_resin","society_dust","healer_elixirs","coven_mushrooms","hunt_collectors","hunt_critter","hunt_rootlings","construct_test","guardian_hunt","hunt_wolves","hunt_wisps"],"pool":{"herbs_alchemist":{"goal":{"type":"deliver","items":{"frost_herb":4}},"reward":{"heroXP":40,"coins":30,"items":{"moon_herb":1}},"requires":null},"archive_crystal":{"goal":{"type":"deliver","items":{"ice_crystal":1}},"reward":{"heroXP":50,"coins":25,"items":{"rune_dust":1}},"requires":null},"warm_test":{"goal":{"type":"deliver","items":{"warm_potion":1}},"reward":{"heroXP":45,"coins":35,"items":{"ice_crystal":1}},"requires":null},"guard_resin":{"goal":{"type":"deliver","items":{"tree_resin":3}},"reward":{"heroXP":35,"coins":25,"items":{"forest_mushroom":1}},"requires":null},"society_dust":{"goal":{"type":"deliver","items":{"rune_dust":2}},"reward":{"heroXP":40,"coins":30,"items":{"lunar_shard":1}},"requires":null},"healer_elixirs":{"goal":{"type":"deliver","items":{"elixir_life":2}},"reward":{"heroXP":50,"coins":40},"requires":null},"coven_mushrooms":{"goal":{"type":"deliver","items":{"forest_mushroom":3}},"reward":{"heroXP":35,"coins":25,"items":{"frost_herb":1}},"requires":null},"hunt_collectors":{"goal":{"type":"wins","spawns":["wh_collector_1","wh_collector_2","fq_deep_1","fq_deep_2"],"count":2},"reward":{"heroXP":60,"coins":40,"items":{"ice_crystal":1}},"requires":null},"hunt_critter":{"goal":{"type":"wins","spawns":["fq_critter"],"count":1},"reward":{"heroXP":40,"coins":25,"items":{"frost_herb":2}},"requires":null},"hunt_rootlings":{"goal":{"type":"wins","spawns":["rootling_01","rootling_02","rootling_03"],"count":2},"reward":{"heroXP":45,"coins":30,"items":{"tree_resin":2}},"requires":null},"construct_test":{"goal":{"type":"wins","spawns":["lab_construct"],"count":1},"reward":{"heroXP":60,"coins":40,"items":{"ice_crystal":2}},"requires":"ch2_lab_open"},"guardian_hunt":{"goal":{"type":"wins","spawns":["fq_guardian"],"count":1},"reward":{"heroXP":60,"coins":40,"items":{"ice_crystal":1}},"requires":null},"hunt_wolves":{"goal":{"type":"wins","spawns":["fw_wolf_1","fw_wolf_2","fw_wolf_3","fw_wolf_4"],"count":3},"reward":{"heroXP":60,"coins":40,"items":{"ice_crystal":1}},"requires":"chapter_2_complete"},"hunt_wisps":{"goal":{"type":"wins","spawns":["gy_wisp_1","gy_wisp_2"],"count":2},"reward":{"heroXP":55,"coins":35,"items":{"rune_dust":2}},"requires":"chapter_2_complete"}}},"covens":{"requires":"ch2_coven_ready","maxMembers":20,"goal":400,"minGiven":20,"dailyPoints":10,"maxGive":99,"points":{"moon_herb":1,"forest_mushroom":1,"tree_resin":1,"frost_herb":2,"rune_dust":2,"lunar_shard":3,"ice_crystal":5},"reward":{"coins":120,"items":{"ice_crystal":2,"frost_shard":1}}},"combatPotions":["elixir_life","elixir_mana","resin_flask","warm_potion","stabilizing_potion","brittle_flask","crystal_guard"]}'::jsonb $r$;
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

-- v0.15.0: общие помощники операций. _set_event — новое событие с наградой eventRewards (зеркало setEvent в playerModel.js).
create or replace function public._set_event(uid uuid, pr player_progress, ev text, rules jsonb) returns player_progress
language plpgsql security definer set search_path = public as $$
begin
  if _has_event(uid, ev) then return pr; end if;
  perform _add_event(uid, ev);
  if rules -> 'eventRewards' ? ev then pr := _grant(uid, pr, rules -> 'eventRewards' -> ev); end if;
  return pr;
end $$;
create or replace function public._unlock_ability(uid uuid, ab text, lvl int) returns void
language sql security definer set search_path = public as $$
  insert into player_abilities (user_id, ability_id, level, unlocked) values (uid, ab, lvl, true)
    on conflict (user_id, ability_id) do update set level = greatest(player_abilities.level, excluded.level), unlocked = true
$$;
create or replace function public._open_path(uid uuid, p text) returns void
language sql security definer set search_path = public as $$
  insert into player_world (user_id, kind, key) values (uid, 'path', p) on conflict do nothing
$$;
-- v0.16.0: в player_build лежат и слоты, амулеты, пресет — смена ветки их не трогает (JS: playerModel setBranch)
create or replace function public._set_branch(uid uuid, ab text, br text) returns void
language sql security definer set search_path = public as $$
  insert into player_world (user_id, kind, key, data) values (uid, 'object', 'player_build', jsonb_build_object('branches', jsonb_build_object(ab, br)))
    on conflict (user_id, kind, key) do update
      set data = coalesce(case when jsonb_typeof(player_world.data) = 'object' then player_world.data end, '{}'::jsonb)
        || jsonb_build_object('branches', coalesce(case when jsonb_typeof(player_world.data -> 'branches') = 'object' then player_world.data -> 'branches' end, '{}'::jsonb) || jsonb_build_object(ab, br))
$$;
-- v0.16.0: слитие ключей билда (слоты, амулеты, пресет) в player_build; остальные ключи (ветки) остаются
create or replace function public._merge_build(uid uuid, patch jsonb) returns void
language sql security definer set search_path = public as $$
  insert into player_world (user_id, kind, key, data) values (uid, 'object', 'player_build', patch)
    on conflict (user_id, kind, key) do update
      set data = coalesce(case when jsonb_typeof(player_world.data) = 'object' then player_world.data end, '{}'::jsonb) || patch
$$;
-- v0.23.0: доска поручений. Поручения дня — частичное перемешивание списка генератором Парка — Миллера (как dailyOffersOf в playerModel.js).
create or replace function public._daily_offers(dday bigint, ord jsonb, n int) returns text[]
language plpgsql immutable as $$
declare a text[]; x bigint; i int; j int; t text; len int;
begin
  select coalesce(array_agg(e order by o), '{}') into a from jsonb_array_elements_text(ord) with ordinality as q(e, o);
  len := coalesce(array_length(a, 1), 0);
  x := ((dday % 2147483646) + 2147483646) % 2147483646 + 1;
  for i in 0 .. least(n, len) - 1 loop
    x := (x * 48271) % 2147483647;
    j := i + (x % (len - i))::int;
    t := a[i + 1]; a[i + 1] := a[j + 1]; a[j + 1] := t;
  end loop;
  return a[1:least(n, len)];
end $$;
-- Победы на возобновляемых местах (счётчики rep:<место>.wins), как dailyWins
create or replace function public._daily_wins(uid uuid, spawns jsonb) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum((w.data ->> 'wins')::numeric), 0) from jsonb_array_elements_text(spawns) sp(id)
    join player_world w on w.user_id = uid and w.kind = 'object' and w.key = 'rep:' || sp.id
   where jsonb_typeof(w.data) = 'object' and jsonb_typeof(w.data -> 'wins') = 'number' and abs((w.data ->> 'wins')::numeric) < 1e15
$$;
-- Слотов даров: base, а с extraAtLevel уровня — ещё один; extraAtLevel = null — четвёртого слота уровнем нет (rules.build.slots; JS: config/build.js slotCount)
create or replace function public._slot_count(lvl int, b jsonb) returns int
language sql immutable as $$
  select (b -> 'slots' ->> 'base')::int + case when coalesce(lvl >= (b -> 'slots' ->> 'extraAtLevel')::int, false) then 1 else 0 end
$$;
-- Только строки из массива jsonb (остальное отбрасывается); не массив — пустой массив
create or replace function public._str_items(j jsonb) returns jsonb
language plpgsql immutable as $$
begin
  if j is null or jsonb_typeof(j) <> 'array' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(j) with ordinality t(e, i) where jsonb_typeof(e) = 'string'), '[]'::jsonb);
end $$;
-- Проверка выбора слотов и амулетов: null — можно, иначе причина. Порядок проверок как в JS (config/build.js checkBuild).
create or replace function public._build_reason(uid uuid, lvl int, in_combat boolean, sl jsonb, am jsonb, b jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  has_sl boolean := sl is not null and jsonb_typeof(sl) <> 'null';
  has_am boolean := am is not null and jsonb_typeof(am) <> 'null';
  n int;
begin
  if (has_sl and (jsonb_typeof(sl) <> 'array' or jsonb_array_length(sl) > 8 or exists (select 1 from jsonb_array_elements(sl) e where jsonb_typeof(e) <> 'string')))
     or (has_am and (jsonb_typeof(am) <> 'array' or jsonb_array_length(am) > 8 or exists (select 1 from jsonb_array_elements(am) e where jsonb_typeof(e) <> 'string')))
     or (not has_sl and not has_am) then return 'bad'; end if;
  if in_combat then return 'combat'; end if;
  if has_sl then
    n := jsonb_array_length(sl);
    if n = 0 then return 'none'; end if;
    if (select count(distinct e) from jsonb_array_elements_text(sl) e) <> n then return 'dup'; end if;
    if exists (select 1 from jsonb_array_elements_text(sl) e where not ((b -> 'gifts') ? e)) then return 'unknown'; end if;
    if exists (select 1 from jsonb_array_elements_text(sl) e where not exists (select 1 from player_abilities a where a.user_id = uid and a.ability_id = e and a.unlocked)) then return 'locked'; end if;
    if n > _slot_count(lvl, b) then return 'too_many'; end if;
  end if;
  if has_am then
    n := jsonb_array_length(am);
    if (select count(distinct e) from jsonb_array_elements_text(am) e) <> n then return 'dup'; end if;
    if exists (select 1 from jsonb_array_elements_text(am) e where not ((b -> 'amulets') ? e)) then return 'unknown'; end if;
    if exists (select 1 from jsonb_array_elements_text(am) e where _inv(uid, e) < 1) then return 'missing'; end if;
    if n > (b ->> 'amuletSlots')::int then return 'too_many'; end if;
  end if;
  return null;
end $$;
-- Слоты, которые действуют сейчас (для сохранения пресета): настроенные (только открытые дары, не больше слотов) или первые открытые по порядку.
-- JS: playerModel buildPreset (save).
create or replace function public._build_slots_now(uid uuid, lvl int, od jsonb, b jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := _slot_count(lvl, b); src jsonb;
begin
  if jsonb_typeof(od -> 'slots') = 'array' then src := _str_items(od -> 'slots'); else src := b -> 'gifts'; end if;
  return coalesce((select jsonb_agg(e order by i) from (
      select e, i from jsonb_array_elements_text(src) with ordinality t(e, i)
      where exists (select 1 from player_abilities a where a.user_id = uid and a.ability_id = e and a.unlocked)
      order by i limit n) z), '[]'::jsonb);
end $$;

-- v0.17.0: сколько пресетов билда открыто (1 — только бесплатный). JS: playerModel presetSlotsOf.
create or replace function public._preset_slots(od jsonb, rules jsonb) returns int
language plpgsql immutable as $$
declare v numeric := case when jsonb_typeof(od -> 'presetSlots') = 'number' then (od ->> 'presetSlots')::numeric end;
begin
  if v is null or v <> trunc(v) or v < 1 then return 1; end if;
  return least(v, (rules -> 'sapphires' ->> 'presetMax')::numeric)::int;
end $$;
-- v0.17.0: изменить баланс сапфиров с записью в журнал. Возвращает новый баланс; минус ниже нуля — ошибка (вызывающий проверяет заранее).
-- ref — ключ от повтора: с тем же ref второй раз ничего не происходит (возвращается null).
create or replace function public._sapphire_add(uid uuid, delta bigint, kind text, reason text, ref text) returns bigint
language plpgsql security definer set search_path = public as $$
declare bal bigint;
begin
  if ref is not null and exists (select 1 from sapphire_ledger where user_id = uid and sapphire_ledger.ref = _sapphire_add.ref) then return null; end if;
  insert into player_wallet (user_id) values (uid) on conflict (user_id) do nothing;
  update player_wallet set sapphires = sapphires + delta, updated_at = now() where user_id = uid returning sapphires into bal;
  insert into sapphire_ledger (user_id, delta, balance, kind, reason, ref) values (uid, delta, bal, kind, reason, ref);
  return bal;
end $$;
create or replace function public._sapphires(uid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((select sapphires from player_wallet where user_id = uid), 0)
$$;
-- v0.17.0: выдать сапфиры (покупка, награда, тестерам). Только сервис (Edge Function с ключом service_role) или владелец базы в SQL Editor:
--   select public.admin_grant_sapphires('<user uuid>', 100, 'тестер', 'test-2026-10-06-1');
-- ref обязателен: повтор с тем же ref не начислит второй раз. Возвращает баланс.
create or replace function public.admin_grant_sapphires(uid uuid, amount bigint, reason text, ref text, kind text default 'admin') returns bigint
language plpgsql security definer set search_path = public as $$
declare bal bigint;
begin
  if amount is null or amount <= 0 or amount > 1000000 then raise exception 'bad_amount' using errcode = '22023'; end if;
  if ref is null or char_length(ref) not between 1 and 128 then raise exception 'bad_ref' using errcode = '22023'; end if;
  if kind not in ('admin', 'purchase', 'reward') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if not exists (select 1 from player_progress where user_id = uid) then raise exception 'no_player' using errcode = 'P0002'; end if;
  bal := _sapphire_add(uid, amount, kind, reason, ref);
  return coalesce(bal, _sapphires(uid));
end $$;

create or replace function public.player_action(action jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pr player_progress%rowtype;
  op text; aid text; mx_hp numeric; mx_mana numeric; cur numeric; price numeric; coins numeric; res jsonb;
  rules jsonb; r jsonb; u jsonb; m jsonb; k text; v jsonb; missing jsonb; first boolean; prev jsonb; core boolean;
  wid text; od jsonb; now_ms numeric; lft numeric; wins numeric; claimed numeric; locked boolean;
  ab text; lvl int; curid text; opt jsonb; ev text;
  wl player_wallet%rowtype; sp jsonb; dur numeric; fullms numeric; started numeric; maxcut numeric; dday numeric; used numeric; avail numeric; cut numeric; steps numeric; price2 numeric; slot int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public._require_game_access();
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
  pr := _advance(pr);   -- v0.12.0: восстановление HP и маны до «сейчас», затем действие
  select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = pr.hero_level;
  if mx_hp is null then select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels order by level desc limit 1; end if;
  rules := _game_rules();
  if op = 'heal' then
    cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
    price := ceil((mx_hp - cur) / 10.0 - 1e-9);
    select quantity into coins from player_inventory where user_id = uid and item_id = 'coins';
    coins := coalesce(coins, 0);
    if pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat', 'price', 0);
    elsif price <= 0 then res := jsonb_build_object('ok', false, 'reason', 'full', 'price', 0);
    elsif coins < price then res := jsonb_build_object('ok', false, 'reason', 'coins', 'price', price);
    else
      update player_inventory set quantity = quantity - price where user_id = uid and item_id = 'coins';
      pr.hp := mx_hp;
      res := jsonb_build_object('ok', true, 'price', price);
    end if;
  elsif op = 'drink' then
    -- зелье из сумки вне боя: настой жизни / лунный эликсир возвращают долю максимума; при полном запасе не тратятся
    u := case when jsonb_typeof(action -> 'item') = 'string' then rules -> 'potions' -> (action ->> 'item') end;
    if u is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif _inv(uid, action ->> 'item') < 1 then res := jsonb_build_object('ok', false, 'reason', 'none');
    elsif u ->> 'kind' = 'heal' then
      cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
      if cur >= mx_hp then res := jsonb_build_object('ok', false, 'reason', 'full', 'kind', 'heal');
      else
        perform _inv_add(uid, action ->> 'item', -1);
        price := round(mx_hp * (u ->> 'amount')::numeric);
        pr.hp := least(mx_hp, cur + price);
        res := jsonb_build_object('ok', true, 'kind', 'heal', 'amount', pr.hp - cur);
      end if;
    else
      cur := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana);
      if cur >= mx_mana then res := jsonb_build_object('ok', false, 'reason', 'full', 'kind', 'mana');
      else
        perform _inv_add(uid, action ->> 'item', -1);
        price := round(mx_mana * (u ->> 'amount')::numeric);
        pr.mana := least(mx_mana, cur + price);
        res := jsonb_build_object('ok', true, 'kind', 'mana', 'amount', pr.mana - cur);
      end if;
    end if;
  elsif op = 'world' then
    -- v0.13.0: сбор узла, находка, запас или магия в мире (правила _game_rules().world; зеркало worldAct в playerModel.js).
    -- Порядок проверок: неизвестный объект → бой → закрыто → уже сделано / ещё не выросло → мана.
    wid := case when jsonb_typeof(action -> 'obj') = 'string' then action ->> 'obj' end;
    r := case when wid is not null then rules -> 'world' -> wid end;
    now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    else
      locked := exists (select 1 from jsonb_array_elements_text(r -> 'requires') e where not _has_event(uid, e))
        or exists (select 1 from jsonb_array_elements_text(r -> 'requiresEnemy') e where not exists (select 1 from player_world where user_id = uid and kind = 'enemy' and key = e))
        or (r ? 'parent' and coalesce((select data ->> 'state' from player_world where user_id = uid and kind = 'object' and key = r #>> '{parent,id}'), '') <> r #>> '{parent,state}')
        or (r ? 'ability' and not exists (select 1 from player_abilities where user_id = uid and ability_id = r ->> 'ability' and unlocked and level >= coalesce((r ->> 'minLevel')::int, 1)));
      select data into od from player_world where user_id = uid and kind = 'object' and key = wid;
      if locked then res := jsonb_build_object('ok', false, 'reason', 'locked');
      -- v0.18.0: дар для действия должен стоять в слоте (JS: equippedNow)
      elsif r ? 'ability' and not (_build_slots_now(uid, pr.hero_level,
              coalesce((select case when jsonb_typeof(data) = 'object' then data end from player_world where user_id = uid and kind = 'object' and key = 'player_build'), '{}'::jsonb),
              rules -> 'build') ? (r ->> 'ability')) then res := jsonb_build_object('ok', false, 'reason', 'benched');
      elsif exists (select 1 from jsonb_array_elements_text(coalesce(r -> 'blockedBy', '[]'::jsonb)) e where _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'done');
      elsif r ->> 'kind' in ('loot', 'cast') and r ? 'mark' and od ->> 'state' = r ->> 'mark' then res := jsonb_build_object('ok', false, 'reason', 'done');
      elsif r ->> 'kind' = 'gather' and od ->> 'state' = 'picked'
        and (coalesce(_num(od -> 't'), 0) + (r ->> 'respawnSec')::numeric * 1000 - now_ms) > 0 then
        lft := ceil((coalesce(_num(od -> 't'), 0) + (r ->> 'respawnSec')::numeric * 1000 - now_ms) / 1000);
        res := jsonb_build_object('ok', false, 'reason', 'wait', 'left', lft);
      else
        if r ->> 'kind' = 'stash' then
          select data into u from player_world where user_id = uid and kind = 'object' and key = 'rep:' || (r ->> 'guard');
          wins := coalesce(_num(u -> 'wins'), case when exists (select 1 from player_world where user_id = uid and kind = 'enemy' and key = r ->> 'guard') then 1 else 0 end);
          claimed := coalesce(_num(od -> 'claimed'), 0);
        end if;
        if r ->> 'kind' = 'stash' and wins <= 0 then res := jsonb_build_object('ok', false, 'reason', 'locked');
        elsif r ->> 'kind' = 'stash' and wins <= claimed then res := jsonb_build_object('ok', false, 'reason', 'done');
        elsif r ? 'mana' and _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana) < (r ->> 'mana')::numeric then
          res := jsonb_build_object('ok', false, 'reason', 'mana', 'mana', (r ->> 'mana')::numeric);
        else
          if r ? 'mana' then pr.mana := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana) - (r ->> 'mana')::numeric; end if;
          if r ->> 'kind' = 'gather' then
            perform _inv_add(uid, r ->> 'item', (r ->> 'amount')::numeric);
            insert into player_world (user_id, kind, key, data) values (uid, 'object', wid, jsonb_build_object('state', 'picked', 't', now_ms))
              on conflict (user_id, kind, key) do update set data = excluded.data;
          elsif r ->> 'kind' = 'loot' then
            pr := _grant(uid, pr, r -> 'reward');
            insert into player_world (user_id, kind, key, data) values (uid, 'object', wid, jsonb_build_object('state', r ->> 'mark'))
              on conflict (user_id, kind, key) do update set data = excluded.data;
          elsif r ->> 'kind' = 'stash' then
            pr := _grant(uid, pr, jsonb_build_object('items', r -> 'items'));
            insert into player_world (user_id, kind, key, data) values (uid, 'object', wid, coalesce(od, '{}'::jsonb) || jsonb_build_object('claimed', wins))
              on conflict (user_id, kind, key) do update set data = excluded.data;
          elsif r ? 'mark' then
            insert into player_world (user_id, kind, key, data) values (uid, 'object', wid, jsonb_build_object('state', r ->> 'mark'))
              on conflict (user_id, kind, key) do update set data = excluded.data;
          end if;
          -- v0.15.0: опыт дара за применение в мире, события и путь, которые открывает успех (с наградами событий)
          for k, v in select * from jsonb_each(coalesce(r -> 'school', '{}'::jsonb)) loop
            if (v #>> '{}')::numeric > 0 then
              pr.school_xp := jsonb_set(pr.school_xp, array[k], to_jsonb(_clamp(coalesce((pr.school_xp ->> k)::numeric, 0) + (v #>> '{}')::numeric, 0, 1000000000)));
            end if;
          end loop;
          for ev in select * from jsonb_array_elements_text(coalesce(r -> 'events', '[]'::jsonb)) loop pr := _set_event(uid, pr, ev, rules); end loop;
          if r ? 'path' then perform _open_path(uid, r ->> 'path'); end if;
          res := jsonb_build_object('ok', true, 'kind', r ->> 'kind', 'id', wid, 'mana', coalesce((r ->> 'mana')::numeric, 0));
        end if;
      end if;
    end if;
  elsif op = 'combat_start' then
    -- с этого момента восстановление стоит, а лечение и зелья из сумки закрыты; повтор не сдвигает начало.
    -- v0.14.0: сервер запоминает состояние героя — по нему Edge Function combat потом проигрывает запись боя.
    -- Клиент называет только место боя (spawn) и врага; допустимость пары проверяет проигрыш (cloud/combatVerify.js).
    if not coalesce(_valid_id(action ->> 'spawn'), false) or not coalesce(_valid_id(action ->> 'enemy'), false) then
      res := jsonb_build_object('ok', false, 'reason', 'bad_spawn');
    else
      if pr.combat_since is null then pr.combat_since := pr.vitals_at; end if;
      cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
      price := _clamp(coalesce(pr.mana::numeric, mx_mana), 0, mx_mana);
      pr.combat_ctx := jsonb_build_object(
        'spawn', action ->> 'spawn', 'enemy', action ->> 'enemy', 'level', pr.hero_level,
        'abilities', (select jsonb_object_agg(a, jsonb_build_object('level', coalesce(pa.level, 0), 'unlocked', coalesce(pa.unlocked, false)))
                        from unnest(array['telekinesis', 'fire', 'seal', 'ice']) a left join player_abilities pa on pa.user_id = uid and pa.ability_id = a),
        'hp', cur, 'mana', price,
        'potions', (select jsonb_object_agg(p, _inv(uid, p)) from jsonb_array_elements_text(rules -> 'combatPotions') p),   -- v0.19.0: список из правил
        'build', (select data from player_world where user_id = uid and kind = 'object' and key = 'player_build'));
      -- v0.15.0: событие «встреча началась» (combat_intro_01 и др.) ставит сервер, если место боя уже открыто
      u := rules -> 'spawnStart' -> (action ->> 'spawn');
      if u is not null and (u ->> 'requires' is null or _has_event(uid, u ->> 'requires')) then pr := _set_event(uid, pr, u ->> 'event', rules); end if;
      res := jsonb_build_object('ok', true, 'hp', cur, 'mana', price);
    end if;
  elsif op = 'combat_end' then
    -- итог боя без проверки записи — только отступление (перезагрузка посреди боя): HP не ниже 20% максимума, мана как была.
    -- Победа и поражение с v0.14.0 принимаются только через combat_apply (Edge Function combat), пока сервер запомнил состояние боя.
    -- Без запомненного состояния (бой начат до обновления) работает прежнее правило: остаток маны сообщает клиент.
    if pr.combat_since is null then res := jsonb_build_object('ok', false, 'reason', 'no_combat');
    elsif coalesce(action ->> 'outcome', '') not in ('victory', 'defeat', 'retreat') then res := jsonb_build_object('ok', false, 'reason', 'bad_outcome');
    elsif action ->> 'outcome' <> 'retreat' and pr.combat_ctx is not null then res := jsonb_build_object('ok', false, 'reason', 'verify');
    else
      cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
      price := greatest(1, ceil(mx_hp * (rules -> 'vitals' ->> 'defeatHpFraction')::numeric - 1e-9));
      if action ->> 'outcome' = 'victory' then pr.hp := mx_hp;
      elsif action ->> 'outcome' = 'defeat' then pr.hp := price;
      else pr.hp := greatest(cur, price);
      end if;
      if action ->> 'outcome' <> 'retreat' and _num(action -> 'mana') is not null then pr.mana := _clamp(_num(action -> 'mana'), 0, mx_mana); end if;
      pr.combat_since := null;
      pr.combat_ctx := null;
      res := jsonb_build_object('ok', true, 'outcome', action ->> 'outcome');
    end if;
  elsif op = 'event' then
    -- v0.15.0: сюжетное событие по действию игрока (rules.events: условия, дар, награда EVENT_REWARDS). Зеркало eventAct.
    ev := case when jsonb_typeof(action -> 'key') = 'string' then action ->> 'key' end;
    r := case when ev is not null then rules -> 'events' -> ev end;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif _has_event(uid, ev) then res := jsonb_build_object('ok', false, 'reason', 'already');
    elsif exists (select 1 from jsonb_array_elements_text(coalesce(r -> 'blockedBy', '[]')) e where _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'done');
    elsif exists (select 1 from jsonb_array_elements_text(r -> 'requires') e where not _has_event(uid, e)) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif exists (select 1 from jsonb_each(coalesce(r -> 'consume', '{}')) c where _inv(uid, c.key) < (c.value #>> '{}')::numeric) then res := jsonb_build_object('ok', false, 'reason', 'missing');
    else
      -- v0.22.0: предметы, которые забирает событие; ветка дара; сопутствующие события; сапфиры (один раз, ref event:<ключ>)
      for k, v in select * from jsonb_each(coalesce(r -> 'consume', '{}')) loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
      pr := _set_event(uid, pr, ev, rules);
      for k, v in select * from jsonb_each(r -> 'unlock') loop perform _unlock_ability(uid, k, (v #>> '{}')::int); end loop;
      for k, v in select * from jsonb_each(coalesce(r -> 'branch', '{}')) loop perform _set_branch(uid, k, v #>> '{}'); end loop;
      for k in select * from jsonb_array_elements_text(coalesce(r -> 'marks', '[]')) loop pr := _set_event(uid, pr, k, rules); end loop;
      if coalesce((r ->> 'sapphires')::bigint, 0) > 0 then perform _sapphire_add(uid, (r ->> 'sapphires')::bigint, 'reward', ev, 'event:' || ev); end if;
      res := jsonb_build_object('ok', true, 'key', ev);
    end if;
  elsif op = 'quest_accept' then
    r := case when jsonb_typeof(action -> 'quest') = 'string' then rules -> 'quests' -> (action ->> 'quest') end;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif _has_event(uid, r ->> 'done') or _has_event(uid, r ->> 'start') then res := jsonb_build_object('ok', false, 'reason', 'already');
    elsif r ->> 'requires' is not null and not _has_event(uid, r ->> 'requires') then res := jsonb_build_object('ok', false, 'reason', 'locked');
    else
      perform _add_event(uid, r ->> 'start');
      res := jsonb_build_object('ok', true, 'id', action ->> 'quest');
    end if;
  elsif op = 'quest_turn_in' then
    r := case when jsonb_typeof(action -> 'quest') = 'string' then rules -> 'quests' -> (action ->> 'quest') end;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif _has_event(uid, r ->> 'done') then res := jsonb_build_object('ok', false, 'reason', 'already');
    elsif not _has_event(uid, r ->> 'start') then res := jsonb_build_object('ok', false, 'reason', 'not_started');
    elsif exists (select 1 from jsonb_array_elements(r -> 'objectives') o where not (
        case o ->> 'type'
          when 'item' then _inv(uid, o ->> 'item') >= (o ->> 'count')::numeric
          when 'enemy' then exists (select 1 from player_world where user_id = uid and kind = 'enemy' and key = o ->> 'id')
          else _has_event(uid, o ->> 'key') end)) then res := jsonb_build_object('ok', false, 'reason', 'not_ready');
    elsif exists (select 1 from jsonb_each(r -> 'consume') where _inv(uid, key) < (value #>> '{}')::numeric) then res := jsonb_build_object('ok', false, 'reason', 'missing');
    else
      for k, v in select * from jsonb_each(r -> 'consume') loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
      perform _add_event(uid, r ->> 'done');
      pr := _grant(uid, pr, r -> 'reward');
      res := jsonb_build_object('ok', true, 'id', action ->> 'quest');
    end if;
  elsif op = 'research_start' then
    -- v0.15.0: изучение дара — условия, цена и таймер по времени сервера (rules.research). Зеркало researchStart.
    ev := case when jsonb_typeof(action -> 'upgrade') = 'string' then action ->> 'upgrade' end;
    u := case when ev is not null then rules -> 'research' -> ev end;
    if u is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    else
      ab := u ->> 'ability';
      lvl := coalesce((select level from player_abilities where user_id = uid and ability_id = ab), 0);
      now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
      if (u ->> 'locked')::boolean then res := jsonb_build_object('ok', false, 'reason', 'locked');
      elsif lvl >= (u ->> 'toLevel')::int then res := jsonb_build_object('ok', false, 'reason', 'done');
      elsif pr.research is not null then res := jsonb_build_object('ok', false, 'reason', case when pr.research ->> 'upgradeId' = ev then 'in_progress' else 'busy' end);
      elsif u ->> 'event' is not null and not _has_event(uid, u ->> 'event') then res := jsonb_build_object('ok', false, 'reason', 'event');
      elsif not (pr.hero_level >= (u ->> 'heroLevel')::int and lvl >= (u ->> 'abilityLevel')::int
          and coalesce((pr.school_xp ->> ab)::numeric, 0) >= (u ->> 'schoolXP')::numeric
          and not exists (select 1 from jsonb_each(u -> 'items') where _inv(uid, key) < (value #>> '{}')::numeric)) then
        res := jsonb_build_object('ok', false, 'reason', 'missing');
      else
        pr.school_xp := jsonb_set(pr.school_xp, array[ab], to_jsonb(coalesce((pr.school_xp ->> ab)::numeric, 0) - (u ->> 'schoolXP')::numeric));
        for k, v in select * from jsonb_each(u -> 'items') loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
        pr.research := jsonb_build_object('upgradeId', ev, 'startedAt', now_ms, 'durationMs', (u ->> 'durationMs')::numeric);
        if u ->> 'startEvent' is not null then pr := _set_event(uid, pr, u ->> 'startEvent', rules); end if;
        res := jsonb_build_object('ok', true, 'upgrade', ev);
      end if;
    end if;
  elsif op = 'research_finish' then
    if pr.research is null then res := jsonb_build_object('ok', false, 'reason', 'none');
    else
      ev := pr.research ->> 'upgradeId';
      u := rules -> 'research' -> ev;
      now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
      if u is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
      else
        lft := coalesce(_num(pr.research -> 'startedAt'), 0) + coalesce(_num(pr.research -> 'durationMs'), (u ->> 'durationMs')::numeric) - now_ms;
        if lft > 0 then res := jsonb_build_object('ok', false, 'reason', 'wait', 'left', ceil(lft / 1000));
        else
          perform _unlock_ability(uid, u ->> 'ability', (u ->> 'toLevel')::int);
          if u ->> 'branch' is not null then perform _set_branch(uid, u ->> 'ability', u ->> 'branch'); end if;
          pr.research := null;
          if u ->> 'completeEvent' is not null then pr := _set_event(uid, pr, u ->> 'completeEvent', rules); end if;
          res := jsonb_build_object('ok', true, 'upgrade', ev, 'events', case when u ->> 'completeEvent' is not null then jsonb_build_array(u ->> 'completeEvent') else '[]'::jsonb end);
        end if;
      end if;
    end if;
  elsif op = 'respec' then
    -- v0.15.0: смена ветки дара за монеты (rules.build). Зеркало respec.
    ab := case when jsonb_typeof(action -> 'ability') = 'string' and _valid_id(action ->> 'ability') then action ->> 'ability' end;
    ev := case when jsonb_typeof(action -> 'branch') = 'string' and _valid_id(action ->> 'branch') then action ->> 'branch' end;
    m := rules -> 'build';
    opt := case when ab is not null and ev is not null then m -> 'branches' -> ab -> ev end;
    lvl := coalesce((select level from player_abilities where user_id = uid and ability_id = ab), 0);
    select data -> 'branches' ->> ab into curid from player_world where user_id = uid and kind = 'object' and key = 'player_build';
    u := case when curid is not null and _valid_id(curid) and ab is not null then m -> 'branches' -> ab -> curid end;
    if opt is null or u is null or lvl < (u ->> 'fromLevel')::int or lvl < (opt ->> 'fromLevel')::int then res := jsonb_build_object('ok', false, 'reason', 'unavailable');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif curid = ev then res := jsonb_build_object('ok', false, 'reason', 'same');
    elsif action ->> 'pay' = 'sapphires' and jsonb_typeof(action -> 'pay') = 'string' then
      -- v0.17.0: смена ветки за сапфиры (rules.sapphires.respec)
      price2 := (rules -> 'sapphires' ->> 'respec')::numeric;
      if _sapphires(uid) < price2 then res := jsonb_build_object('ok', false, 'reason', 'sapphires', 'need', price2);
      else
        perform _sapphire_add(uid, -price2::bigint, 'respec', ab || ':' || ev, null);
        perform _set_branch(uid, ab, ev);
        res := jsonb_build_object('ok', true, 'price', price2, 'currency', 'sapphires');
      end if;
    elsif _inv(uid, 'coins') < (m ->> 'respecCoins')::numeric then res := jsonb_build_object('ok', false, 'reason', 'coins', 'need', (m ->> 'respecCoins')::numeric);
    else
      perform _inv_add(uid, 'coins', -(m ->> 'respecCoins')::numeric);
      perform _set_branch(uid, ab, ev);
      res := jsonb_build_object('ok', true, 'price', (m ->> 'respecCoins')::numeric);
    end if;
  elsif op = 'build_set' then
    -- v0.16.0: слоты даров и амулеты (rules.build). Зеркало buildSet; проверки — _build_reason.
    m := rules -> 'build';
    curid := _build_reason(uid, pr.hero_level, pr.combat_since is not null, action -> 'slots', action -> 'amulets', m);
    if curid is not null then res := jsonb_build_object('ok', false, 'reason', curid);
    else
      od := '{}'::jsonb;
      if jsonb_typeof(action -> 'slots') = 'array' then od := od || jsonb_build_object('slots', action -> 'slots'); end if;
      if jsonb_typeof(action -> 'amulets') = 'array' then od := od || jsonb_build_object('amulets', action -> 'amulets'); end if;
      perform _merge_build(uid, od);
      res := jsonb_build_object('ok', true);
    end if;
  elsif op = 'build_preset' then
    -- v0.16.0: пресет билда: слоты и амулеты (ветки за монеты не трогает). v0.17.0: номер пресета slot (1 — бесплатный, следующие — за сапфиры).
    -- Зеркало buildPreset.
    ev := case when jsonb_typeof(action -> 'mode') = 'string' then action ->> 'mode' end;
    m := rules -> 'build';
    select data into od from player_world where user_id = uid and kind = 'object' and key = 'player_build';
    od := case when jsonb_typeof(od) = 'object' then od else '{}'::jsonb end;
    cut := case when action -> 'slot' is null or jsonb_typeof(action -> 'slot') = 'null' then 1
                when jsonb_typeof(action -> 'slot') = 'number' then (action ->> 'slot')::numeric end;
    k := case when cut = 1 then 'preset' when cut between 2 and 99 and cut = trunc(cut) then 'preset' || cut::int end;
    if ev is null or ev not in ('save', 'load') then res := jsonb_build_object('ok', false, 'reason', 'bad');
    elsif cut is null or cut <> trunc(cut) or cut < 1 or cut > (rules -> 'sapphires' ->> 'presetMax')::numeric then res := jsonb_build_object('ok', false, 'reason', 'bad');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif cut > _preset_slots(od, rules) then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif ev = 'save' then
      perform _merge_build(uid, jsonb_build_object(k, jsonb_build_object(
        'slots', _build_slots_now(uid, pr.hero_level, od, m),
        'amulets', coalesce((select jsonb_agg(e order by i) from jsonb_array_elements_text(_str_items(od -> 'amulets')) with ordinality t(e, i) where (m -> 'amulets') ? e), '[]'::jsonb))));
      res := jsonb_build_object('ok', true);
    elsif jsonb_typeof(od -> k) <> 'object' or od -> k is null then res := jsonb_build_object('ok', false, 'reason', 'empty');
    else
      perform _merge_build(uid, jsonb_build_object('slots', _str_items(od -> k -> 'slots'), 'amulets', _str_items(od -> k -> 'amulets')));
      res := jsonb_build_object('ok', true);
    end if;
  elsif op = 'research_speedup' then
    -- v0.17.0: ускорить изучение за сапфиры (rules.sapphires.speedup). Зеркало researchSpeedup.
    sp := rules -> 'sapphires' -> 'speedup';
    steps := case when jsonb_typeof(action -> 'chunks') = 'number' then (action ->> 'chunks')::numeric end;
    if steps is null or steps <> trunc(steps) or steps < 1 or steps > 96 then res := jsonb_build_object('ok', false, 'reason', 'bad');
    elsif pr.research is null or jsonb_typeof(pr.research) <> 'object' then res := jsonb_build_object('ok', false, 'reason', 'none');
    else
      now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
      started := coalesce(_num(pr.research -> 'startedAt'), 0);
      u := case when jsonb_typeof(pr.research -> 'upgradeId') = 'string' then rules -> 'research' -> (pr.research ->> 'upgradeId') end;
      dur := coalesce(_num(pr.research -> 'durationMs'), (u ->> 'durationMs')::numeric, 0);
      fullms := coalesce(_num(pr.research -> 'fullMs'), dur);
      maxcut := dur - greatest(fullms - floor(fullms * (sp ->> 'maxCutPct')::numeric), now_ms - started + (sp ->> 'minLeftMs')::numeric);
      select * into wl from player_wallet where user_id = uid for update;
      dday := floor(now_ms / 86400000.0);
      used := case when coalesce(_num(wl.daily -> 'd'), -1) = dday then coalesce(_num(wl.daily -> 'n'), 0) else 0 end;
      avail := (sp ->> 'dailyChunks')::numeric - used;
      if maxcut <= 0 then res := jsonb_build_object('ok', false, 'reason', 'limit');
      elsif avail <= 0 then res := jsonb_build_object('ok', false, 'reason', 'daily');
      else
        cut := least(least(steps, avail) * (sp ->> 'chunkMs')::numeric, maxcut);
        steps := ceil(cut / (sp ->> 'chunkMs')::numeric);
        price2 := steps * (sp ->> 'price')::numeric;
        if coalesce(wl.sapphires, 0) < price2 then res := jsonb_build_object('ok', false, 'reason', 'sapphires', 'need', price2);
        else
          pr.research := pr.research || jsonb_build_object('durationMs', dur - cut, 'fullMs', fullms);
          perform _sapphire_add(uid, -price2::bigint, 'speedup', pr.research ->> 'upgradeId', null);
          update player_wallet set daily = jsonb_build_object('d', dday, 'n', used + steps) where user_id = uid;
          res := jsonb_build_object('ok', true, 'cutMs', cut, 'price', price2, 'leftMs', started + dur - cut - now_ms);
        end if;
      end if;
    end if;
  elsif op = 'preset_unlock' then
    -- v0.17.0: ещё один пресет билда за сапфиры. Зеркало presetUnlock.
    select data into od from player_world where user_id = uid and kind = 'object' and key = 'player_build';
    od := case when jsonb_typeof(od) = 'object' then od else '{}'::jsonb end;
    slot := _preset_slots(od, rules);
    price2 := (rules -> 'sapphires' ->> 'presetPrice')::numeric;
    if slot >= (rules -> 'sapphires' ->> 'presetMax')::int then res := jsonb_build_object('ok', false, 'reason', 'max');
    elsif _sapphires(uid) < price2 then res := jsonb_build_object('ok', false, 'reason', 'sapphires', 'need', price2);
    else
      perform _sapphire_add(uid, -price2::bigint, 'preset', 'preset' || (slot + 1), null);
      perform _merge_build(uid, jsonb_build_object('presetSlots', slot + 1));
      res := jsonb_build_object('ok', true, 'slots', slot + 1, 'price', price2);
    end if;
  elsif op = 'shop_buy' or op = 'shop_sell' then
    -- v0.19.0: торговец (rules.shop). Зеркало shopBuy / shopSell.
    m := rules -> 'shop';
    steps := case when action -> 'qty' is null or jsonb_typeof(action -> 'qty') = 'null' then 1
                  when jsonb_typeof(action -> 'qty') = 'number' then (action ->> 'qty')::numeric end;
    ev := case when jsonb_typeof(action -> 'item') = 'string' then action ->> 'item' end;
    price2 := case when ev is not null then _num(m -> (case when op = 'shop_buy' then 'buy' else 'sell' end) -> ev) end;
    if steps is null or steps <> trunc(steps) or steps < 1 or steps > (m ->> 'maxQty')::numeric then res := jsonb_build_object('ok', false, 'reason', 'bad');
    elsif price2 is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif not _has_event(uid, m ->> 'requires') then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif op = 'shop_buy' then
      if _inv(uid, 'coins') < price2 * steps then res := jsonb_build_object('ok', false, 'reason', 'coins', 'need', price2 * steps);
      else
        perform _inv_add(uid, 'coins', -(price2 * steps));
        perform _inv_add(uid, ev, steps);
        res := jsonb_build_object('ok', true, 'item', ev, 'qty', steps, 'cost', price2 * steps);
      end if;
    else
      if _inv(uid, ev) < steps then res := jsonb_build_object('ok', false, 'reason', 'missing');
      else
        perform _inv_add(uid, ev, -steps);
        perform _inv_add(uid, 'coins', price2 * steps);
        res := jsonb_build_object('ok', true, 'item', ev, 'qty', steps, 'gain', price2 * steps);
      end if;
    end if;
  elsif op = 'daily_take' or op = 'daily_done' then
    -- v0.23.0: доска поручений (rules.daily). Зеркало dailyTake / dailyDone; состояние — объект мира 'daily' { d, taken, done }.
    m := rules -> 'daily';
    ev := case when jsonb_typeof(action -> 'offer') = 'string' then action ->> 'offer' end;
    r := case when ev is not null then m -> 'pool' -> ev end;
    now_ms := (extract(epoch from pr.vitals_at) * 1000)::bigint;
    dday := floor(now_ms / (m ->> 'dayMs')::numeric);
    select data into od from player_world where user_id = uid and kind = 'object' and key = 'daily';
    if jsonb_typeof(od) = 'object' and jsonb_typeof(od -> 'd') = 'number' and (od ->> 'd')::numeric = dday then
      sp := (select coalesce(jsonb_object_agg(t.key, t.value), '{}'::jsonb) from jsonb_each(case when jsonb_typeof(od -> 'taken') = 'object' then od -> 'taken' else '{}'::jsonb end) t
              where (m -> 'pool') ? t.key and jsonb_typeof(t.value) = 'number' and abs((t.value #>> '{}')::numeric) < 1e15);
      u := (select coalesce(jsonb_agg(e order by o), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(od -> 'done') = 'array' then od -> 'done' else '[]'::jsonb end) with ordinality q(e, o)
             where jsonb_typeof(e) = 'string' and sp ? (e #>> '{}'));
    else sp := '{}'::jsonb; u := '[]'::jsonb; end if;
    if r is null then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif op = 'daily_take' then
      if not _has_event(uid, m ->> 'requires') then res := jsonb_build_object('ok', false, 'reason', 'locked');
      elsif not (ev = any(_daily_offers(dday::bigint, m -> 'order', (m ->> 'offers')::int))) then res := jsonb_build_object('ok', false, 'reason', 'unknown');
      elsif sp ? ev then res := jsonb_build_object('ok', false, 'reason', 'already');
      elsif (select count(*) from jsonb_object_keys(sp)) >= (m ->> 'picks')::int then res := jsonb_build_object('ok', false, 'reason', 'limit');
      elsif r ->> 'requires' is not null and not _has_event(uid, r ->> 'requires') then res := jsonb_build_object('ok', false, 'reason', 'locked');
      else
        sp := sp || jsonb_build_object(ev, case when r -> 'goal' ->> 'type' = 'wins' then _daily_wins(uid, r -> 'goal' -> 'spawns') else 0 end);
        insert into player_world (user_id, kind, key, data) values (uid, 'object', 'daily', jsonb_build_object('d', dday, 'taken', sp, 'done', u))
          on conflict (user_id, kind, key) do update set data = excluded.data;
        res := jsonb_build_object('ok', true, 'offer', ev);
      end if;
    else
      if not (sp ? ev) then res := jsonb_build_object('ok', false, 'reason', 'not_taken');
      elsif u @> jsonb_build_array(ev) then res := jsonb_build_object('ok', false, 'reason', 'already');
      elsif r -> 'goal' ->> 'type' = 'deliver' and exists (select 1 from jsonb_each(r -> 'goal' -> 'items') e where _inv(uid, e.key) < (e.value #>> '{}')::numeric) then
        res := jsonb_build_object('ok', false, 'reason', 'missing');
      elsif r -> 'goal' ->> 'type' = 'wins' and _daily_wins(uid, r -> 'goal' -> 'spawns') - (sp ->> ev)::numeric < (r -> 'goal' ->> 'count')::numeric then
        res := jsonb_build_object('ok', false, 'reason', 'progress');
      else
        if r -> 'goal' ->> 'type' = 'deliver' then
          for k, v in select * from jsonb_each(r -> 'goal' -> 'items') loop perform _inv_add(uid, k, -(v #>> '{}')::numeric); end loop;
        end if;
        u := u || jsonb_build_array(ev);
        insert into player_world (user_id, kind, key, data) values (uid, 'object', 'daily', jsonb_build_object('d', dday, 'taken', sp, 'done', u))
          on conflict (user_id, kind, key) do update set data = excluded.data;
        pr := _grant(uid, pr, r -> 'reward');
        -- v0.25.0: поручение приносит очки ковену игрока (если миграция ковенов установлена)
        if to_regprocedure('public._coven_add_points(uuid,integer)') is not null then
          perform public._coven_add_points(uid, (rules -> 'covens' ->> 'dailyPoints')::int);
        end if;
        res := jsonb_build_object('ok', true, 'offer', ev);
      end if;
    end if;
  elsif op = 'coven_give' then
    -- v0.25.0: материалы в недельную цель ковена (функции — supabase/migrations/20261007_covens.sql). Без ковена — 'no_coven' (как JS-зеркало).
    if to_regprocedure('public._coven_give(uuid,text,jsonb,jsonb)') is null then res := jsonb_build_object('ok', false, 'reason', 'no_coven');
    else res := public._coven_give(uid, case when jsonb_typeof(action -> 'item') = 'string' then action ->> 'item' end, action -> 'qty', rules); end if;
  elsif op = 'coven_claim' then
    -- v0.25.0: награда недели ковена (один раз за неделю, если цель набрана и есть личный вклад)
    if to_regprocedure('public._coven_claim(uuid,jsonb)') is null then res := jsonb_build_object('ok', false, 'reason', 'no_coven');
    else
      res := public._coven_claim(uid, rules);
      if (res ->> 'ok')::boolean then pr := _grant(uid, pr, rules -> 'covens' -> 'reward'); end if;
    end if;
  elsif op = 'amulet_upgrade' then
    -- v0.19.0: улучшение амулета +1…+3 (rules.build.amuletUpgrades). Зеркало amuletUpgrade.
    m := rules -> 'build';
    ev := case when jsonb_typeof(action -> 'amulet') = 'string' then action ->> 'amulet' end;
    select data into od from player_world where user_id = uid and kind = 'object' and key = 'player_build';
    od := case when jsonb_typeof(od) = 'object' then od else '{}'::jsonb end;
    v := case when jsonb_typeof(od -> 'amuletLevels') = 'object' then od -> 'amuletLevels' else '{}'::jsonb end;
    cut := case when ev is not null and jsonb_typeof(v -> ev) = 'number' and (v ->> ev)::numeric = trunc((v ->> ev)::numeric) and (v ->> ev)::numeric > 0
                then least((v ->> ev)::numeric, jsonb_array_length(m -> 'amuletUpgrades')) else 0 end;
    if ev is null or not ((m -> 'amulets') ? ev) then res := jsonb_build_object('ok', false, 'reason', 'unknown');
    elsif _inv(uid, ev) < 1 then res := jsonb_build_object('ok', false, 'reason', 'locked');
    elsif pr.combat_since is not null then res := jsonb_build_object('ok', false, 'reason', 'combat');
    elsif cut >= jsonb_array_length(m -> 'amuletUpgrades') then res := jsonb_build_object('ok', false, 'reason', 'max');
    else
      u := m -> 'amuletUpgrades' -> cut::int;
      r := jsonb_build_object('coins', u -> 'coins') || (u -> 'items');
      if exists (select 1 from jsonb_each(r) e where _inv(uid, e.key) < (e.value #>> '{}')::numeric) then res := jsonb_build_object('ok', false, 'reason', 'missing');
      else
        for k in select jsonb_object_keys(r) loop perform _inv_add(uid, k, -((r ->> k)::numeric)); end loop;
        perform _merge_build(uid, jsonb_build_object('amuletLevels', v || jsonb_build_object(ev, cut + 1)));
        res := jsonb_build_object('ok', true, 'amulet', ev, 'level', cut + 1);
      end if;
    end if;
  elsif op = 'bank_welcome' then
    -- v0.17.0: приветственные сапфиры, один раз. Зеркало bankWelcome.
    insert into player_wallet (user_id) values (uid) on conflict (user_id) do nothing;
    select * into wl from player_wallet where user_id = uid for update;
    if wl.welcome then res := jsonb_build_object('ok', false, 'reason', 'already');
    else
      perform _sapphire_add(uid, (rules -> 'sapphires' ->> 'welcome')::bigint, 'welcome', 'кошелёк открыт', 'welcome');
      update player_wallet set welcome = true where user_id = uid;
      res := jsonb_build_object('ok', true, 'amount', (rules -> 'sapphires' ->> 'welcome')::numeric);
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
  update player_progress set hp = pr.hp, mana = pr.mana, hero_xp = pr.hero_xp, hero_level = pr.hero_level, school_xp = pr.school_xp, research = pr.research,
    vitals_at = pr.vitals_at, combat_since = pr.combat_since, combat_ctx = pr.combat_ctx,
    recent_syncs = pr.recent_syncs, recent_actions = pr.recent_actions, rev = pr.rev + 1, updated_at = now() where user_id = uid;
  return _snapshot(uid) || jsonb_build_object('action', res);
end $$;

-- ---------------------------------------------------------------- v0.14.0: бой проверяет сервер
-- Эти две функции вызывает только Edge Function combat (ключ service_role); из браузера они недоступны.
-- combat_load: состояние игрока (с combatSince и combatCtx) — Edge Function проигрывает по нему запись боя.
create or replace function public.combat_load(uid uuid) returns jsonb
language sql security definer set search_path = public as $$ select _snapshot(uid) $$;

-- combat_apply: применить итог боя, который Edge Function получила, проиграв запись (зеркало playerModel.combatApply).
-- verdict: { outcome, since, spawn, mana, potions, reward, coinsLost, path, events, rep, entry }. Принимается один раз:
-- бой должен идти (combat_since и combat_ctx), совпадать по началу и месту; потом оба поля очищаются.
create or replace function public.combat_apply(uid uuid, verdict jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pr player_progress%rowtype; ctx jsonb; res jsonb; outc text; mx_hp numeric; mx_mana numeric; cur numeric; fl numeric;
  k text; v jsonb; used numeric; have numeric; lost numeric;
begin
  select * into pr from player_progress where user_id = uid for update;
  if not found then raise exception 'no_player' using errcode = 'P0002'; end if;
  pr := _advance(pr);
  ctx := pr.combat_ctx;
  outc := case when jsonb_typeof(verdict) = 'object' then verdict ->> 'outcome' end;
  select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = pr.hero_level;
  if mx_hp is null then select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels order by level desc limit 1; end if;
  if pr.combat_since is null or ctx is null then res := jsonb_build_object('ok', false, 'reason', 'no_combat');
  elsif outc is null or outc not in ('victory', 'defeat', 'retreat') then res := jsonb_build_object('ok', false, 'reason', 'bad_verdict');
  elsif _num(verdict -> 'since') is distinct from (extract(epoch from pr.combat_since) * 1000)::bigint or verdict ->> 'spawn' is distinct from ctx ->> 'spawn' then
    res := jsonb_build_object('ok', false, 'reason', 'stale');
  else
    cur := _clamp(coalesce(pr.hp::numeric, mx_hp), 0, mx_hp);
    if outc <> 'retreat' then
      -- зелья: в сумке остаётся не больше, чем было в начале боя минус выпитое
      for k in select jsonb_object_keys(coalesce(ctx -> 'potions', '{}'::jsonb)) loop
        used := trunc(coalesce(_num(verdict -> 'potions' -> k), 0));
        if used > 0 then
          have := _inv(uid, k);
          perform _inv_add(uid, k, least(have, greatest(0, coalesce(_num(ctx -> 'potions' -> k), 0) - used)) - have);
        end if;
      end loop;
      pr := _grant(uid, pr, coalesce(verdict -> 'reward', '{}'::jsonb));
      lost := trunc(coalesce(_num(verdict -> 'coinsLost'), 0));
      if lost > 0 then perform _inv_add(uid, 'coins', -lost); end if;
      if outc = 'victory' then
        insert into player_world (user_id, kind, key, data) values (uid, 'enemy', ctx ->> 'spawn', '{}'::jsonb) on conflict (user_id, kind, key) do nothing;
        if _valid_id(verdict ->> 'path') then
          insert into player_world (user_id, kind, key, data) values (uid, 'path', verdict ->> 'path', '{}'::jsonb) on conflict (user_id, kind, key) do nothing;
        end if;
        if jsonb_typeof(verdict -> 'events') = 'array' then
          for k in select jsonb_array_elements_text(verdict -> 'events') loop
            if _valid_id(k) then perform _add_event(uid, k); end if;
          end loop;
        end if;
        if jsonb_typeof(verdict -> 'rep') = 'object' and _valid_id(verdict -> 'rep' ->> 'key') then
          insert into player_world (user_id, kind, key, data)
            values (uid, 'object', verdict -> 'rep' ->> 'key', jsonb_build_object('wins', trunc(coalesce(_num(verdict -> 'rep' -> 'wins'), 0)), 'at', coalesce(_num(verdict -> 'rep' -> 'at'), 0)))
            on conflict (user_id, kind, key) do update set data = player_world.data || excluded.data;
        end if;
      end if;
      if jsonb_typeof(verdict -> 'entry') = 'object' then
        pr.combats := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from (
          select e, i from jsonb_array_elements(pr.combats || jsonb_build_array(verdict -> 'entry')) with ordinality as t(e, i) order by i desc limit 50) z);
      end if;
    end if;
    select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels where level = pr.hero_level;   -- после награды уровень мог вырасти
    if mx_hp is null then select max_hp, max_mana into mx_hp, mx_mana from game_hero_levels order by level desc limit 1; end if;
    fl := greatest(1, ceil(mx_hp * (_game_rules() -> 'vitals' ->> 'defeatHpFraction')::numeric - 1e-9));
    pr.hp := case outc when 'victory' then mx_hp when 'defeat' then fl else greatest(cur, fl) end;
    if outc <> 'retreat' and _num(verdict -> 'mana') is not null then pr.mana := _clamp(_num(verdict -> 'mana'), 0, mx_mana); end if;
    pr.combat_since := null;
    pr.combat_ctx := null;
    res := jsonb_build_object('ok', true, 'outcome', outc);
  end if;
  update player_progress set hp = pr.hp, mana = pr.mana, hero_xp = pr.hero_xp, hero_level = pr.hero_level, school_xp = pr.school_xp,
    vitals_at = pr.vitals_at, combat_since = pr.combat_since, combat_ctx = pr.combat_ctx, combats = pr.combats,
    rev = pr.rev + 1, updated_at = now() where user_id = uid;
  return _snapshot(uid) || jsonb_build_object('action', res);
end $$;

-- ---------------------------------------------------------------- превращение гостя в игрока с ником
-- Эти две функции вызывает только Edge Function account (ключ service_role); из браузера они недоступны.
-- ---------------------------------------------------------------- права на функции
revoke all on function public._num(jsonb), public._clamp(numeric, numeric, numeric), public._valid_id(text), public._snapshot(uuid) from public, anon, authenticated;
-- v0.10.0: служебные функции действий — только изнутри player_action
revoke all on function public._game_rules(), public._has_event(uuid, text), public._inv(uuid, text), public._inv_add(uuid, text, numeric),
  public._add_event(uuid, text), public._grant(uuid, player_progress, jsonb), public._advance(player_progress) from public, anon, authenticated;
-- v0.16.0: эти служебные функции (security definer, принимают чужой uid) были открыты для вызова из браузера — закрыто
revoke all on function public._set_event(uuid, player_progress, text, jsonb), public._unlock_ability(uuid, text, int), public._open_path(uuid, text),
  public._set_branch(uuid, text, text), public._merge_build(uuid, jsonb), public._slot_count(int, jsonb), public._str_items(jsonb),
  public._build_reason(uuid, int, boolean, jsonb, jsonb, jsonb), public._build_slots_now(uuid, int, jsonb, jsonb) from public, anon, authenticated;
-- v0.17.0: сапфиры. Выдавать может только сервис (service_role) или владелец базы; игрок тратит только через player_action.
revoke all on function public._daily_offers(bigint, jsonb, int), public._daily_wins(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._sapphire_add(uuid, bigint, text, text, text), public._sapphires(uuid), public._preset_slots(jsonb, jsonb),
  public.admin_grant_sapphires(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_grant_sapphires(uuid, bigint, text, text, text) to service_role;
revoke all on function public.create_player(text), public.get_player(), public.reset_player(text), public.sync_player(jsonb), public.player_action(jsonb) from public, anon;
grant execute on function public.create_player(text), public.get_player(), public.reset_player(text), public.sync_player(jsonb), public.player_action(jsonb) to authenticated;
revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;
revoke all on function public.combat_load(uuid), public.combat_apply(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.combat_load(uuid), public.combat_apply(uuid, jsonb) to service_role;
revoke all on function public.claim_nickname(uuid, text, text), public.release_nickname(uuid) from public, anon, authenticated;
grant execute on function public.claim_nickname(uuid, text, text), public.release_nickname(uuid) to service_role;
-- _num/_clamp/_valid_id нужны вызывающим функциям, а они security definer (права владельца), поэтому отдельный доступ клиенту не нужен
