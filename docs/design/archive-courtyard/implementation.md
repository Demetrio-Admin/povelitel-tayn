# Archive courtyard — selected concept 2, 17 October 2026

A contained visual trial around the Archive, its garden and the canal promenade. The selected concept is an inhabited scholars' courtyard: warm irregular paving, original purple and blue facades, a reading bench/table, autumn foliage groups and a clear route to the bridge.

The existing buildings, room portals, quest coordinates, canal, story locks and layout version 4 remain in place. The illustration is adapted to the playable map's existing proportions and hero scale. It is not used as a flattened background. Main streets, gates and objects remain separate and editable.

`city.archive.js` dresses only the Archive garden. It replaces isolated lawn ornaments there with authored groups, reuses the first chapter's tree sprites and adds a connected courtyard/reading path. Existing landmark sign IDs are retained. The selected street surfaces use generated worn sandstone and the normal organic road edges; the rest of the city's street material is unchanged.

## Artwork

- `worn-paving.webp`: generated seamless sandstone, 1024 × 1024, tiled at 0.34 world scale.
- `garden-ground.webp`: generated 1774 × 887 RGBA garden decal; displayed 1920 × 1040 beneath roads. Irregular alpha edge blends into the old lawn. Encoded lossless with `exact=True` to preserve alpha-edge pixels.
- `reading-table.webp`: generated isolated table, books, lantern and two stools, 560 × 456; displayed 140 × 110. Only the table's base blocks movement.
- Facades, forest trees, shrubs, lamps, benches, fence and other furniture reuse existing assets.

Terrain rendering now resolves any declared road texture from the loaded texture manager, so the new surface also works after editing a road. The editor's asset manifest includes all three new images and Russian names.

## Verification

- Full `npm test` passed.
- `node tests/city-layout-test.mjs`: every city doorway and quest target reachable; the reading corner reachable from the street; bridge and flooded-passage locks cannot be bypassed; room returns and v1–v3 save migration preserved.
- `node tests/world-test.js`: no solid props on roads or water; map reachability passed.
- `node tests/editor-data-test.mjs`: catalog, stable IDs, edits export/import and moved building portals passed.
- `npm run build`, `node tools/check-bundle.mjs`, `git diff --check` passed.

Browser evidence and visual comparison are recorded in the root `design-qa.md`.
