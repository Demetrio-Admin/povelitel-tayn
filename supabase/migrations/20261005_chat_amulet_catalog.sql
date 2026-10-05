-- v0.16.1: new v0.16.0 amulets in the existing staff resource catalog.
-- Run after 20261004_chat_roles_v2.sql. Idempotent; CREATE OR REPLACE preserves privileges.
begin;
create or replace function game_chat.catalog() returns jsonb language sql immutable set search_path='' as $$ select '{"coins": "Монеты", "lunar_shard": "Лунный осколок", "lunar_flame": "Лунный огонёк", "moon_herb": "Лунная трава", "crimson_ember": "Багровый уголь", "moonstone": "Лунный камень (редкий)", "rare_core": "Редкое ядро", "forest_mushroom": "Лесные грибы", "tree_resin": "Древесная смола", "rune_dust": "Руническая пыль", "elixir_life": "Настой жизни", "elixir_mana": "Лунный эликсир", "resin_flask": "Смоляная склянка", "lunar_wick": "Лунный фитиль", "revealing_compound": "Состав ясного взгляда", "restoration_bundle": "Целебный сбор", "amulet_focus": "Амулет Сосредоточения", "amulet_forest": "Лесной амулет", "amulet_lunar": "Лунный амулет"}'::jsonb $$;
commit;
