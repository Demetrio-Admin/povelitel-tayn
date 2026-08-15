# AGENTS.md

## Project

This repository is the active implementation workspace for the browser/mobile fantasy RPG **«Повелитель Тайн»**.

Read these files before changing the game:

1. `PROJECT_STATE.md` — current stage, implemented behavior, roadmap and known gaps.
2. `docs/DECISIONS.md` — locked UX/UI and product decisions.
3. `docs/NOTION_SOURCES.md` — authoritative design documents in Notion.

The Notion chain listed in `docs/NOTION_SOURCES.md` is the product source of truth. Code and project notes must not silently contradict it.

## Communication with the user

- Write in Russian unless the user asks otherwise.
- Explain what is being decided and why before presenting choices.
- Do not present context-free “вариант 1 / 2 / 3” questions.
- Avoid long sequences of tiny design decisions. Bundle related decisions and show the visible consequence.
- When the user says “дальше”, continue from `PROJECT_STATE.md` instead of restarting or inventing a new direction.
- Show a working visual result as early as practical.

## Canon and content

- Current region: **Тихая Долина**.
- Current travel location: **Шепчущий лес**.
- Main hero: **Адам**.
- Story companions: **Мира, Гаррет, Эллиан**.
- Every hero is a separate selectable unit. Never merge cards into labels such as “Адам + Мира”.
- The old `magic_rpg_vertical_slice_v1_3_0_visual_pass_v1.html` prototype belongs to a previous story version. It may be inspected for generic technical patterns only. Do not copy its characters, plot, locations, economy or UI text into this game.

## Product constraints

- HTML5 + JavaScript, 2D, no 3D.
- Mobile-first; reference viewport `390×844`.
- Desktop must remain useful and visually intentional.
- Fast startup and low technical complexity.
- Avoid scrolling during the main travel and combat loops where possible.
- Primary buttons, intent text and combat controls must remain visible.
- Minimum touch target: `48×48 px`; frequent primary action: at least `64 px` high.
- Do not add monetization, summons, shops, daily tasks or a large economy during Stage 7/8 unless the user explicitly expands the scope.

## Locked UI rules

- Palette and sizes come from `docs/DECISIONS.md`.
- Use the **Split Action Surface**: one lower surface, one dominant central action, two quiet side actions.
- Travel quick actions: **Карта** on the left, **Сумка** on the right.
- A large location title appears briefly, then collapses to a compact persistent header.
- Travel party uses four separate portrait cards.
- Short secondary flows use a compact centered modal, approximately 50–60% of mobile viewport height.
- Combat is target-focused: world/target occupies the upper area; threat timeline sits directly below the selected target.
- Selecting a hero reveals up to three abilities above that hero’s portrait; the central button confirms the chosen ability.
- Action results should be shown as a world response, target transformation and threat movement. Do not rely on large floating damage numbers.
- Avoid generic gacha gloss, bright red warning banners, cartoon styling and scroll-like fantasy panels.

## Repository expectations

- Keep `index.html` usable without a build step.
- Keep real UI text and controls code-native. Raster images are scene/portrait assets, not screenshots replacing interactions.
- Prefer plain HTML/CSS/JS until the vertical slice needs enough structure to justify a framework.
- Do not add production dependencies without explaining the benefit and receiving user approval.
- Make the smallest coherent change that advances the current roadmap stage.
- Preserve unrelated work and existing accepted behavior.
- Run `npm test` after editing HTML or JavaScript.
- Run `npm run build` before handing off a standalone version.
- After visual changes, check at least `390×844` and `1440×900` in a real browser when available.
- Report any browser/runtime limitation honestly; do not claim visual QA that was not run.

## Current working commands

- `npm run dev` — local server at `http://127.0.0.1:4173`.
- `npm test` — structural, asset and JavaScript syntax checks.
- `npm run build` — creates `dist/povelitel_tayn_standalone.html` with embedded images.

## Roadmap discipline

Current focus is Stage 7: technical shell. Do not jump to full content scale, economy or production release. The next milestone is a visually verified vertical slice, followed by QA and only then scaling.
