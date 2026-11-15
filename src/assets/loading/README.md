# Witch flight

## Active artwork: broom flight (15 November 2026)

`witch-flight-mystic-v3.webp` is a 960×640 transparent WebP. The witch grips the broom at two separate points. The astral crescent floats ahead of the broom. The auburn hair, embroidered plum cloak and original palette carry over from the previous illustration.

The loader positions the sprite in a 3:2 box over the illustrated forest. The image was edited from `witch-flight-mystic-v2.webp`, available in Git history. ImageGen source and WebP output hashes are recorded in `witch-flight-mystic-v3.json`.

Production direction for the edit: keep the adult red-haired witch and her crescent-trimmed outfit flying to the right. Give each arm a clear path from its own shoulder to a separate gloved grip on the broom. Place the floating crescent above the leading grip. Keep the complete hat, cloak, boots and broom in a 3:2 frame with a transparent background.

## Previous artwork

`witch-flight.webp`: 480×320, transparent alpha, 27,958 bytes. Its decoded RGBA
pixels occupy 614,400 bytes (this is the illustration alone, not total page memory).
Created with the built-in image generation tool from `public/assets/sprites/hero_side.png`
and `hero_down.png`; downsampled with Lanczos and encoded as WebP at quality 88.

The loader uses one illustration, six fixed CSS sparks and static decorations.
Only transform and opacity animate. There are no per-frame JS callbacks, videos,
sprite sheets, growing particle pools or artificial minimum loading delays.
Hidden tabs pause the animation; reduced motion uses a still illustration.
The DOM and visibility listener are removed when asset loading finishes.

Production prompt:

> Use case: stylized-concept. Asset type: a single compact transparent game loading-screen sprite. Input images: reference image 1 is the existing witch SIDE view, reference image 2 is the same witch FRONT view. Preserve her identity, colors, face, costume and illustration style faithfully. Primary request: illustrate this same cute young witch flying to the RIGHT on a traditional wooden broom, seated side-saddle naturally, one hand holding the broom shaft. Short warm chestnut hair, large floppy deep-purple witch hat with its distinctive small orange maple leaf, purple cape and dress, small brown lace-up boots. Hair and cape trail gently to the LEFT suggesting flight. The broom bristles are behind her at lower left and the handle points to the right slightly upwards. Exactly one witch, one broom, complete hat, feet and broom entirely in view. Warm expressive friendly face, readable clear dark ink outlines and soft painted shading matching the reference game sprite, crisp and polished at small size. Three-quarter side view lets the face be visible. A calm graceful flight pose, no limbs missing or extra limbs. Composition: isolated full character and broom centered, horizontal composition with about 8% empty transparent margin on all sides, no environment. Constraints: actual transparent background, NO ground, no clouds, no moon, no stars, no particles, no text or UI, no framing. Do not introduce new character design or realistic rendering. This sprite will gently bob against a dark plum loading screen.
