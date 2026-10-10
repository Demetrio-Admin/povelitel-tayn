# City art QA — v0.37.1

Target: the user-approved blend in `docs/design/city-cozy/approved-reference.jpg`.
Rendered evidence: the actual Phaser overview, `reference-comparison.jpg`, the Bank / Archive / square phone captures, and the live Cloud Browser preview.

Comparison setup: the overview and reference show the whole 2880×5760 town at the same 1:2 aspect ratio. The comparison image normalizes both to 500×1000. The fountain is thawed; existing story landmarks, gates and northern frost details are retained. Gameplay captures additionally check the normal camera and HUD at 390×844, 320×568 and 1280×900.

| Area | Result |
| --- | --- |
| Layout | Existing v4 road curves, twelve houses, door anchors, canal and laboratory location preserved. Decorative gardens remain outside the walking routes and door pads. |
| Colors | Sage/olive lawn, cream limestone, teal water and roofs, plum and amber crowns, warm lanterns match the approved direction. |
| Images | Generated alpha trees, flowerbeds, yard props and lanterns render with bottom-center anchors. Stone and fence tiles preserve their existing slot sizes. No missing textures in all three graphics viewports. |
| Detail | Pots, pumpkins, herb beds and flower borders add inhabited detail. Tree crowns remain separated so pathways and entrances read clearly in the game camera. The overview remains an art reference; collision and quest geometry come from the existing game plan. |
| Typography and copy | The existing Russian HUD, outlined world labels, dialogue typography and game copy are preserved and readable at the tested phone sizes. |
| Interaction | Real keyboard and touch walks pass. Both story gates retain their required abilities; all ten accessible doors enter their own rooms and return to their doorstep. Bank dialogue across the counter and the Archive document still work. |
| Saves | v0.36 saves migrate once; subsequent reload preserves the position. The art update keeps layout version 4. |

Validation:
- `npm test`: passed.
- `npm run build`: passed.
- `npm run test:city-graphics`: passed at 390×844, 320×568, 1280×900.
- `npm run test:city-layout`: passed full walk at 390×844, keyboard/touch, gates, rooms and migration.
- `node tests/city-layout-test.mjs`: passed again after adding final flower borders.
- `git diff --check`: passed.

No unresolved P0, P1 or P2 findings in the changed city artwork. The user explicitly authorized GitHub upload and PR creation after the initial automatic approval review required confirmation.

final result: passed
