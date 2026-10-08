-- Колдовство v0.33.0: Ковены — цикл 3 дня, лестница цели ±200, пятёрка лучших и пул сапфиров.
-- Выполнить ПОСЛЕ supabase/schema.sql и 20261007_covens.sql (после игровых чат-миграций); повторный запуск безопасен.
-- Что меняется: «неделя» ковена (_coven_week) становится циклом из rules.covens.cycleDays суток (по умолчанию 3, по UTC); у каждого
-- ковена своя цель covens.goal (от rules.covens.goal до goalMax, шаг goalStep); итог цикла фиксируется лениво при первом обращении
-- (_coven_fix_week): выполнен — цель +шаг и пул сапфиров пятёрке, нет (или цикл пропущен) — цель −шаг. Выплата — op coven_payout.
-- При первом применении текущие очки и вклады обнуляются (все ковены начинают первый цикл с нуля, цель 400).
begin;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'covens' and column_name = 'goal') then
    alter table public.covens add column goal int not null default 400 check (goal >= 0);
    update public.covens set week_start = public._coven_week(), week_points = 0;
    update public.coven_members set week_start = public._coven_week(), week_given = 0, claimed_week = null;
  end if;
end $$;

-- итог цикла: цель, очки, выполнен ли, пул (история — 60 суток)
create table if not exists public.coven_cycle_results (
  coven_id    uuid not null references public.covens(id) on delete cascade,
  cycle_start date not null,
  goal        int  not null,
  points      int  not null,
  success     boolean not null,
  pool        int  not null default 0,
  primary key (coven_id, cycle_start)
);
-- пятёрка выполненного цикла: место и сапфиры; claimed_at — когда забрал (один раз, ключ в журнале сапфиров)
create table if not exists public.coven_payouts (
  coven_id    uuid not null references public.covens(id) on delete cascade,
  cycle_start date not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rank        int  not null check (rank between 1 and 20),
  amount      int  not null check (amount > 0),
  claimed_at  timestamptz,
  primary key (coven_id, cycle_start, user_id)
);
create index if not exists coven_payouts_user on public.coven_payouts (user_id) where claimed_at is null;
alter table public.coven_cycle_results enable row level security;
alter table public.coven_payouts enable row level security;
revoke all on public.coven_cycle_results, public.coven_payouts from anon, authenticated;

-- ---------------------------------------------------------------- границы цикла и расчёты (зеркало — src/config/covens.js)
-- начало текущего цикла (дата, UTC)
create or replace function public._coven_week() returns date language sql stable set search_path='' as $$
  select (date '1970-01-01' + (s.d + floor((floor(extract(epoch from now()) / 86400)::numeric - s.d) / s.n)::int * s.n))::date
    from (select (c ->> 'cycleStartDay')::int d, (c ->> 'cycleDays')::int n from (select public._game_rules() -> 'covens' c) x) s
$$;
-- минимальный личный вклад при цели g
create or replace function public._coven_min_given(g int) returns int language sql stable set search_path='' as $$
  select greatest((c ->> 'minGiven')::int, ceil(g * (c ->> 'minGivenPct')::numeric / 100)::int) from (select public._game_rules() -> 'covens' c) x
$$;
-- пул сапфиров пятёрке за выполненный цикл с целью g
create or replace function public._coven_pool(g int) returns int language sql stable set search_path='' as $$
  select least(floor(g * (c ->> 'poolPct')::numeric / 100)::int, (c ->> 'poolMax')::int) from (select public._game_rules() -> 'covens' c) x
$$;

-- итог закончившегося цикла (лениво, при первом обращении к ковену); пропущенные целиком циклы — невыполненные
create or replace function public._coven_fix_week(cid uuid) returns void language plpgsql security definer set search_path='' as $$
declare
  c jsonb := public._game_rules() -> 'covens'; cur date := public._coven_week(); len int := (c ->> 'cycleDays')::int;
  step int := (c ->> 'goalStep')::int; base int := (c ->> 'goal')::int; gmax int := (c ->> 'goalMax')::int;
  cv public.covens%rowtype; ok boolean; g int; pool int; k int := 0; r record; share int; missed int;
begin
  select * into cv from public.covens where id = cid for update;
  if cv.id is null or cv.week_start is not distinct from cur then return; end if;
  g := cv.goal;
  if cv.week_start is not null and cv.week_start < cur then
    ok := cv.week_points >= g;
    pool := case when ok then public._coven_pool(g) else 0 end;
    insert into public.coven_cycle_results (coven_id, cycle_start, goal, points, success, pool)
      values (cid, cv.week_start, g, cv.week_points, ok, pool) on conflict do nothing;
    if ok then
      for r in select user_id from public.coven_members
                where coven_id = cid and week_start is not distinct from cv.week_start and week_given >= public._coven_min_given(g)
                order by week_given desc, joined_at, user_id limit (c ->> 'topSize')::int loop
        k := k + 1;
        share := floor(pool * ((c -> 'shares') ->> (k - 1))::numeric / 100)::int;
        if share > 0 then
          insert into public.coven_payouts (coven_id, cycle_start, user_id, rank, amount) values (cid, cv.week_start, r.user_id, k, share) on conflict do nothing;
        end if;
      end loop;
    end if;
    g := case when ok then least(g + step, gmax) else greatest(g - step, base) end;
    missed := greatest(0, (cur - cv.week_start) / len - 1);                    -- циклы, в которые никто не заходил
    g := greatest(base, g - missed * step);
  end if;
  update public.covens set week_points = 0, week_start = cur, goal = g where id = cid;
  update public.coven_members set week_given = 0, week_start = cur where coven_id = cid;
  delete from public.coven_cycle_results where coven_id = cid and cycle_start < cur - 60;
end $$;

-- обычная награда цикла (из player_action: op coven_claim): цель выполнена, вклад не меньше минимума, один раз за цикл.
-- Ответ несёт саму награду: монеты растут вместе с целью (reward.coins — за базовую цель), предметы те же.
create or replace function public._coven_claim(uid uuid, rules jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb := rules -> 'covens'; m public.coven_members%rowtype; cv public.covens%rowtype; wk date := public._coven_week();
begin
  select * into m from public.coven_members where user_id = uid;
  if m.user_id is null then return jsonb_build_object('ok', false, 'reason', 'no_coven'); end if;
  perform public._coven_fix_week(m.coven_id);
  select * into m from public.coven_members where user_id = uid for update;
  select * into cv from public.covens where id = m.coven_id;
  if m.claimed_week = wk then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  if cv.week_points < cv.goal then return jsonb_build_object('ok', false, 'reason', 'progress', 'points', cv.week_points); end if;
  if m.week_given < public._coven_min_given(cv.goal) then return jsonb_build_object('ok', false, 'reason', 'given', 'given', m.week_given); end if;
  update public.coven_members set claimed_week = wk where user_id = uid;
  return jsonb_build_object('ok', true, 'reward', jsonb_build_object(
    'coins', (round((c -> 'reward' ->> 'coins')::numeric * cv.goal / (c ->> 'goal')::numeric / 5) * 5)::int, 'items', c -> 'reward' -> 'items'));
end $$;

-- сапфиры пятёрке прошлых циклов (из player_action: op coven_payout): все невостребованные, не старше claimDays суток после конца цикла
create or replace function public._coven_payout(uid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb := public._game_rules() -> 'covens'; r record; tot bigint := 0; n int := 0; cid uuid;
begin
  select coven_id into cid from public.coven_members where user_id = uid;
  if cid is not null then perform public._coven_fix_week(cid); end if;
  for r in select * from public.coven_payouts
            where user_id = uid and claimed_at is null
              and cycle_start + (c ->> 'cycleDays')::int + (c ->> 'claimDays')::int > (now() at time zone 'utc')::date
            order by cycle_start, coven_id for update loop
    if public._sapphire_add(uid, r.amount, 'reward', 'ковен: итог цикла', 'coven:' || r.coven_id::text || ':' || r.cycle_start::text) is not null then
      tot := tot + r.amount; n := n + 1;
    end if;
    update public.coven_payouts set claimed_at = now() where coven_id = r.coven_id and cycle_start = r.cycle_start and user_id = uid;
  end loop;
  if n = 0 then return jsonb_build_object('ok', false, 'reason', case when cid is null then 'no_coven' else 'none' end); end if;
  return jsonb_build_object('ok', true, 'amount', tot, 'count', n);
end $$;

-- что видит участник: ковен, цикл, цель, пул и места, состав (по публичной ссылке chat_ref, без user id), итог прошлого цикла, мои выплаты
create or replace function public._coven_view(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  m public.coven_members%rowtype; cv public.covens%rowtype; c jsonb := public._game_rules() -> 'covens'; wk date := public._coven_week();
  len int := (c ->> 'cycleDays')::int; mn int; pool int; myrank int; last jsonb; pays jsonb;
begin
  select * into m from public.coven_members where user_id = u;
  if m.user_id is null then return jsonb_build_object('coven', null); end if;
  perform public._coven_fix_week(m.coven_id);
  select * into m from public.coven_members where user_id = u;
  select * into cv from public.covens where id = m.coven_id;
  mn := public._coven_min_given(cv.goal); pool := public._coven_pool(cv.goal);
  select rn into myrank from (select user_id, row_number() over (order by week_given desc, joined_at, user_id) rn from public.coven_members where coven_id = cv.id) q where q.user_id = u;
  select jsonb_build_object('cycleStart', r.cycle_start, 'goal', r.goal, 'points', r.points, 'success', r.success, 'pool', r.pool) into last
    from public.coven_cycle_results r where r.coven_id = cv.id order by r.cycle_start desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('cycleStart', p.cycle_start, 'rank', p.rank, 'amount', p.amount) order by p.cycle_start), '[]'::jsonb) into pays
    from public.coven_payouts p
   where p.user_id = u and p.claimed_at is null and p.cycle_start + len + (c ->> 'claimDays')::int > (now() at time zone 'utc')::date;
  return jsonb_build_object('coven', jsonb_build_object(
    'id', cv.id, 'name', cv.name, 'motto', cv.motto, 'myRole', m.role, 'myGiven', m.week_given, 'myRank', myrank,
    'claimed', m.claimed_week = wk, 'points', cv.week_points, 'goal', cv.goal, 'minGiven', mn,
    'cycleDays', len, 'cycleEnds', ((wk + len)::timestamp at time zone 'utc'), 'weekEnds', ((wk + len)::timestamp at time zone 'utc'),
    'goalUp', least(cv.goal + (c ->> 'goalStep')::int, (c ->> 'goalMax')::int), 'goalDown', greatest(cv.goal - (c ->> 'goalStep')::int, (c ->> 'goal')::int),
    'pool', pool, 'topSize', (c ->> 'topSize')::int,
    'shares', (select coalesce(jsonb_agg(floor(pool * s.v::numeric / 100)::int order by s.o), '[]'::jsonb) from jsonb_array_elements_text(c -> 'shares') with ordinality s(v, o) where s.o <= (c ->> 'topSize')::int),
    'last', last, 'payouts', pays,
    'members', coalesce((select jsonb_agg(jsonb_build_object('ref', p.chat_ref, 'playerId', p.player_id::text, 'nickname', coalesce(p.nickname, 'Гость'), 'role', x.role,
        'given', x.week_given, 'rank', rk.rn, 'qualified', x.week_given >= mn, 'me', x.user_id = u)
        order by case x.role when 'leader' then 0 when 'officer' then 1 else 2 end, x.week_given desc, x.joined_at)
      from public.coven_members x join public.profiles p on p.id = x.user_id
      join (select user_id, row_number() over (order by week_given desc, joined_at, user_id) rn from public.coven_members where coven_id = cv.id) rk on rk.user_id = x.user_id
     where x.coven_id = cv.id), '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- RPC окна ковенов (как в 20261007_covens.sql; изменения помечены v0.33.0)
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
  if me.user_id is not null then perform public._coven_fix_week(me.coven_id); end if;   -- v0.33.0: итог цикла фиксируется до любых перемен в составе
  if op = 'mine' then return jsonb_build_object('ok', true) || public._coven_view(u);
  elsif op = 'list' then
    return jsonb_build_object('ok', true, 'inCoven', me.user_id is not null,
      'canCreate', exists (select 1 from public.player_quests where user_id = u and quest_id = c ->> 'requires'),
      'maxMembers', (c ->> 'maxMembers')::int,
      'covens', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'motto', x.motto, 'members', x.n,
          'points', case when x.week_start = public._coven_week() then x.week_points else 0 end,
          'goal', x.goal) order by x.pts desc, x.n desc, x.name)
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
      perform public._coven_fix_week(cv.id);
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


revoke all on function public._coven_week(), public._coven_min_given(int), public._coven_pool(int), public._coven_fix_week(uuid),
  public._coven_claim(uuid, jsonb), public._coven_payout(uuid), public._coven_view(uuid) from public, anon, authenticated;
revoke all on function public.coven_request(text, jsonb) from public, anon;
grant execute on function public.coven_request(text, jsonb) to authenticated;
commit;
