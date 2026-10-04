-- Apply AFTER schema.sql and 20261004_game_chat.sql. Additive and repeatable.
begin;
-- A role represents identity; capabilities inherit via rank, never via multiple roles.
update game_chat.roles r set roles=coalesce((select array[x] from unnest(array['owner','admin','developer','support','moderator']) x where x=any(r.roles) limit 1),'{}'),revision=revision+1
where cardinality(roles)>1;
alter table game_chat.roles drop constraint if exists chat_one_role;
alter table game_chat.roles add constraint chat_one_role check(cardinality(roles)<=1);
alter table game_chat.tickets add column if not exists escalated boolean not null default false;
alter table public.profiles add column if not exists staff_revision bigint not null default 0;
create table if not exists game_chat.templates (
 id uuid primary key default gen_random_uuid(), title text not null check(char_length(title) between 1 and 80),
 body text not null check(char_length(body) between 1 and 2000), revision bigint not null default 0,
 active boolean not null default true, author uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now()
);
insert into game_chat.templates(id,title,body) values
 ('00000000-0000-4000-8000-000000000001','Шаги воспроизведения','Опишите, пожалуйста, шаги, после которых появляется проблема. Что ожидали увидеть и что произошло?'),
 ('00000000-0000-4000-8000-000000000002','Устройство','Подскажите, пожалуйста, модель устройства, браузер и версию игры.') on conflict do nothing;
create or replace function game_chat.rank(u uuid) returns int language sql stable set search_path='' as $$
 select case (game_chat.user_roles(u))[1] when 'owner' then 5 when 'admin' then 4 when 'developer' then 3 when 'support' then 2 when 'moderator' then 1 else 0 end
$$;
create or replace function game_chat.is_owner(u uuid) returns boolean language sql stable set search_path='' as $$ select game_chat.rank(u)=5 $$;
create or replace function game_chat.is_admin(u uuid) returns boolean language sql stable set search_path='' as $$ select game_chat.rank(u)>=4 $$;
create or replace function game_chat.is_developer(u uuid) returns boolean language sql stable set search_path='' as $$ select game_chat.rank(u)>=3 $$;
create or replace function game_chat.is_support(u uuid) returns boolean language sql stable set search_path='' as $$ select game_chat.rank(u)>=2 $$;
create or replace function game_chat.is_mod(u uuid) returns boolean language sql stable set search_path='' as $$ select game_chat.rank(u)>=1 $$;
create or replace function game_chat.can_manage(actor uuid,target uuid) returns boolean language sql stable set search_path='' as $$
 select actor<>target and game_chat.rank(actor)>game_chat.rank(target) and game_chat.rank(target)<5
$$;
create or replace function game_chat.profile(u uuid, viewer uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('policyVersion',2,'ref',p.chat_ref,'nickname',coalesce(p.nickname,'Гость'),'registered',p.nickname is not null,
 'hero',p.hero_id,'level',coalesce(g.hero_level,1),'roles',game_chat.user_roles(u),'playerId',p.player_id::text,
 'revision',coalesce(r.revision,0)::text,'staffRevision',p.staff_revision::text,'self',u=viewer)
 from public.profiles p left join public.player_progress g on g.user_id=p.id left join game_chat.roles r on r.user_id=p.id where p.id=u
$$;
create or replace function game_chat.catalog() returns jsonb language sql immutable set search_path='' as $$ select '{"coins": "Монеты", "lunar_shard": "Лунный осколок", "lunar_flame": "Лунный огонёк", "moon_herb": "Лунная трава", "crimson_ember": "Багровый уголь", "moonstone": "Лунный камень (редкий)", "rare_core": "Редкое ядро", "forest_mushroom": "Лесные грибы", "tree_resin": "Древесная смола", "rune_dust": "Руническая пыль", "elixir_life": "Настой жизни", "elixir_mana": "Лунный эликсир", "resin_flask": "Смоляная склянка", "lunar_wick": "Лунный фитиль", "revealing_compound": "Проявляющий состав", "restoration_bundle": "Восстановительная связка"}'::jsonb $$;
create or replace function game_chat.staff_player(target uuid,viewer uuid) returns jsonb language sql stable set search_path='' as $$
 select game_chat.profile(target,viewer)||jsonb_build_object('inventoryRevision',g.rev::text,
 'inventory',coalesce((select jsonb_object_agg(item_id,quantity) from public.player_inventory where user_id=target),'{}'),
 'catalog',game_chat.catalog()) from public.player_progress g where g.user_id=target
$$;
alter table public.profiles add column if not exists login_nickname text;
update public.profiles set login_nickname=nickname_normalized where login_nickname is null and nickname_normalized is not null;
create unique index if not exists profiles_login_nickname_key on public.profiles(login_nickname) where login_nickname is not null;
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
create or replace function public.chat_request(op text,args jsonb default '{}',request_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=auth.uid(); subject_user uuid; rid uuid; mid uuid; tid uuid; other uuid; lk bigint;
  rr game_chat.rooms%rowtype; mm game_chat.messages%rowtype; tt game_chat.tickets%rowtype;
  v jsonb; result jsonb; rroles text[]; wanted text[]; txt text; why text; mode text;
  rev bigint; cursor bigint; lim int:=50; until_at timestamptz; sid uuid; mentioned uuid[];
  allowed_args text[];
  writing boolean:= op not in ('bootstrap','history','profile','roles_lookup','tickets','ticket','roster','reports','audit','tasks','ignored','player_lookup','templates');
begin
  if u is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles where id=u) then raise exception 'chat_no_profile'; end if;
  if jsonb_typeof(args)<>'object' or octet_length(args::text)>18000 then raise exception 'chat_invalid_request'; end if;
  allowed_args:=case
    when op in ('bootstrap','roster','reports','audit','tasks','ignored') then array[]::text[]
    when op='history' then array['room','before','after']
    when op in ('profile','dm_open') then array['ref']
    when op in ('roles_lookup','player_lookup') then array['playerId']
    when op='templates' then array[]::text[]
    when op='template_save' then array['template','revision','title','body']
    when op='template_archive' then array['template','revision']
    when op='resources' then array['playerId','revision','item','delta','reason']
    when op='rename' then array['playerId','revision','nickname','reason']
    when op='roles_set' then array['playerId','revision','roles','reason']
    when op='tickets' then array['filter','before']
    when op='ticket' then array['ticket']
    when op='ignore' then array['ref','ignored']
    when op='read' then array['room','cursor']
    when op='send' then array['room','body','reply']
    when op='edit' then array['message','revision','body']
    when op='delete' then array['message','revision','reason']
    when op in ('restore','pin') then array['message','revision']
    when op='sanction' then array['ref','kind','minutes','reason']
    when op='revoke_sanction' then array['ref','sanction','reason']
    when op='report' then array['message','reason']
    when op='report_close' then array['report','reason']
    when op='ticket_create' then array['category','subject','body']
    when op in ('ticket_take','ticket_read','ticket_close','ticket_reopen') then array['ticket','revision']
    when op='ticket_assign' then array['ticket','revision','ref']
    when op in ('ticket_reply','ticket_note','ticket_solve') then array['ticket','revision','body']
    when op='ticket_transfer' then array['ticket','revision','ref','body']
    when op='ticket_escalate' then array['ticket','revision','body']
    when op='task_answer' then array['task','revision','body']
    else null end;
  if allowed_args is null then raise exception 'chat_unknown_operation'; end if;
  if exists(select 1 from jsonb_object_keys(args) k where not k=any(allowed_args)) then raise exception 'chat_invalid_request'; end if;
  if args ? 'ref' then select id into subject_user from public.profiles where chat_ref=(args->>'ref')::uuid; end if;
  if args ? 'playerId' then
    if not game_chat.is_developer(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if args->>'playerId' !~ '^[1-9][0-9]{0,18}$' then raise exception 'chat_invalid_id'; end if;
    if (args->>'playerId')::numeric>9223372036854775807 then raise exception 'chat_invalid_id'; end if;
    select id into subject_user from public.profiles where player_id=(args->>'playerId')::bigint;
  end if;
  if args ? 'message' then select * into mm from game_chat.messages where id=(args->>'message')::uuid; subject_user:=mm.author; rid:=mm.room_id; end if;
  if args ? 'ticket' then select * into tt from game_chat.tickets where id=(args->>'ticket')::uuid; tid:=tt.id; end if;
  if writing then
    if request_id is null then raise exception 'chat_request_id_required'; end if;
    -- Stable ordering, including send versus sanction/role updates and DM ignore races.
    for lk in select distinct hashtextextended('chat-user:'||x::text,0) from unnest(array[u,subject_user]) x where x is not null order by 1 loop
      perform pg_advisory_xact_lock(lk);
    end loop;
    select * into v from (select jsonb_build_object('op',q.op,'args',q.args,'result',q.result) j from game_chat.requests q where q.user_id=u and q.id=request_id) s;
    -- scalar SELECT above is deliberately checked before quotas.
    if v is not null then
      if v->>'op'<>op or v->'args'<>args then raise exception 'chat_request_conflict'; end if;
      if op='roles_set' and not game_chat.is_admin(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      if op in ('edit','delete','restore','sanction','revoke_sanction','report_close') and not game_chat.is_mod(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      if op in ('ticket_take','ticket_assign','ticket_note','ticket_solve','ticket_transfer','ticket_escalate','template_save','template_archive') and not game_chat.is_support(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      if op in ('send','edit','delete','restore','pin','dm_open','read') and game_chat.banned(u,'game') then raise exception 'chat_forbidden' using errcode='42501'; end if;
      if op in ('resources','rename') and (not game_chat.is_developer(u) or not game_chat.can_manage(u,subject_user)) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      if op in ('ticket_note','ticket_solve','ticket_transfer','ticket_reply') and tt.author<>u and tt.assignee is distinct from u then raise exception 'chat_take_ticket' using errcode='42501'; end if;
      if op='task_answer' and not game_chat.is_developer(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      -- Rebuild message/profile DTOs using current visibility rather than replaying a privileged response.
      if op='roles_set' then return game_chat.profile(subject_user,u); end if;
      if op in ('resources','rename') then return game_chat.staff_player(subject_user,u); end if;
      if op in ('send','edit','delete','restore','pin') then return (select game_chat.message(m,u) from game_chat.messages m where m.id=(v->'result'->>'id')::uuid); end if;
      return v->'result';
    end if;
  end if;
  rroles:=game_chat.user_roles(u);
  if op in ('roles_set','edit','delete','restore','pin','ticket_take','ticket_read','ticket_assign','ticket_reply','ticket_note','ticket_solve','ticket_close','ticket_reopen','ticket_transfer','ticket_escalate','task_answer','resources','rename','template_archive') and coalesce(args->>'revision','') !~ '^[0-9]{1,19}$' then raise exception 'chat_conflict'; end if;
  if op='bootstrap' then
    result:=jsonb_build_object('me',game_chat.profile(u,u),'sanctions',game_chat.active_bans(u),'rooms',
      coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'title',case when r.kind='dm' then
          (select coalesce(p.nickname,'Гость') from game_chat.members x join public.profiles p on p.id=x.user_id where x.room_id=r.id and x.user_id<>u limit 1) else r.title end,
        'cursor',r.seq::text,'unread',greatest(0,r.seq-coalesce(m.read_seq,0)), 'pinned',r.pinned) order by r.kind,r.title)
        from game_chat.rooms r left join game_chat.members m on m.room_id=r.id and m.user_id=u where game_chat.can_room(u,r.id)),'[]'),
      'mentions',(select count(*) from game_chat.messages m join game_chat.rooms r on r.id=m.room_id left join game_chat.members rd on rd.room_id=r.id and rd.user_id=u
        where m.mentions @> array[u] and m.seq>coalesce(rd.read_seq,0) and m.deleted_at is null and r.kind in ('general','help')),
      'supportUnread',(select count(*) from game_chat.tickets t left join game_chat.ticket_reads rd on rd.ticket_id=t.id and rd.user_id=u
        where t.revision>coalesce(rd.revision,-1) and ((t.author=u and t.status in ('waiting','solved')) or (t.assignee=u and t.status='work'))));
  elsif op in ('profile','roles_lookup') then
    if subject_user is null then raise exception 'chat_not_found'; end if;
    if op='roles_lookup' and not game_chat.is_admin(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if op='profile' and subject_user<>u and not game_chat.is_admin(u) and not exists(select 1 from game_chat.messages m where m.author=subject_user and game_chat.can_room(u,m.room_id))
      and not exists(select 1 from game_chat.tickets where author=subject_user and assignee=u)
      and not (game_chat.is_mod(u) and exists(select 1 from game_chat.reports c where c.status='open' and c.evidence @> jsonb_build_array(jsonb_build_object('ref',args->>'ref')))) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    result:=game_chat.profile(subject_user,u)||jsonb_build_object('ignored',exists(select 1 from game_chat.ignored where user_id=u and game_chat.ignored.target=subject_user));
    if subject_user=u or game_chat.is_mod(u) then result:=result||jsonb_build_object('sanctions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'reason',s.reason,'until',s.expires_at,'createdAt',s.created_at,'canRevoke',game_chat.can_manage(u,subject_user) and (game_chat.is_admin(u) or s.actor=u))) from game_chat.sanctions s where s.user_id=subject_user and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())),'[]')); end if;
  elsif op='history' then
    rid:=(args->>'room')::uuid;
    if not game_chat.can_room(u,rid) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    select * into rr from game_chat.rooms where id=rid for share;
    cursor:=rr.seq;
    result:=jsonb_build_object('cursor',cursor::text,'messages',coalesce((select jsonb_agg(game_chat.message(z,u) order by z.seq) from
      (select m.* from game_chat.messages m where m.room_id=rid
        and (not(args ? 'before') or m.seq<(args->>'before')::bigint)
        and (not(args ? 'after') or m.changed_seq>(args->>'after')::bigint)
        and not exists(select 1 from game_chat.ignored i where i.user_id=u and i.target=m.author and cardinality(game_chat.user_roles(m.author))=0)
        order by case when args ? 'after' then m.changed_seq end asc, m.seq desc limit 50) z),'[]'),
      'pinned',case when rr.pinned is not null then (select game_chat.message(m,u) from game_chat.messages m where id=rr.pinned and deleted_at is null) else null end);
    -- If a delta exceeded the page limit, cursor stops at the last returned change.
    if args ? 'after' then
      select count(*) into lim from game_chat.messages where room_id=rid and changed_seq>(args->>'after')::bigint;
      if lim>50 then result:=jsonb_set(result,'{cursor}',to_jsonb((select max(changed_seq)::text from (select changed_seq from game_chat.messages where room_id=rid and changed_seq>(args->>'after')::bigint order by changed_seq limit 50) z))); end if;
    end if;
  elsif op='ignored' then
    result:=coalesce((select jsonb_agg(game_chat.profile(target,u)) from game_chat.ignored where user_id=u),'[]');
  elsif op='roster' then
    if not game_chat.is_support(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    result:=coalesce((select jsonb_agg(game_chat.profile(user_id,u)) from game_chat.roles where game_chat.is_support(user_id)),'[]');
  elsif op='tickets' then
    result:=coalesce((select jsonb_agg(z.j order by z.updated_at desc) from
      (select t.updated_at,jsonb_build_object('id',t.id,'category',t.category,'subject',t.subject,'status',t.status,'escalated',t.escalated,'revision',t.revision::text,
        'author',game_chat.profile(t.author,u),'assignee',game_chat.profile(t.assignee,u),'updatedAt',t.updated_at) j
        from game_chat.tickets t where (t.author=u or game_chat.is_support(u)) and
          (coalesce(args->>'filter','all')='all' or (args->>'filter'='mine' and (t.assignee=u or t.author=u)) or (args->>'filter'='escalated' and t.escalated) or args->>'filter'=t.status)
        order by t.updated_at desc limit 100) z),'[]');
  elsif op='ticket' then
    if tid is null then raise exception 'chat_not_found'; end if;
    if tt.author<>u and tt.assignee is distinct from u then raise exception 'chat_take_ticket' using errcode='42501'; end if;
    if tt.author<>u and not game_chat.is_support(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    result:=jsonb_build_object('id',tid,'category',tt.category,'subject',tt.subject,'status',tt.status,'escalated',tt.escalated,'revision',tt.revision::text,
      'author',game_chat.profile(tt.author,u),'assignee',game_chat.profile(tt.assignee,u),'own',tt.author=u,'closedAt',tt.closed_at,
      'replies',coalesce((select jsonb_agg(jsonb_build_object('id',id,'author',game_chat.profile(author,u),'body',z.body,'createdAt',created_at) order by created_at,id)
        from (select * from game_chat.replies where ticket_id=tid order by created_at desc,id desc limit 100) z),'[]'));
    if tt.author<>u then result:=result||jsonb_build_object('notes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'author',game_chat.profile(author,u),'body',z.body,'createdAt',created_at) order by created_at,id)
      from (select * from game_chat.notes where ticket_id=tid order by created_at desc,id desc limit 100) z),'[]'),
      'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'description',description,'answer',answer,'developer',game_chat.profile(developer,u))) from game_chat.tasks where ticket_id=tid),'[]')); end if;
  elsif op='tasks' then
    if not game_chat.is_developer(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    result:=coalesce((select jsonb_agg(jsonb_build_object('id',id,'description',description,'answer',answer,'revision',revision::text)) from game_chat.tasks where developer=u),'[]');
  elsif op in ('reports','audit') then
    if not game_chat.is_mod(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if op='reports' then result:=coalesce((select jsonb_agg(jsonb_build_object('id',id,'reason',z.reason,'evidence',evidence,'status',status)) from
      (select * from game_chat.reports where status='open' order by created_at limit 50) z),'[]');
    else result:=coalesce((select jsonb_agg(jsonb_build_object('action',action,'actor',game_chat.profile(actor,u),'target',game_chat.profile(z.target,u),'createdAt',created_at,'reason',detail->>'reason','detail',detail)) from
      (select * from game_chat.audit order by id desc limit 100) z),'[]'); end if;
  elsif op in ('player_lookup','resources','rename') then
    if not game_chat.is_developer(u) or subject_user is null then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if op<>'player_lookup' then
      if not game_chat.can_manage(u,subject_user) then raise exception 'chat_protected' using errcode='42501'; end if;
      why:=game_chat.text(args->>'reason',300);
      if op='resources' then
        select g.rev into rev from public.player_progress g where g.user_id=subject_user for update;
        if rev<>(args->>'revision')::bigint then raise exception 'chat_conflict'; end if;
        txt:=args->>'item';
        if not (game_chat.catalog() ? txt) or coalesce(args->>'delta','') !~ '^-?[1-9][0-9]{0,8}$' then raise exception 'chat_invalid_request'; end if;
        lim:=(args->>'delta')::int;
        select coalesce((select quantity from public.player_inventory where user_id=subject_user and item_id=txt),0) into cursor;
        if cursor+lim<0 or cursor+lim>1000000000 then raise exception 'chat_invalid_request'; end if;
        insert into public.player_inventory(user_id,item_id,quantity) values(subject_user,txt,cursor+lim)
          on conflict(user_id,item_id) do update set quantity=excluded.quantity;
        update public.player_progress set rev=public.player_progress.rev+1 where user_id=subject_user;
        update public.profiles set staff_revision=staff_revision+1 where id=subject_user;
        perform game_chat.log(u,op,subject_user,jsonb_build_object('reason',why,'item',txt,'delta',lim,'before',cursor,'after',cursor+lim));
      else
        perform pg_advisory_xact_lock(hashtextextended('game-nickname',0));
        select staff_revision,nickname into rev,txt from public.profiles where id=subject_user for update;
        if txt is null then raise exception 'chat_register'; end if;
        if rev<>(args->>'revision')::bigint then raise exception 'chat_conflict'; end if;
        mode:=btrim(normalize(coalesce(args->>'nickname',''),NFC));
        if mode !~ '^[A-Za-zА-Яа-яЁё0-9_]{3,20}$' or (mode ~ '[A-Za-z]' and mode ~ '[А-Яа-яЁё]') or mode !~ '[A-Za-zА-Яа-яЁё]' then raise exception 'chat_invalid_request'; end if;
        if exists(select 1 from public.profiles where id<>subject_user and (nickname_normalized=lower(mode) or login_nickname=lower(mode))) then raise exception 'nickname_taken'; end if;
        update public.profiles set nickname=mode,nickname_normalized=lower(mode),staff_revision=staff_revision+1 where id=subject_user;
        perform game_chat.log(u,op,subject_user,jsonb_build_object('reason',why,'before',txt,'after',mode));
      end if;
    end if;
    result:=game_chat.staff_player(subject_user,u);
  elsif op in ('templates','template_save','template_archive') then
    if not game_chat.is_support(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if op='templates' then
      result:=coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'body',body,'revision',revision::text) order by title,id) from game_chat.templates where active),'[]');
    else
      sid:=(args->>'template')::uuid;
      if sid is null then
        if op<>'template_save' then raise exception 'chat_invalid_request'; end if;
        perform game_chat.quota(u,op,3600,30);
        insert into game_chat.templates(title,body,author) values(game_chat.text(args->>'title',80),game_chat.text(args->>'body',2000),u) returning id into sid;
      else
        if coalesce(args->>'revision','') !~ '^[0-9]{1,19}$' then raise exception 'chat_conflict'; end if;
        select revision into rev from game_chat.templates where id=sid and active for update;
        if not found then raise exception 'chat_not_found'; end if;
        if rev<>(args->>'revision')::bigint then raise exception 'chat_conflict'; end if;
        if op='template_archive' then update game_chat.templates set active=false,revision=revision+1,updated_at=now() where id=sid;
        else update game_chat.templates set title=game_chat.text(args->>'title',80),body=game_chat.text(args->>'body',2000),revision=revision+1,updated_at=now() where id=sid; end if;
      end if;
      perform game_chat.log(u,op,null,jsonb_build_object('template',sid));
      result:=jsonb_build_object('id',sid);
    end if;
  elsif op='roles_set' then
    if not (args ? 'playerId') or jsonb_typeof(args->'roles')<>'array' then raise exception 'chat_invalid_request'; end if;
    if not game_chat.is_admin(u) or subject_user is null or subject_user=u then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if not game_chat.can_manage(u,subject_user) then raise exception 'chat_protected' using errcode='42501'; end if;
    select coalesce(array_agg(distinct x order by x),'{}') into wanted from jsonb_array_elements_text(args->'roles') x;
    if jsonb_array_length(args->'roles')>1 or not wanted <@ (case when game_chat.is_owner(u) then array['admin','moderator','developer','support']::text[] else array['moderator','developer','support']::text[] end) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    why:=game_chat.text(args->>'reason',300);
    insert into game_chat.roles(user_id) values(subject_user) on conflict do nothing;
    select revision into rev from game_chat.roles where user_id=subject_user for update;
    if rev<>(args->>'revision')::bigint then raise exception 'chat_conflict'; end if;
    perform game_chat.log(u,op,subject_user,jsonb_build_object('reason',why,'before',game_chat.user_roles(subject_user),'after',wanted));
    update game_chat.roles set roles=wanted,revision=revision+1 where user_id=subject_user;
    result:=game_chat.profile(subject_user,u);
  elsif op='dm_open' then
    if subject_user is null or subject_user=u or game_chat.banned(u,'game') or not exists(select 1 from public.profiles where id=u and nickname is not null)
      then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if exists(select 1 from game_chat.ignored where (user_id=u and game_chat.ignored.target=subject_user) or (user_id=subject_user and game_chat.ignored.target=u)) then raise exception 'chat_ignored'; end if;
    perform game_chat.quota(u,op,3600,20);
    txt:=least(u::text,subject_user::text)||':'||greatest(u::text,subject_user::text);
    insert into game_chat.rooms(kind,title,pair) values('dm','Личные',txt) on conflict(pair) do update set pair=excluded.pair returning id into rid;
    insert into game_chat.members(room_id,user_id) values(rid,u),(rid,subject_user) on conflict do nothing;
    result:=jsonb_build_object('room',rid);
  elsif op='ignore' then
    if subject_user is null or subject_user=u or cardinality(game_chat.user_roles(subject_user))>0 then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if coalesce((args->>'ignored')::boolean,true) then insert into game_chat.ignored values(u,subject_user) on conflict do nothing;
    else delete from game_chat.ignored where user_id=u and game_chat.ignored.target=subject_user; end if;
    result:=jsonb_build_object('ok',true);
  elsif op='read' then
    rid:=(args->>'room')::uuid;
    if not game_chat.can_room(u,rid) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    select seq into cursor from game_chat.rooms where id=rid;
    insert into game_chat.members(room_id,user_id,read_seq) values(rid,u,least(cursor,(args->>'cursor')::bigint))
      on conflict(room_id,user_id) do update set read_seq=greatest(game_chat.members.read_seq,excluded.read_seq);
    result:=jsonb_build_object('ok',true);
  elsif op in ('send','edit','delete','restore','pin') then
    if op='send' then rid:=(args->>'room')::uuid; end if;
    if not game_chat.can_room(u,rid) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    select * into rr from game_chat.rooms where id=rid for update;
    if op='send' then
      if game_chat.banned(u,'mute') then raise exception 'chat_muted'; end if;
      if not exists(select 1 from public.profiles where id=u and nickname is not null) then raise exception 'chat_register'; end if;
      if rr.kind='news' and not game_chat.is_developer(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      if rr.kind='dm' then
        select user_id into other from game_chat.members where room_id=rid and user_id<>u limit 1;
        -- ignore mutation also locks sender; serialization with both members is not necessary here.
        if exists(select 1 from game_chat.ignored where (user_id=u and game_chat.ignored.target=other) or (user_id=other and game_chat.ignored.target=u)) then raise exception 'chat_ignored'; end if;
      end if;
      perform game_chat.quota(u,op,3,1); perform game_chat.quota(u,op,60,20);
      txt:=game_chat.text(args->>'body',500); mid:=gen_random_uuid();
      select coalesce(array_agg(distinct p.id),'{}') into mentioned from regexp_matches(txt,'@([A-Za-zА-Яа-яЁё0-9_]{3,20})','g') hit(token)
        join public.profiles p on p.nickname_normalized=lower(hit.token[1]) where p.id<>u and not exists(select 1 from game_chat.ignored where user_id=p.id and target=u);
      if args ? 'reply' and not exists(select 1 from game_chat.messages where id=(args->>'reply')::uuid and room_id=rid and deleted_at is null) then raise exception 'chat_not_found'; end if;
      update game_chat.rooms set seq=seq+1 where id=rid returning seq into cursor;
      insert into game_chat.messages(id,room_id,author,body,seq,changed_seq,reply_to,mentions) values(mid,rid,u,txt,cursor,cursor,(args->>'reply')::uuid,mentioned) returning * into mm;
    else
      if mm.id is null then raise exception 'chat_not_found'; end if;
      select * into mm from game_chat.messages where id=mm.id for update;
      if mm.revision<>(args->>'revision')::bigint then raise exception 'chat_conflict'; end if;
      if op in ('delete','pin') and mm.deleted_at is not null then raise exception 'chat_conflict'; end if;
      if op='edit' then
        if not game_chat.is_mod(u) or mm.author<>u or mm.deleted_at is not null or mm.created_at<now()-interval '3 minutes' or game_chat.banned(u,'mute') then raise exception 'chat_forbidden' using errcode='42501'; end if;
        txt:=game_chat.text(args->>'body',500);
        insert into game_chat.versions(message_id,body) values(mm.id,mm.body);
      elsif op='delete' then
        if rr.kind='dm' or not game_chat.is_mod(u) or (mm.author<>u and not game_chat.can_manage(u,mm.author)) then raise exception 'chat_forbidden' using errcode='42501'; end if;
        why:=game_chat.text(args->>'reason',300);
      elsif op='restore' then
        if mm.deleted_by is distinct from u or mm.deleted_at is null or mm.deleted_at<now()-interval '24 hours' or not game_chat.is_mod(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      elsif op='pin' then
        if rr.kind='dm' or not game_chat.is_admin(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
        update game_chat.rooms set pinned=case when pinned=mm.id then null else mm.id end where id=rid;
      end if;
      update game_chat.rooms set seq=seq+1 where id=rid returning seq into cursor;
      update game_chat.messages set body=case when op='edit' then txt else game_chat.messages.body end,
        edited_at=case when op='edit' then now() else edited_at end,
        deleted_at=case when op='delete' then now() when op='restore' then null else deleted_at end,
        deleted_by=case when op='delete' then u when op='restore' then null else deleted_by end,
        revision=revision+1,changed_seq=cursor where id=mm.id returning * into mm;
      perform game_chat.log(u,op,mm.author,jsonb_build_object('message',mm.id,'reason',why));
    end if;
    insert into game_chat.events(room_id,seq,message_id) values(rid,cursor,mm.id);
    result:=game_chat.message(mm,u);
  elsif op in ('sanction','revoke_sanction') then
    if not game_chat.is_mod(u) or subject_user is null or subject_user=u then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if not game_chat.can_manage(u,subject_user) then raise exception 'chat_protected' using errcode='42501'; end if;
    why:=game_chat.text(args->>'reason',300);
    if op='sanction' then
      mode:=args->>'kind';
      if mode not in ('warn','mute','game') or (mode='game' and not game_chat.is_support(u)) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      lim:=coalesce((args->>'minutes')::int,0);
      if mode<>'warn' and (lim<0 or (not game_chat.is_support(u) and lim=0) or (lim>43200)) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      until_at:=case when mode='warn' then now()+interval '7 days' when lim=0 then null else now()+make_interval(mins=>lim) end;
      insert into game_chat.sanctions(user_id,actor,kind,reason,expires_at) values(subject_user,u,mode,why,until_at) returning id into sid;
      result:=jsonb_build_object('id',sid);
    else
      sid:=(args->>'sanction')::uuid;
      if not game_chat.is_admin(u) and not exists(select 1 from game_chat.sanctions where id=sid and actor=u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      update game_chat.sanctions set revoked_at=now() where id=sid and user_id=subject_user and revoked_at is null;
      if not found then raise exception 'chat_not_found'; end if;
      result:=jsonb_build_object('ok',true);
    end if;
    perform game_chat.log(u,op,subject_user,jsonb_build_object('reason',why,'sanction',sid));
  elsif op='report' then
    if mm.id is null or not game_chat.can_room(u,rid) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    if exists(select 1 from game_chat.reports where reporter=u and message_id=mm.id) then result:=jsonb_build_object('ok',true);
    else
      perform game_chat.quota(u,op,3600,5); perform game_chat.quota(u,op,86400,20);
      why:=game_chat.text(args->>'reason',300);
      -- Snapshot only this message and three existing neighbours on either side, in this same room.
      select coalesce(jsonb_agg(jsonb_build_object('message',m.id,'ref',p.chat_ref,'nickname',coalesce(p.nickname,'Гость'),'body',m.body,'deleted',m.deleted_at is not null) order by seq),'[]') into v
      from (select * from (select * from game_chat.messages where room_id=rid and seq<=mm.seq order by seq desc limit 4) a
        union all select * from (select * from game_chat.messages where room_id=rid and seq>mm.seq order by seq limit 3) b) m
      left join public.profiles p on p.id=m.author;
      insert into game_chat.reports(reporter,message_id,reason,evidence) values(u,mm.id,why,v);
      result:=jsonb_build_object('ok',true);
    end if;
  elsif op='report_close' then
    if not game_chat.is_mod(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    why:=game_chat.text(args->>'reason',300);
    update game_chat.reports set status='closed',closed_at=now() where id=(args->>'report')::uuid;
    if not found then raise exception 'chat_not_found'; end if;
    perform game_chat.log(u,op,null,jsonb_build_object('reason',why,'report',args->>'report')); result:=jsonb_build_object('ok',true);
  elsif op='ticket_create' then
    mode:=args->>'category'; txt:=game_chat.text(args->>'body',2000); why:=game_chat.text(args->>'subject',100);
    if mode not in ('account','bug','question','appeal') then raise exception 'chat_invalid_request'; end if;
    if mode<>'appeal' then perform game_chat.quota(u,op,86400,3);
    elsif exists(select 1 from game_chat.requests where user_id=u and game_chat.requests.op='ticket_create' and game_chat.requests.args->>'category'='appeal' and created_at>now()-interval '1 day') then raise exception 'chat_rate_limited'; end if;
    if exists(select 1 from game_chat.tickets where author=u and category=mode and status<>'closed') then raise exception 'chat_ticket_exists'; end if;
    if mode='appeal' then
      select id into sid from game_chat.sanctions where user_id=u and revoked_at is null order by created_at desc limit 1;
    end if;
    insert into game_chat.tickets(author,category,subject,sanction_id) values(u,mode,why,sid) returning id into tid;
    insert into game_chat.replies(ticket_id,author,body) values(tid,u,txt); result:=jsonb_build_object('ticket',tid);
  elsif op='ticket_read' then
    if tid is null or (tt.author<>u and (tt.assignee is distinct from u or not game_chat.is_support(u))) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    insert into game_chat.ticket_reads(user_id,ticket_id,revision) values(u,tid,least(tt.revision,(args->>'revision')::bigint))
      on conflict(user_id,ticket_id) do update set revision=greatest(game_chat.ticket_reads.revision,excluded.revision);
    result:=jsonb_build_object('ok',true);
  elsif op in ('ticket_take','ticket_assign','ticket_reply','ticket_note','ticket_solve','ticket_close','ticket_reopen','ticket_transfer','ticket_escalate') then
    if tid is null then raise exception 'chat_not_found'; end if;
    select * into tt from game_chat.tickets where id=tid for update;
    if tt.revision<>(args->>'revision')::bigint then raise exception 'chat_conflict'; end if;
    if op='ticket_take' then
      if not game_chat.is_support(u) or tt.author=u or tt.assignee is not null or tt.status='closed' or (tt.escalated and not game_chat.is_admin(u)) then raise exception 'chat_forbidden' using errcode='42501'; end if;
      update game_chat.tickets set assignee=u,status='work',escalated=false where id=tid;
    elsif op='ticket_assign' then
      if not game_chat.is_admin(u) or subject_user is null or not game_chat.is_support(subject_user) or subject_user=tt.author then raise exception 'chat_forbidden' using errcode='42501'; end if;
      update game_chat.tickets set assignee=subject_user,escalated=false,status=case when status='closed' then status else 'work' end where id=tid;
    elsif op in ('ticket_close','ticket_reopen') then
      if tt.author<>u or (op='ticket_close' and tt.status<>'solved') or
        (op='ticket_reopen' and tt.status not in ('solved','closed')) or (tt.status='closed' and tt.closed_at<now()-interval '7 days') then raise exception 'chat_forbidden' using errcode='42501'; end if;
      if op='ticket_reopen' and exists(select 1 from game_chat.tickets where author=u and category=tt.category and status<>'closed' and id<>tid) then raise exception 'chat_ticket_exists'; end if;
      update game_chat.tickets set status=case when op='ticket_close' then 'closed' else 'work' end,closed_at=case when op='ticket_close' then now() else null end where id=tid;
    else
      if tt.status='closed' or (tt.author<>u and (tt.assignee is distinct from u or not game_chat.is_support(u))) then raise exception 'chat_take_ticket' using errcode='42501'; end if;
      if op<>'ticket_reply' and tt.author=u then raise exception 'chat_forbidden' using errcode='42501'; end if;
      txt:=game_chat.text(args->>'body',2000);
      if tt.author=u then perform game_chat.quota(u,op,10,1); perform game_chat.quota(u,op,3600,20); end if;
      if op='ticket_note' then insert into game_chat.notes(ticket_id,author,body) values(tid,u,txt);
      elsif op='ticket_escalate' then
        if game_chat.is_admin(u) then raise exception 'chat_invalid_request'; end if;
        insert into game_chat.notes(ticket_id,author,body) values(tid,u,'Передано администратору: '||txt);
        update game_chat.tickets set assignee=null,status='new',escalated=true where id=tid;
      elsif op='ticket_transfer' then
        if subject_user is null or not game_chat.is_developer(subject_user) then raise exception 'chat_forbidden' using errcode='42501'; end if;
        insert into game_chat.tasks(ticket_id,developer,description) values(tid,subject_user,txt);
      else
        if op='ticket_solve' and tt.category='appeal' and exists(select 1 from game_chat.sanctions where id=tt.sanction_id and actor=u) then raise exception 'chat_appeal_issuer'; end if;
        insert into game_chat.replies(ticket_id,author,body) values(tid,u,txt);
        update game_chat.tickets set status=case when op='ticket_solve' then 'solved' when tt.author=u then 'work' else 'waiting' end where id=tid;
      end if;
    end if;
    update game_chat.tickets set revision=revision+1,updated_at=now() where id=tid;
    perform game_chat.log(u,op,tt.author,jsonb_build_object('ticket',tid)); result:=jsonb_build_object('ticket',tid);
  elsif op='task_answer' then
    txt:=game_chat.text(args->>'body',2000);
    if not game_chat.is_developer(u) then raise exception 'chat_forbidden' using errcode='42501'; end if;
    update game_chat.tasks set answer=txt,revision=revision+1 where id=(args->>'task')::uuid and developer=u and revision=(args->>'revision')::bigint;
    if not found then raise exception 'chat_conflict'; end if;
    result:=jsonb_build_object('ok',true);
  else raise exception 'chat_unknown_operation' using errcode='22023';
  end if;
  if writing then insert into game_chat.requests(user_id,id,op,args,result) values(u,request_id,op,args,result); end if;
  return result;
end $$;

revoke all on game_chat.templates from public,anon,authenticated;
alter table game_chat.templates enable row level security;
revoke all on all functions in schema game_chat from public,anon,authenticated;
revoke all on function public.claim_nickname(uuid,text,text),public.release_nickname(uuid) from public,anon,authenticated;
grant execute on function public.claim_nickname(uuid,text,text),public.release_nickname(uuid) to service_role;
revoke all on function public.chat_request(text,jsonb,uuid) from public,anon;
grant execute on function public.chat_request(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
