# Cozy town environment

Approved brief: retain v0.37.0 roads and building positions; combine the fresh colors of concept 1 with the inhabited, cozy detail of concept 2. Reference: `approved-reference.jpg`. The rendered `city-cozy-overview.png` is the actual Phaser scene, not a baked replacement for the map.

All new artwork was generated with ImageGen and exported as WebP. Transparent props retain the game's bottom-center pivot and ground-level hitboxes. Town texture keys remain `city_walk_*`; only their paths, selected display sizes and garden dressing change. Existing approved house facades, NPCs, benches and fountain are reused.

| Assets | Generated source ID | Export |
| --- | --- | --- |
| Sage, amber and plum trees | exec-42aa5f6f-520a-4a47-8994-c8868df737e5 | Alpha WebP, 288×444, display 114×160 / 108×160 |
| Hedge, flowerbed, herbbed, planter, pumpkins, porch pots | exec-4ee099cb-f75b-4314-a401-722972b3bc0a | Alpha WebP at 3× display size |
| Cart, woodpile, sacks, dummy | exec-3eada69a-e146-407e-a74d-c978d8e04435 | Alpha WebP at 3× display size |
| Lantern | exec-6b8d2594-e515-4853-93ba-6afa7a77b33c | Alpha WebP, 156×426, display 52×142 |
| Wall face, top, post, iron and wooden fences | exec-fb1a1941-bc18-4855-a276-7df7e7ba41e4 | Original tile slot sizes for compatible repetition |
| Lawn | exec-c3676e34-90a2-4651-a323-fc0210ad6979 | Opaque 512×512 WebP |
| Paving | exec-7d716fda-f802-458c-b69b-34df61a81794 | Opaque 1024×1024 WebP, world tile scale 0.24 |
| Approved blend | exec-384b6566-f722-4bf0-855c-4ba9d3e9e04f | Reference JPG |

New cozy props go through the existing placement filter: no overlap with roads, doors, canal, building footprints or reserved quest space. Tree hitboxes still cover only the trunk. Lamps keep their old positions and footprints. Garden density is reduced so the new crowns and individual flowerbeds read clearly.

To recapture the real scene: `CHROME_PATH=/path/to/chromium npm run ui:city-cozy`. This starts an isolated local Vite server, seeds an in-memory development game, opens the town with a thawed fountain, hides the UI and captures the existing scene with an overview camera. It does not modify production saves or geometry.
