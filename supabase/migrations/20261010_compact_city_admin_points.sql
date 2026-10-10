-- Existing installations: align only the three city destinations in the admin panel.
-- Preserve quest gates, resource catalogs, gifts, kits, player progress and audit history.
begin;
update game_admin.settings as s
set value = jsonb_set(s.value, '{checkpoints}',
  (s.value->'checkpoints') || (
    select jsonb_object_agg(p.id,
      (s.value->'checkpoints'->p.id) || jsonb_build_object('x', p.x, 'y', p.y))
    from (values
      ('city', 6384, 2106),
      ('nerys', 7668, 1468),
      ('nerys_final', 7230, 2788)
    ) as p(id, x, y)
  ))
where s.key = 'rules';
commit;
