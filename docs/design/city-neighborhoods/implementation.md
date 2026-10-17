# City gardens — continuation of selected option 2

The approved four-scene concept continues the Archive's art direction across the square and coven garden, market and bank, warehouse yards, frozen residential quarter and northern workshop yard. Existing facade paintings, building sizes, quest positions, portals, story gates and layout version 4 are retained. This is a playable adaptation of the concept to the existing map, not a pixel-identical reconstruction of the illustration.

`city.neighborhoods.js` replaces the old regularly spaced compact town trees and isolated hedge/flowerbed ornaments with authored chapter I tree groups, underplanting and flowers. Functional house props, training dummies, loading furniture, herb beds, signs and conditional residents remain. All city stone roads use the Archive's generated worn paving. Five small connecting paths join the market, bank, fountain, herb garden and warehouse approach. Transparent garden ground blends the remaining districts into the Archive treatment, including story-tinted northern ground.

The merchant stall is a new generated transparent sprite (`merchant-stall.webp`), displayed at 180 × 160 with the existing 132 × 48 collision footprint and stable collider ID. Its filename is separate from the old generic stall. The editor catalog includes the new asset and preserves editable props and terrain.

## Visual specification and comparison

| Point | Concept and implementation |
| --- | --- |
| Palette | Warm sandstone, golden windows, purple/teal roofs, amber and dark forest foliage. Existing house paintings preserved. |
| Layout | One main street, connected courtyards and side routes. Deliberate deviation: existing house/quest coordinates and portrait-camera scale take precedence over illustrative composition. |
| Planting | Authored larger trees with grouped shrubs and white/purple flowers; roads and doorstep clearances protected during placement. |
| Merchant | Plum canvas awning, wood counter, goods and lantern match the standalone generated asset. Customer space remains open. |
| Identity | Duel training props, coven herbs, warehouse carts/crates and northern residential/workshop props distinguish neighborhoods. |
| Frost | Northern planting and ground retain `frost` flags and the existing chapter-controlled tint/thaw behavior. The concept's heavy snow is adapted to the existing game's lighter frost treatment. |
| Text and HUD | No new gameplay copy, controls or HUD; existing names and navigation remain. Preview-only review controls are ignored and not shipped. |

## Verification

- Full `npm test` passed after the neighborhood and stall changes. After final underplanting/ground adjustments, world, city layout and editor-data tests passed again.
- Every city door and quest target remains reachable; bridge, flooded passage and laboratory locks cannot be bypassed; migration targets and room return points remain clear.
- `npm run build`, `node tools/check-bundle.mjs`, and `git diff --check` passed.
- Actual Phaser map inspected with the cloud browser at 1363 × 936 and a constrained 390 × 844 stage. Plaza, merchant, warehouse, residential and northern scenes inspected. Bank entry/exit exercised. App console contained no relevant errors (browser extension metadata errors excluded).
- Concept and final browser captures opened with `view_image`; palette, road material, grouped planting, merchant asset, clear routes and facade scale compared. Existing geometry and lighter story frost are intentional adaptations, not a pixel-level match claim.
- Full end-to-end chapter playthrough and physical mobile device remain untested. The existing city graphics browser assertion was updated for the new tree distribution; its full browser suite was not rerun.

## Image generation

Built-in Image Gen generated `selected-concept.webp` and `public/assets/city-neighborhoods/merchant-stall.webp`. Prompt briefs: four coordinated playable city neighborhoods in the selected Archive style, retaining small facades and clear routes; then one transparent plum-awning merchant stall with wooden counter, jars, bread/fruit/herbs, lantern and tucked crates. Production sprite is cropped to alpha bounds and downscaled with transparency preserved. Existing chapter I sprites and the previous Archive terrain assets provide all other art.
