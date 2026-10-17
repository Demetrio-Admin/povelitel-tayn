# Secret laboratory — woodland approach

The city option 2 art direction continues along the narrow trail outside the west wall: worn sandstone, an irregular grassy clearing, layered forest edges, mossy rocks, blue mushrooms, flowers and warm wooden lanterns. A new alchemist's workbench gives the house a small working yard.

`city.lab-garden.js` dresses this section only. The main trail retains its ID, width and control points; its material changes from dirt to the Archive's worn paving. A small forecourt joins the existing approach. The laboratory building, city wall, forest collision blocks, quest objects, door, seal, return point and layout version remain unchanged. The old crate keeps its editor ID and moves to the side of the workbench.

The forest filler loses only the inner row beside the long narrow corridor, allowing its authored rocky and flowering margins to show. Filtering happens after assigning IDs, so retained trees preserve their editor identities. Extra woodland-edge decorations sit inside existing forest blockers; they add no collision. Solid planting avoids the path, buildings, door and quest positions. The workbench is reachable while the laboratory door is still sealed.

The five western forest blockers use `forestUnderlay: false`: their collision zones remain active, but the renderer no longer paints their flat dark rectangles over the lawn and garden ground. This removes the straight dark edges at the clearing, corridor sides and road junction instead of hiding those edges with more trees. Other forest underlays keep their existing rendering.

## Assets and visual comparison

Built-in Image Gen produced `concept.webp` and `public/assets/city-laboratory/workbench.webp`. Briefs: one secluded laboratory at the end of a narrow forest path outside the existing city wall, using the selected city/forest palette; then one transparent wooden potting workbench with potion bottles, brass scale, herbs, mortar, parchment and books. The sprite is cropped to its alpha bounds and resized to at most 480px, encoded losslessly with exact alpha-edge colors. World size is 108 × 98; collision is only its 82 × 22 base.

| Comparison point | Implementation |
| --- | --- |
| Composition | One existing house, a small connected forecourt, a winding approach outside the continuous wall. Existing game geometry takes priority over illustrative proportions. |
| Palette | Warm paving and windows, teal/plum/amber chapter I vegetation, blue potion and mushroom accents. |
| House | Existing approved atlas facade is preserved, including its purple roof. The concept's slate-roof reference is not used to replace that facade. |
| Ground and paths | Transparent garden decals blend the lawn; the real separately editable road remains above ground layers. No flattened scene background. |
| Planting | Larger foreground trees, shrubs and flowers soften exposed rectangular forest edges. Rocks and small plants break up the long corridor. |
| Furniture and lighting | Generated workbench beside the house, existing herb containers, wooden lanterns along the approach. Doorstep remains clear. |
| Text and UI | No new game text, buttons or HUD. The local review controls are ignored and do not ship. |

The concept and final browser screenshot were inspected with `view_image`. This is an adaptation of the selected art direction to existing playable geometry, not a pixel-identical reconstruction. The concept's incidental water at the bottom is omitted; this stretch has no water in the real map.

## Verification

- Full `npm test` passed; after final visual adjustments, world, city-layout and editor-data checks passed again.
- City layout tests verify every doorway and quest target, the sealed laboratory, bridge/flooded-passage locks, room return coordinates and save migration. Added coverage checks access to the new workbench before the seal opens.
- `npm run build`, `node tools/check-bundle.mjs`, `git diff --check` passed.
- Actual Phaser scene checked through the cloud browser: initial load, full approach, doorway, constrained 390 × 844 canvas, entering the laboratory after opening its seal, and returning outside. No relevant app console errors; browser extension metadata noise is excluded.
- Browser captures were compared for palette, facade, paving, planting, workbench and clear routes. Full manual chapter progression and a physical phone remain untested.
