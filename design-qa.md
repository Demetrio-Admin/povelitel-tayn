# Archive courtyard — concept 2 implementation review

Scope: a playable trial of the selected courtyard art direction around the Archive, garden and canal. This is an adaptation to the existing game map, not a pixel-for-pixel replacement illustration. The agreed constraints retain the current house sizes/positions, rooms, quest points and original hero scale.

## Visual evidence

- Source: `docs/design/archive-courtyard/selected-concept.webp`, the second displayed image selected by the user on 17 October 2026 (941 × 1670).
- Implementation: `docs/design/archive-courtyard/game-view.webp`, actual Phaser scene captured in the Cloud Browser.
- Full comparison: `docs/design/archive-courtyard/comparison.jpg`.
- Focused comparison of reading furniture, path edge and planting: `docs/design/archive-courtyard/reading-corner-comparison.jpg`.
- Browser viewport: 1363 × 936 CSS pixels, DPR 1; portrait canvas bounds x418, y0, 526.5 × 936. Screenshot crop is 527 × 936. The reference was downsampled to 527 × 936 for side-by-side review. No game artwork was painted into the screenshot.
- Additional constrained game surface: 390 × 844 CSS pixels in the same browser. This verifies surface scaling, not a separate mobile-browser/device run.
- Scene: chapter II started, north bridge locked, player in the courtyard, UI hidden for the art comparison. Existing buildings south of this trial are visible and remain unchanged.

## Comparison history

1. First rendered pass: the new courtyard formed too broad a rounded pad, the table was too far west, and the first garden pass remained sparse. Narrowed the forecourt, made the entry path vertical, moved the table beside the reading bench, enlarged the paving scale, added connected planted borders and additional chapter I tree groups. Re-rendered the scene.
2. Alpha QA found colored edge artifacts in the garden decal after WebP encoding. Restored a lossless exact RGBA export and inspected the decoded image; final alpha edge is clean.
3. Final comparison opened the source and actual implementation together in both full-view and focused comparison images. The courtyard, reading table/books/stools, bench, layered autumn planting, purple Archive facade, earth-edged warm paving and unobstructed route to the canal are present as separate game objects.

## Required fidelity surfaces

| Surface | Result |
| --- | --- |
| Fonts / typography | Existing Philosopher world labels and game HUD are preserved. The concept has no HUD; hiding it in the comparison is intentional. Labels are functional product content, not painted substitutions. |
| Spacing / layout | House and quest coordinates remain unchanged. The irregular forecourt and smaller reading pocket connect to the existing street. Source illustration distances and foreground forest are adapted to existing geometry; neighboring Duel/Coven buildings remain visible. No claim of a pixel-identical scene. |
| Colors | Worn tan sandstone, moss/soil, teal conifers, autumn plum/amber leaves and warm lamps carry the selected direction. The city's unchanged neighboring lawn/paving remains outside the trial. |
| Image quality | Real generated RGBA table and garden ground, generated paving, existing original facade and chapter I tree paintings. No CSS/SVG stand-ins or flattened illustrated map. Table remains legible in the game camera; alpha edges checked. |
| Copy / content | Russian labels and interactions remain intact. No new player-facing technical copy. |

## Interaction and regression evidence

Cloud Browser UI checks:
- Intended local game page/title loaded; canvas shows the real playable map, no framework overlay or missing-texture blocks.
- Preview controls exercised the district view, Archive approach, reading area and constrained 390 × 844 surface.
- Enter Archive: visible state changed to `Городской Архив`, player x12250 y1520, with the existing room rendered.
- Exit Archive: visible state returned to `Город`, player x6850 y2820, the original outdoor doorstep.
- Tap-to-move path started and visibly moved the hero. The complete bridge walk was not timed through in this browser; endpoint reachability and closed gate behavior are covered by the map tests below.
- No current app errors in the final run; logged `chrome-extension://...` browser-metadata errors are outside the application. An earlier preview-only nested asset-path failure was fixed with the preview HTML base path before final capture.

Automated checks:
- `npm test`: passed.
- After final planting: `node tests/city-layout-test.mjs`, `node tests/world-test.js`: passed. All city doors, quest targets and the new reading spot reachable; bridge/flooded passage remain locked; save migration/room return geometry preserved.
- `node tests/editor-data-test.mjs`: passed; landmark IDs, catalog and edit export/import preserved.
- `npm run build`, `node tools/check-bundle.mjs`, `git diff --check`: passed.
- The existing browser graphics expectation was updated to allow chapter I trees in the new garden; its full automated browser suite was not rerun.

## Follow-up polish / limits

- The rest of the city intentionally retains its previous art; extending this treatment is a separate visual decision after the user reviews the trial.
- Real-device performance, touch behavior and a full chapter walkthrough were not assessed in this run.
- P3: more low planting variants can reduce repeated bush silhouettes if this direction is approved for the whole city.

No remaining actionable P0/P1/P2 findings within the scoped trial and its stated geometry constraints.

final result: passed
