-- Witch RPG: аккаунты и облачное сохранение (Supabase).
-- Выполните целиком в Supabase → SQL Editor → New query → Run. Скрипт можно запускать повторно.
-- Доступ к данным защищает Row Level Security: каждый игрок видит и меняет только свою строку.
-- Ограничения ника продублированы в src/cloud/validators.js (3–16 символов: буквы, цифры, пробел, _ и -).

-- ---------------------------------------------------------------- профили
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null,
  created_at timestamptz not null default now(),
  constraint nickname_len    check (char_length(nickname) between 3 and 16),
  constraint nickname_format check (nickname ~ '^[[:alnum:]_ -]+$' and nickname = btrim(nickname))
);
-- ники уникальны без учёта регистра
create unique index if not exists profiles_nickname_key on public.profiles (lower(nickname));

-- ---------------------------------------------------------------- сохранения
create table if not exists public.saves (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  data         jsonb not null,
  version      int   not null default 1,
  hero_level   int,
  play_time_ms bigint,
  updated_at   timestamptz not null default now(),
  constraint saves_size check (pg_column_size(data) < 200000)
);

-- время изменения ставит сервер, а не клиент: по нему игра понимает, какое сохранение новее
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before insert or update on public.saves
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- профиль при регистрации
-- Ник приходит из формы (raw_user_meta_data.nickname). Если он некорректный или его заняли в ту же секунду,
-- подбираем запасной, чтобы регистрация не падала.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  want text := btrim(coalesce(new.raw_user_meta_data ->> 'nickname', ''));
  nick text;
  i int := 0;
begin
  if char_length(want) not between 3 and 16 or want !~ '^[[:alnum:]_ -]+$' then
    want := 'Ведьма';
  end if;
  nick := want;
  loop
    begin
      insert into public.profiles (id, nickname) values (new.id, nick);
      exit;
    exception when unique_violation then
      i := i + 1;
      nick := btrim(left(want, 11)) || ' ' || (floor(random() * 9000) + 1000)::int; -- до 16 символов
      if i > 20 then raise; end if;
    end;
  end loop;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- «ник свободен?» — доступно до входа (форма регистрации), раскрывает только да/нет
create or replace function public.nickname_available(nick text) returns boolean
language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(nickname) = lower(btrim(nick)));
$$;
revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;

-- ---------------------------------------------------------------- Row Level Security
alter table public.profiles enable row level security;
alter table public.saves    enable row level security;

drop policy if exists "profiles: читать свой"   on public.profiles;
drop policy if exists "profiles: менять свой"   on public.profiles;
drop policy if exists "saves: читать своё"      on public.saves;
drop policy if exists "saves: создавать своё"   on public.saves;
drop policy if exists "saves: обновлять своё"   on public.saves;

create policy "profiles: читать свой"  on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: менять свой"  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "saves: читать своё"     on public.saves for select to authenticated using (user_id = auth.uid());
create policy "saves: создавать своё"  on public.saves for insert to authenticated with check (user_id = auth.uid());
create policy "saves: обновлять своё"  on public.saves for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- удаления через API нет: сохранение пропадает только вместе с аккаунтом

-- анонимный ключ ничего не читает и не пишет, кроме nickname_available
revoke all on public.profiles from anon;
revoke all on public.saves    from anon;
grant select, update (nickname) on public.profiles to authenticated;
grant select, insert, update on public.saves to authenticated;
