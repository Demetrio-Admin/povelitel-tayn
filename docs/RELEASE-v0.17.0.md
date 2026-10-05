# v0.17.0 — Сапфиры

**Нужно сделать вручную, в таком порядке:**
1. **SQL.** Supabase → SQL Editor → вставить весь `supabase/schema.sql` → Run (повторно безопасно). Создаёт `player_wallet`, `sapphire_ledger`, операции `research_speedup`, `preset_unlock`, `bank_welcome`, оплату смены ветки сапфирами, функцию выдачи `admin_grant_sapphires`.
2. **Edge Function `combat`** — вставить заново `supabase/functions/combat/index.ts` (вшиты правила).
3. Выкладывать игру.

**Выдать сапфиры тестеру** (SQL Editor): `select public.admin_grant_sapphires('<uuid игрока>', 100, 'тестер', 'test-<дата>-<n>');` — uuid есть в таблице `profiles` (столбец `id`). Повтор с тем же последним параметром не начислит второй раз. История — `select * from sapphire_ledger where user_id = '<uuid>' order by id;`.

Реальные платежи не подключены: для этого нужны юрлицо, платёжный провайдер и договор с ним — это решается отдельно (с юристом и бухгалтером).

Откат: вернуть прежние `schema.sql` и игру; таблицы кошелька можно оставить (старая игра их не читает).
