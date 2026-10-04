# Телеметрия живого теста (v0.10.2)

Зачем: понять на 5–10 живых игроках, где они останавливаются, сколько занимает глава I и на ком проигрывают. Личных данных нет: только короткие имена событий и числа, а игрока сервер узнаёт по входу (гость тоже имеет id).

## Включение

1. В Supabase → SQL Editor выполнить `supabase/migrations/20261005_telemetry.sql` (после основной схемы; безопасно повторять, прогресс игроков не трогает).
2. Опубликовать клиент. Без миграции игра работает как раньше: отправка тихо не удаётся и повторяется.

Выключить у себя: адрес с `?notrack` или `localStorage.setItem('witch_notrack','1')` в консоли браузера. Игроки не видят ничего нового.

## Что записывается

| Событие | Когда | Данные |
|---|---|---|
| `session_start` | вход в игру | версия `v`, герой `hero`, размер экрана `w`/`h`, `dpr`, `touch`, `pwa` |
| `tick` | раз в 30 секунд, пока вкладка видна | зона, режим |
| `hidden` / `visible` / `pagehide` | вкладку свернули / вернули / закрыли | зона, режим |
| `ev` | любое событие мира (шаги сюжета) | `k` — ключ события, `lvl` — уровень |
| `zone` | вход в новую зону | `z` — зона, `lvl` |
| `craft` | сварили или собрали предмет | `r` — рецепт |
| `research_done` | дар изучен | `lvl` |
| `levelup` | новый уровень | `lvl` |
| `combat_start` / `combat_end` | начало и итог боя | враг, место, `result`, `sec`, `hp`, `mana`, `intr` (прерывания), `tries` (номер попытки) |
| `final` | финал главы | `outcome` |
| `js_error` | ошибка в игре (до 5 за сессию) | текст до 80 знаков |
| `signout` | выход из аккаунта | |

Событие хранит время `t_ms` — миллисекунды от начала сессии на устройстве. Потолок: 6000 событий в сутки на игрока, 100 за запрос.

## Как читать (SQL Editor, запросы от владельца)

Игроки таблицу не читают; смотрим только мы.

```sql
-- 1. Воронка: сколько игроков дошли до каждого шага (по порядку прохождения вставьте нужные ключи из src/config/events.js)
select data ->> 'k' as step, count(distinct user_id) as players, round(avg(t_ms) / 60000.0, 1) as avg_min_in_session
from public.telemetry_events where name = 'ev' group by 1 order by players desc, avg_min_in_session;

-- 2. Время в игре на игрока (каждый tick = 30 секунд)
select user_id, count(*) * 30 / 60 as minutes_played, count(distinct session_id) as sessions, min(created_at) as first_seen
from public.telemetry_events where name = 'tick' group by 1 order by 2 desc;

-- 3. Бои: на ком проигрывают и за сколько секунд побеждают
select data ->> 'enemy' as enemy,
       count(*) filter (where data ->> 'result' = 'victory') as wins,
       count(*) filter (where data ->> 'result' = 'defeat') as defeats,
       round(avg((data ->> 'sec')::numeric) filter (where data ->> 'result' = 'victory'), 1) as avg_win_sec
from public.telemetry_events where name = 'combat_end' group by 1 order by defeats desc;

-- 4. Где игроки уходят: последняя зона и последнее событие каждой сессии
select distinct on (user_id, session_id) user_id, session_id, name, data, created_at
from public.telemetry_events where name in ('zone', 'ev', 'combat_start', 'combat_end') order by user_id, session_id, created_at desc;

-- 5. Ошибки
select data ->> 'msg' as message, count(*) as n, count(distinct user_id) as players
from public.telemetry_events where name = 'js_error' group by 1 order by n desc;

-- 6. Устройства
select data ->> 'w' as width, data ->> 'touch' as touch, count(distinct user_id) as players
from public.telemetry_events where name = 'session_start' group by 1, 2 order by players desc;
```

## Как провести тест

1. Применить миграцию, выложить версию.
2. Дать ссылку 5–10 игрокам (лучше с телефона, как у реальной аудитории). Просить играть как обычно, без подсказок.
3. Через 2–3 дня выполнить запросы 1–4: сколько дошли до финала, за сколько минут, на каком шаге и на каком бою остановились.
4. Цель — подтвердить план 56–67 минут на главу и найти места ухода. Только после этого двигаться к арене.

Хранение: события можно удалять после разбора (`delete from public.telemetry_events where created_at < now() - interval '30 days';`).
