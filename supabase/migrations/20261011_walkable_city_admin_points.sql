-- v0.37.0 walkable town: move only the three city destinations of the admin «safe point» teleport.
-- Apply after 20261010_compact_city_admin_points.sql. Repeatable; keeps quest gates, catalogs, gifts, kits,
-- player progress and audit history untouched. Values come from src/admin/config.js (node tools/build-admin-config.mjs).
begin;
update game_admin.settings as s
set value = jsonb_set(s.value, '{checkpoints}',
  (s.value->'checkpoints') || (
    select jsonb_object_agg(p.id,
      (s.value->'checkpoints'->p.id) || jsonb_build_object('x', p.x, 'y', p.y))
    from (values
      ('city', 5790, 5335),
      ('nerys', 7300, 2000),
      ('nerys_final', 6780, 3720)
    ) as p(id, x, y)
    where s.value->'checkpoints' ? p.id
  ))
where s.key = 'rules';
commit;
