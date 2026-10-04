-- Run AFTER supabase/schema.sql. Additive, repeatable; never touches progress tables.
-- Телеметрия живого теста: события сессий (шаги главы, бои, время в игре). Личных данных нет.
begin;

create table if not exists public.telemetry_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  session_id text not null check (session_id ~ '^[0-9a-f]{8,32}$'),
  t_ms       bigint not null check (t_ms >= 0),   -- миллисекунды от начала сессии на устройстве
  name       text not null check (name ~ '^[a-z0-9_:.]{1,40}$'),
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists telemetry_events_user_idx on public.telemetry_events (user_id, created_at);
create index if not exists telemetry_events_name_idx on public.telemetry_events (name, created_at);

-- Игроки таблицу не читают и не пишут напрямую: только через telemetry_log. Читает владелец (SQL Editor / service_role).
alter table public.telemetry_events enable row level security;
revoke all on public.telemetry_events from public, anon, authenticated;

-- Принять пачку событий. Возвращает, сколько записано. Тихие отказы вместо ошибок: телеметрия не должна ломать игру.
create or replace function public.telemetry_log(session text, events jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if session is null or session !~ '^[0-9a-f]{8,32}$' then return 0; end if;
  if jsonb_typeof(events) is distinct from 'array' or jsonb_array_length(events) > 100 then return 0; end if;
  -- потолок на игрока: 6000 событий за сутки (это больше 8 часов непрерывной игры с запасом)
  if (select count(*) from public.telemetry_events where user_id = uid and created_at > now() - interval '1 day') >= 6000 then return 0; end if;
  insert into public.telemetry_events (user_id, session_id, t_ms, name, data)
  select uid, session, least(greatest((e ->> 't')::bigint, 0), 604800000), e ->> 'n',
         case when jsonb_typeof(e -> 'd') = 'object' and length((e -> 'd')::text) <= 600 then e -> 'd' else '{}'::jsonb end
    from jsonb_array_elements(events) e
   where jsonb_typeof(e) = 'object'
     and (e ->> 'n') ~ '^[a-z0-9_:.]{1,40}$'
     and (e ->> 't') ~ '^[0-9]{1,12}$';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.telemetry_log(text, jsonb) from public, anon;
grant execute on function public.telemetry_log(text, jsonb) to authenticated;

commit;
