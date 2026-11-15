begin;

create table if not exists public.combat_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  combat_id uuid not null,
  action jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, combat_id)
);
create index if not exists combat_receipts_created_idx on public.combat_receipts(created_at);
alter table public.combat_receipts enable row level security;
revoke all on public.combat_receipts from public, anon, authenticated;

-- The existing start routines replace the context. Updates that keep it intact,
-- including refreshes of old fights, must preserve its identity.
create or replace function public._assign_combat_id() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.combat_ctx is distinct from old.combat_ctx
     and new.combat_since is not null and jsonb_typeof(new.combat_ctx) = 'object'
     and not (new.combat_ctx ? 'combatId') then
    new.combat_ctx := new.combat_ctx || jsonb_build_object('combatId', gen_random_uuid());
  end if;
  return new;
end $$;
revoke all on function public._assign_combat_id() from public, anon, authenticated;

drop trigger if exists assign_combat_id on public.player_progress;
create trigger assign_combat_id before update of combat_ctx on public.player_progress
for each row execute function public._assign_combat_id();

create or replace function public.combat_result(uid uuid, fight_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  snapshot jsonb := public._snapshot(uid);
  result jsonb;
begin
  if snapshot is null then return null; end if;
  select action into result from public.combat_receipts
  where user_id = uid and combat_id = fight_id and created_at > now() - interval '7 days';
  if result is not null then
    return snapshot || jsonb_build_object('action', result || '{"recovered":true}'::jsonb);
  end if;
  return snapshot || jsonb_build_object('action', jsonb_build_object('ok', false, 'reason',
    case when snapshot #>> '{combatCtx,combatId}' = fight_id::text then 'result_pending' else 'result_unavailable' end));
end $$;

create or replace function public.combat_finish(uid uuid, fight_id uuid, verdict jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ctx jsonb;
  before_state jsonb;
  after_state jsonb;
  action_result jsonb;
  result_verdict jsonb;
  item text;
  spent numeric;
  potions jsonb := '{}'::jsonb;
  old_rating numeric;
  new_rating numeric;
begin
  -- Lock the same row as combat_apply before looking up the receipt. Concurrent
  -- finishes for the same fight either write it once or read the committed result.
  select combat_ctx into ctx from public.player_progress where user_id = uid for update;
  before_state := public.combat_result(uid, fight_id);
  if before_state is null or before_state #>> '{action,reason}' is distinct from 'result_pending' then
    return before_state;
  end if;
  if ctx->>'combatId' is distinct from fight_id::text then return before_state; end if;

  -- Use the public entry point so the installed admin wrapper still records the fight.
  after_state := public.combat_apply(uid, verdict);
  action_result := after_state->'action';
  if action_result->'ok' is distinct from 'true'::jsonb then return after_state; end if;

  result_verdict := jsonb_strip_nulls(jsonb_build_object(
    'outcome', action_result->'outcome', 'spawn', ctx->'spawn',
    'reward', verdict->'reward', 'duel', verdict->'duel',
    'entry', case when verdict ? 'entry' then jsonb_build_object(
      'timeSec', verdict #> '{entry,timeSec}', 'interrupts', verdict #> '{entry,interrupts}') end
  ));
  if (after_state->>'level')::int > (before_state->>'level')::int then
    result_verdict := result_verdict || jsonb_build_object('levelFrom', before_state->'level', 'levelTo', after_state->'level');
  end if;
  for item in select jsonb_object_keys(coalesce(verdict->'potions', '{}'::jsonb)) loop
    spent := coalesce((before_state->'inventory'->>item)::numeric, 0)
           - coalesce((after_state->'inventory'->>item)::numeric, 0);
    if spent > 0 then potions := potions || jsonb_build_object(item, spent); end if;
  end loop;
  if potions <> '{}'::jsonb then result_verdict := result_verdict || jsonb_build_object('potions', potions); end if;
  if coalesce((verdict->>'coinsLost')::numeric, 0) > 0 then
    result_verdict := result_verdict || jsonb_build_object('coinsLost', greatest(0,
      coalesce((before_state #>> '{inventory,coins}')::numeric, 0) - coalesce((after_state #>> '{inventory,coins}')::numeric, 0)));
  end if;
  if action_result ? 'sapphires' then
    result_verdict := result_verdict || jsonb_build_object('reward',
      coalesce(result_verdict->'reward', '{}'::jsonb) || jsonb_build_object('sapphires', action_result->'sapphires'));
  end if;
  if result_verdict ? 'duel' then
    old_rating := coalesce((before_state #>> '{objects,duel,rating}')::numeric, (ctx #>> '{duel,rating}')::numeric);
    new_rating := (after_state #>> '{objects,duel,rating}')::numeric;
    result_verdict := result_verdict || jsonb_build_object('duel', result_verdict->'duel'
      || jsonb_build_object('delta', new_rating - old_rating, 'rating', new_rating, 'best', after_state #> '{objects,duel,best}'));
  end if;
  action_result := action_result || jsonb_build_object('verdict', result_verdict);
  insert into public.combat_receipts(user_id, combat_id, action) values (uid, fight_id, action_result);
  return after_state || jsonb_build_object('action', action_result);
end $$;

create or replace function public.combat_receipts_cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from public.combat_receipts where created_at <= now() - interval '7 days';
$$;

revoke all on function public.combat_result(uuid, uuid), public.combat_finish(uuid, uuid, jsonb),
  public.combat_receipts_cleanup() from public, anon, authenticated;
grant execute on function public.combat_result(uuid, uuid), public.combat_finish(uuid, uuid, jsonb),
  public.combat_receipts_cleanup() to service_role;

-- Managed Supabase can run this via Cron. Other environments may schedule it externally.
do $$
begin
  if exists (select from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.schedule('combat-receipts-cleanup', '17 3 * * *', 'select public.combat_receipts_cleanup()')$cron$;
  end if;
end $$;

commit;
