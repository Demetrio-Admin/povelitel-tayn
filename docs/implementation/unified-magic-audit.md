# Unified magic / autobattle — isolated episode audit

Base: main c712429, 2026-11-06. Working branch: feature/unified-magic-autobattle.

- `balance.abilities.js` owns ABILITIES, including branches and advanced IV–V rows.
- `balance.progression.js` owns UPGRADES, costs, events and timers.
- `GameState` stores `<id>Level`, `schoolXP`, inventory, `player_build`, research. `AbilitySystem` reads these definitions.
- `build.js` defines three main gift slots. Episode battle has four moves; these are different contracts.
- Main cloud actions/build/research are server-authoritative (`playerModel`, combat handler/replay, SQL). No cloud changes were made.
- `/episode/` uses localOnly services and `witch_episode_v1:` storage. Its battle/heat/story models are renderer-independent. Existing `fireLevel` in episode progress mirrors the GameState field; it is retained for compatibility and not used as a second upgrade ladder.
- `seal` stays Astral. Ice/storm, main scenes, camera-test, wallet, PvP, cloud economy and cosmetic Companion remain unchanged.
- Extend ABILITIES with an opt-in metadata adapter. Experimental curse/barrier exist only in the episode adapter, not the production registry/slots.
- Preserve old episode saves through defaulted progress fields and additive GameState fields. No destructive migration or rollback is needed: switching to main ignores the new fields. New loadouts are sanitized against learned moves.

Baseline: browser inspected `/episode/?step=fight` before edits; forest art, compact HUD and existing wolf/wall observed. The original npm test suite passed before edits. Final checks, screenshots and compatibility limits are recorded in unified-magic-handover.md.
