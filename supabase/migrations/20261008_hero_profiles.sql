-- v0.31: публичные профили и подтверждённые победы. Повторный запуск безопасен.
begin;
alter table public.profiles add column if not exists player_id bigint generated always as identity;
create unique index if not exists profiles_player_id_key on public.profiles(player_id);
create table if not exists public.hero_enemy_catalog (
  enemy text primary key, level int not null check(level between 1 and 100),
  difficulty text not null check(difficulty in ('normal','elite','boss')), rank int not null unique
);
create table if not exists public.hero_enemy_spawns (
  spawn text primary key, enemy text not null references public.hero_enemy_catalog(enemy)
);
create table if not exists public.hero_victories (
  user_id uuid not null references public.profiles(id) on delete cascade,
  enemy text not null references public.hero_enemy_catalog(enemy),
  spawn text not null, won_at timestamptz, hero_level int check(hero_level between 1 and 100),
  primary key(user_id,enemy), check((won_at is null)=(hero_level is null))
);
alter table public.hero_enemy_catalog enable row level security;
alter table public.hero_enemy_spawns enable row level security;
alter table public.hero_victories enable row level security;
revoke all on public.hero_enemy_catalog, public.hero_enemy_spawns, public.hero_victories from public,anon,authenticated;
insert into public.hero_enemy_catalog(enemy,level,difficulty,rank) values
('young_scavenger',1,'normal',100),
('forest_scavenger',2,'normal',200),
('rootling',5,'normal',500),
('forest_guardian',6,'elite',610),
('node_guardian',8,'boss',820),
('frost_critter',9,'normal',900),
('frost_collector',10,'normal',1000),
('frost_collector_elite',11,'elite',1110),
('ice_guardian',12,'elite',1210),
('volunteer',12,'normal',1200),
('experimental_construct',13,'elite',1310),
('frost_wolf',13,'normal',1300),
('grave_wisp',13,'normal',1301),
('grave_hound',14,'normal',1400),
('frost_alpha',15,'boss',1520),
('barrow_warden',15,'boss',1521),
('severin_boss',15,'boss',1522)
on conflict(enemy) do update set level=excluded.level,difficulty=excluded.difficulty,rank=excluded.rank;
insert into public.hero_enemy_spawns(spawn,enemy) values
('scavenger_01','forest_scavenger'),
('lunar_guard','young_scavenger'),
('forest_guardian_01','forest_guardian'),
('scavenger_02','young_scavenger'),
('rootling_01','rootling'),
('rootling_02','rootling'),
('rootling_03','rootling'),
('rootling_04','rootling'),
('rootling_05','rootling'),
('node_trial','node_guardian'),
('plaza_critter','frost_critter'),
('road_scavenger','young_scavenger'),
('wh_collector_1','frost_collector'),
('wh_collector_2','frost_collector'),
('wh_elite','frost_collector_elite'),
('lab_critter','frost_critter'),
('fq_critter','frost_critter'),
('fq_collector','frost_collector'),
('fq_training','frost_critter'),
('fq_deep_1','frost_collector'),
('fq_deep_2','frost_collector'),
('fq_guardian','ice_guardian'),
('yard_brittle_1','frost_collector'),
('yard_brittle_2','frost_collector'),
('vol_1','volunteer'),
('vol_2','volunteer'),
('lab_construct','experimental_construct'),
('unstable_1','frost_collector'),
('unstable_2','frost_collector'),
('final_critter','frost_critter'),
('final_collector','frost_collector'),
('final_construct','experimental_construct'),
('final_severin','severin_boss'),
('fw_wolf_1','frost_wolf'),
('fw_wolf_2','frost_wolf'),
('fw_wolf_3','frost_wolf'),
('fw_wolf_4','frost_wolf'),
('fw_alpha','frost_alpha'),
('gy_wisp_1','grave_wisp'),
('gy_hound_1','grave_hound'),
('gy_wisp_2','grave_wisp'),
('gy_hound_2','grave_hound'),
('gy_warden','barrow_warden')
on conflict(spawn) do update set enemy=excluded.enemy;


create or replace function public._record_hero_victory() returns trigger
language plpgsql security definer set search_path='' as $$
declare ctx jsonb; eid text;
begin
  if new.kind <> 'enemy' then return new; end if;
  select combat_ctx into ctx from public.player_progress where user_id=new.user_id;
  select enemy into eid from public.hero_enemy_spawns where spawn=new.key;
  -- Только результат текущего боя: sync_player не может прислать себе рекорд.
  if eid is not null and ctx->>'spawn'=new.key and ctx->>'enemy'=eid and (ctx->>'level')::int between 1 and 100 then
    insert into public.hero_victories(user_id,enemy,spawn,won_at,hero_level)
      values(new.user_id,eid,new.key,now(),(ctx->>'level')::int) on conflict(user_id,enemy) do nothing;
  end if;
  return new;
end $$;
revoke all on function public._record_hero_victory() from public,anon,authenticated;
drop trigger if exists record_hero_victory on public.player_world;
create trigger record_hero_victory after insert on public.player_world for each row execute function public._record_hero_victory();
-- Старые победы подтверждены сервером, но их даты и прежний уровень героя неизвестны.
insert into public.hero_victories(user_id,enemy,spawn)
  select distinct on(w.user_id,s.enemy) w.user_id,s.enemy,w.key
  from public.player_world w join public.hero_enemy_spawns s on s.spawn=w.key
  where w.kind='enemy' order by w.user_id,s.enemy,w.key
  on conflict(user_id,enemy) do nothing;

create or replace function public.hero_presence() returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  perform public._require_game_access();
  update public.profiles set last_seen_at=now() where id=uid and last_seen_at < now()-interval '30 seconds';
end $$;

create or replace function public.hero_profile(target_id bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); pf public.profiles%rowtype; pr public.player_progress%rowtype;
  cv jsonb; best jsonb; build jsonb; duel jsonb; season int; rating int; chapters jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  perform public._require_game_access();
  if target_id is null then select * into pf from public.profiles where id=uid;
  else select * into pf from public.profiles where player_id=target_id and (nickname is not null or id=uid); end if;
  if pf.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  select * into pr from public.player_progress where user_id=pf.id;
  if pr.user_id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  select jsonb_build_object('enemy',v.enemy,'heroLevel',v.hero_level,'wonAt',v.won_at)
    into best from public.hero_victories v join public.hero_enemy_catalog e on e.enemy=v.enemy
    where v.user_id=pf.id order by e.rank desc limit 1;
  select data into build from public.player_world where user_id=pf.id and kind='object' and key='player_build';
  -- Никаких сохранённых наборов и инвентаря в публичном ответе.
  build := jsonb_build_object('slots',build->'slots','amulets',coalesce(build->'amulets','[]'::jsonb),'amuletLevels',coalesce(build->'amuletLevels','{}'::jsonb));
  if to_regclass('public.coven_members') is not null then
    execute $q$ select jsonb_build_object('name',c.name,'role',m.role,'given',case when m.week_start=(date_trunc('week',now() at time zone 'UTC'))::date then m.week_given else 0 end)
      from public.coven_members m join public.covens c on c.id=m.coven_id where m.user_id=$1 $q$ into cv using pf.id;
  end if;
  select data into duel from public.player_world where user_id=pf.id and kind='object' and key='duel';
  duel := public._duel_state(duel,(extract(epoch from now())*1000)::bigint,public._game_rules()->'duel');
  chapters := jsonb_build_array(exists(select 1 from public.player_quests where user_id=pf.id and quest_id='chapter_1_complete' and status='done'),exists(select 1 from public.player_quests where user_id=pf.id and quest_id='chapter_2_complete' and status='done'));
  return jsonb_build_object('ok',true,'self',pf.id=uid,'playerId',pf.player_id::text,'hero',pf.hero_id,
    'nickname',coalesce(pf.nickname,case pf.hero_id when 'warlock' then 'Колдун' else 'Ведьма' end),
    'level',pr.hero_level,'xp',pr.hero_xp,
    'abilities',coalesce((select jsonb_object_agg(ability_id,jsonb_build_object('level',level,'unlocked',unlocked)) from public.player_abilities where user_id=pf.id),'{}'::jsonb),
    'build',build,'amuletLevels',build->'amuletLevels','strongest',best,
    'uniqueWins',(select count(*) from public.hero_victories where user_id=pf.id),
    'chapters',chapters,'coven',cv,
    'duel',jsonb_build_object('rating',duel->'rating','wins',duel->'wins','losses',duel->'losses'),
    'registeredAt',pf.registered_at,'lastSeenAt',pf.last_seen_at,'online',pf.last_seen_at>now()-interval '2 minutes');
end $$;

-- В составе ковена ник открывает профиль по публичному ID; UUID аккаунта не раскрывается.
do $$ declare fn text; begin
  if to_regprocedure('public._coven_view(uuid)') is not null then
    select pg_get_functiondef('public._coven_view(uuid)'::regprocedure) into fn;
    if position('''playerId'', p.player_id' in fn)=0 then
      execute replace(fn,'''ref'', p.chat_ref, ''nickname''','''ref'', p.chat_ref, ''playerId'', p.player_id::text, ''nickname''');
    end if;
  end if;
end $$;
revoke all on function public.hero_profile(bigint), public.hero_presence() from public,anon,authenticated;
grant execute on function public.hero_profile(bigint), public.hero_presence() to authenticated;
commit;
