-- v0.25.0 — Ковены, первая версия (stage-2-design-pack §26). Run AFTER supabase/schema.sql and the chat migrations
-- (20261004_game_chat.sql, 20261004_chat_roles_v2.sql). Additive, repeatable; never resets progress.
--
-- Что здесь: таблицы ковенов и участников, роли (leader / officer / member), чат ковена — комната kind 'coven' в game_chat
-- (видна и доступна только участникам), недельная цель ковена (очки) и RPC coven_request для окна ковенов.
-- Материалы в ковен и награда недели идут через player_action (операции coven_give / coven_claim в schema.sql вызывают функции
-- отсюда): так сумка игрока меняется тем же путём, что и всё остальное, и клиент сразу получает снимок.
begin;

-- ---------------------------------------------------------------- чат: комната ковена
alter table game_chat.rooms drop constraint if exists rooms_kind_check;
alter table game_chat.rooms add constraint rooms_kind_check check (kind in ('general','help','news','dm','coven'));
drop index if exists game_chat.chat_public_room;
create unique index if not exists chat_public_room on game_chat.rooms(kind) where kind not in ('dm','coven');
-- личные и ковенские комнаты — только для участников
create or replace function game_chat.can_room(u uuid,r uuid) returns boolean language sql stable set search_path='' as $$
  select not game_chat.banned(u,'game') and exists(select 1 from game_chat.rooms where id=r and
    (kind not in ('dm','coven') or exists(select 1 from game_chat.members where room_id=r and user_id=u)))
$$;

-- ---------------------------------------------------------------- таблицы
create table if not exists public.covens (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_norm   text not null unique,
  motto       text not null default '',
  room_id     uuid references game_chat.rooms(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  week_start  date,
  week_points int not null default 0,
  check (char_length(name) between 3 and 24),
  check (char_length(motto) <= 80)
);
create table if not exists public.coven_members (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  coven_id     uuid not null references public.covens(id) on delete cascade,
  role         text not null default 'member' check (role in ('leader','officer','member')),
  joined_at    timestamptz not null default now(),
  week_start   date,
  week_given   int not null default 0,
  claimed_week date
);
create index if not exists coven_members_coven on public.coven_members(coven_id);
alter table public.covens enable row level security;
alter table public.coven_members enable row level security;
revoke all on public.covens, public.coven_members from anon, authenticated;

-- ---------------------------------------------------------------- помощники
-- текущая неделя ковена (понедельник, UTC)
create or replace function public._coven_week() returns date language sql stable set search_path='' as $$
  select (date_trunc('week', now() at time zone 'utc'))::date
$$;
-- новая неделя: очки ковена и личные вклады обнуляются (лениво, при первом обращении)
create or replace function public._coven_fix_week(cid uuid) returns void language plpgsql security definer set search_path='' as $$
declare wk date := public._coven_week();
begin
  update public.covens set week_points = 0, week_start = wk where id = cid and week_start is distinct from wk;
  update public.coven_members set week_given = 0, week_start = wk where coven_id = cid and week_start is distinct from wk;
end $$;
-- очки ковену и вклад участника (поручения доски, материалы); 0 — игрок не в ковене
create or replace function public._coven_add_points(uid uuid, pts integer) returns integer language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  select coven_id into cid from public.coven_members where user_id = uid;
  if cid is null or pts is null or pts <= 0 then return 0; end if;
  perform public._coven_fix_week(cid);
  update public.covens set week_points = week_points + pts where id = cid;
  update public.coven_members set week_given = week_given + pts where user_id = uid;
  return pts;
end $$;
-- материалы в ковен (из player_action: op coven_give). Зеркало в JS — 'no_coven' (у JS-модели ковенов нет).
create or replace function public._coven_give(uid uuid, item text, qty jsonb, rules jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb := rules -> 'covens'; n numeric; per numeric;
begin
  if not exists (select 1 from public.coven_members where user_id = uid) then return jsonb_build_object('ok', false, 'reason', 'no_coven'); end if;
  per := case when item is not null then (c -> 'points' ->> item)::numeric end;
  if per is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  n := case when jsonb_typeof(qty) = 'number' then (qty #>> '{}')::numeric end;
  if n is null or n <> trunc(n) or n < 1 or n > (c ->> 'maxGive')::numeric then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if public._inv(uid, item) < n then return jsonb_build_object('ok', false, 'reason', 'missing'); end if;
  perform public._inv_add(uid, item, -n);
  perform public._coven_add_points(uid, (n * per)::int);
  return jsonb_build_object('ok', true, 'item', item, 'qty', n, 'points', n * per);
end $$;
-- награда недели (из player_action: op coven_claim; саму награду выдаёт player_action через _grant)
create or replace function public._coven_claim(uid uuid, rules jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb := rules -> 'covens'; m public.coven_members%rowtype; pts int; wk date := public._coven_week();
begin
  select * into m from public.coven_members where user_id = uid;
  if m.user_id is null then return jsonb_build_object('ok', false, 'reason', 'no_coven'); end if;
  perform public._coven_fix_week(m.coven_id);
  select * into m from public.coven_members where user_id = uid for update;
  select week_points into pts from public.covens where id = m.coven_id;
  if m.claimed_week = wk then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  if pts < (c ->> 'goal')::int then return jsonb_build_object('ok', false, 'reason', 'progress', 'points', pts); end if;
  if m.week_given < (c ->> 'minGiven')::int then return jsonb_build_object('ok', false, 'reason', 'given', 'given', m.week_given); end if;
  update public.coven_members set claimed_week = wk where user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- что видит участник: ковен, неделя, состав (по публичной ссылке chat_ref, без user id)
create or replace function public._coven_view(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.coven_members%rowtype; cv public.covens%rowtype; c jsonb := public._game_rules() -> 'covens'; wk date := public._coven_week();
begin
  select * into m from public.coven_members where user_id = u;
  if m.user_id is null then return jsonb_build_object('coven', null); end if;
  perform public._coven_fix_week(m.coven_id);
  select * into m from public.coven_members where user_id = u;
  select * into cv from public.covens where id = m.coven_id;
  return jsonb_build_object('coven', jsonb_build_object(
    'id', cv.id, 'name', cv.name, 'motto', cv.motto, 'myRole', m.role, 'myGiven', m.week_given,
    'claimed', m.claimed_week = wk, 'points', cv.week_points, 'goal', (c ->> 'goal')::int, 'minGiven', (c ->> 'minGiven')::int,
    'weekEnds', (wk + 7)::timestamptz at time zone 'utc',
    'members', coalesce((select jsonb_agg(jsonb_build_object('ref', p.chat_ref, 'nickname', coalesce(p.nickname, 'Гость'), 'role', x.role,
        'given', x.week_given, 'me', x.user_id = u) order by case x.role when 'leader' then 0 when 'officer' then 1 else 2 end, x.week_given desc, x.joined_at)
      from public.coven_members x join public.profiles p on p.id = x.user_id where x.coven_id = cv.id), '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- RPC окна ковенов
-- op: mine | list | create {name, motto} | join {coven} | leave | kick {ref} | promote {ref} | demote {ref} | transfer {ref} | motto {motto}
-- Ответ: { ok, reason?, ...вид }. Ошибки игрока — reason, а не исключение (их показывает окно).
create or replace function public.coven_request(op text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid(); c jsonb := public._game_rules() -> 'covens';
  me public.coven_members%rowtype; tg public.coven_members%rowtype; cv public.covens%rowtype;
  nm text; nn text; mt text; rid uuid; cid uuid; tuid uuid; cnt int;
  fail jsonb;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public._require_game_access();
  if not exists (select 1 from public.player_progress where user_id = u) then raise exception 'no_player' using errcode = 'P0002'; end if;
  args := case when jsonb_typeof(args) = 'object' then args else '{}'::jsonb end;
  select * into me from public.coven_members where user_id = u for update;
  if op = 'mine' then return jsonb_build_object('ok', true) || public._coven_view(u);
  elsif op = 'list' then
    return jsonb_build_object('ok', true, 'inCoven', me.user_id is not null,
      'canCreate', exists (select 1 from public.player_quests where user_id = u and quest_id = c ->> 'requires'),
      'maxMembers', (c ->> 'maxMembers')::int,
      'covens', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'motto', x.motto, 'members', x.n,
          'points', case when x.week_start = public._coven_week() then x.week_points else 0 end) order by x.pts desc, x.n desc, x.name)
        from (select v.*, (select count(*) from public.coven_members w where w.coven_id = v.id)::int n,
                     case when v.week_start = public._coven_week() then v.week_points else 0 end pts
                from public.covens v) x limit 50), '[]'::jsonb));
  end if;
  fail := null;
  if op in ('create', 'join') then
    if me.user_id is not null then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
    if not exists (select 1 from public.player_quests where user_id = u and quest_id = c ->> 'requires') then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
    if not exists (select 1 from public.profiles where id = u and nickname is not null) then return jsonb_build_object('ok', false, 'reason', 'register'); end if;
    if op = 'create' then
      nm := btrim(regexp_replace(coalesce(args ->> 'name', ''), '\s+', ' ', 'g'));
      if char_length(nm) not between 3 and 24 or nm !~ '^[A-Za-zА-Яа-яЁё0-9 _-]+$' then return jsonb_build_object('ok', false, 'reason', 'bad_name'); end if;
      nn := lower(nm);
      if exists (select 1 from public.covens where name_norm = nn) then return jsonb_build_object('ok', false, 'reason', 'name_taken'); end if;
      mt := left(btrim(regexp_replace(coalesce(args ->> 'motto', ''), '\s+', ' ', 'g')), 80);
      insert into game_chat.rooms(kind, title) values ('coven', nm) returning id into rid;
      insert into public.covens(name, name_norm, motto, room_id, created_by, week_start) values (nm, nn, mt, rid, u, public._coven_week()) returning id into cid;
      insert into public.coven_members(user_id, coven_id, role, week_start) values (u, cid, 'leader', public._coven_week());
      insert into game_chat.members(room_id, user_id) values (rid, u) on conflict do nothing;
    else
      cid := case when coalesce(args ->> 'coven', '') ~ '^[0-9a-f-]{36}$' then (args ->> 'coven')::uuid end;
      select * into cv from public.covens where id = cid for update;
      if cv.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
      select count(*) into cnt from public.coven_members where coven_id = cv.id;
      if cnt >= (c ->> 'maxMembers')::int then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
      insert into public.coven_members(user_id, coven_id, role, week_start) values (u, cv.id, 'member', public._coven_week());
      if cv.room_id is not null then insert into game_chat.members(room_id, user_id) values (cv.room_id, u) on conflict do nothing; end if;
    end if;
    return jsonb_build_object('ok', true) || public._coven_view(u);
  end if;
  if me.user_id is null then return jsonb_build_object('ok', false, 'reason', 'no_coven'); end if;
  select * into cv from public.covens where id = me.coven_id for update;
  if op = 'leave' then
    select count(*) into cnt from public.coven_members where coven_id = cv.id;
    if me.role = 'leader' and cnt > 1 then return jsonb_build_object('ok', false, 'reason', 'leader'); end if;
    delete from public.coven_members where user_id = u;
    if cv.room_id is not null then delete from game_chat.members where room_id = cv.room_id and user_id = u; end if;
    if cnt <= 1 then
      if cv.room_id is not null then delete from game_chat.rooms where id = cv.room_id; end if;
      delete from public.covens where id = cv.id;
    end if;
    return jsonb_build_object('ok', true, 'coven', null);
  elsif op = 'motto' then
    if me.role not in ('leader', 'officer') then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
    update public.covens set motto = left(btrim(regexp_replace(coalesce(args ->> 'motto', ''), '\s+', ' ', 'g')), 80) where id = cv.id;
    return jsonb_build_object('ok', true) || public._coven_view(u);
  elsif op in ('kick', 'promote', 'demote', 'transfer') then
    tuid := (select p.id from public.profiles p where coalesce(args ->> 'ref', '') ~ '^[0-9a-f-]{36}$' and p.chat_ref = (args ->> 'ref')::uuid);
    select * into tg from public.coven_members where user_id = tuid and coven_id = cv.id for update;
    if tg.user_id is null or tg.user_id = u then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    if op = 'kick' then
      if not (me.role = 'leader' or (me.role = 'officer' and tg.role = 'member')) then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
      delete from public.coven_members where user_id = tg.user_id;
      if cv.room_id is not null then delete from game_chat.members where room_id = cv.room_id and user_id = tg.user_id; end if;
    elsif me.role <> 'leader' then return jsonb_build_object('ok', false, 'reason', 'forbidden');
    elsif op = 'promote' then
      if tg.role <> 'member' then return jsonb_build_object('ok', false, 'reason', 'same'); end if;
      update public.coven_members set role = 'officer' where user_id = tg.user_id;
    elsif op = 'demote' then
      if tg.role <> 'officer' then return jsonb_build_object('ok', false, 'reason', 'same'); end if;
      update public.coven_members set role = 'member' where user_id = tg.user_id;
    else
      update public.coven_members set role = 'leader' where user_id = tg.user_id;
      update public.coven_members set role = 'officer' where user_id = u;
    end if;
    return jsonb_build_object('ok', true) || public._coven_view(u);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'unknown');
end $$;

revoke all on function public._coven_week(), public._coven_fix_week(uuid), public._coven_add_points(uuid, integer),
  public._coven_give(uuid, text, jsonb, jsonb), public._coven_claim(uuid, jsonb), public._coven_view(uuid) from public, anon, authenticated;
revoke all on function public.coven_request(text, jsonb) from public, anon;
grant execute on function public.coven_request(text, jsonb) to authenticated;
commit;
