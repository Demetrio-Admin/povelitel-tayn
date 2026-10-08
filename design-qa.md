# Victory modal — design QA

**Source visual truth:** `/workspace/scratch/223bef3ac59f/generated_images/exec-d1cc032b-be6b-4cab-b7ae-13604b2489d7.png` (the user's selected first variant, 1284 × 1225 pixels).

**Implementation:** existing Phaser game, `CombatScene.showOutcome`, development route `/?skipmenu&reset&hero=warlock`; confirmed-victory fixture: 18 coins, 1 ice crystal, 65 hero XP, gift XP 50 / 10 / 30, 70.2 seconds and 6 interrupts. The fixture invokes the actual result handler; it does not replace the game UI.

**Viewport/density:** first capture 390 × 844 CSS/pixels, deviceScaleFactor 1. The source is a cropped modal concept rather than a complete phone screen. Compare the modal content, excluding the surrounding battle HUD. Source art is viewed at its native density; component width is the normalization anchor. Mobile gift columns stack icons above their captions; the desktop layout keeps icons beside the captions.

## Comparison history

### First comparison — blocked

Full source and browser-rendered screenshot `/tmp/victory-qa-before/390x844-warlock.png` were opened together in one comparison input. The additional many-rewards capture `/tmp/victory-qa-before/390x844-many-top.png` confirms the reward list scrolls while the button stays visible. Focused regions inspected: crest/title, loot, hero XP, gift XP and Continue.

- **P2, asset fidelity:** the hero-XP line used a journal icon, whereas the selected design uses a purple XP medallion. Fix: generate the separate transparent gold/purple medallion and render it beside the live XP value.
- **P2, spacing:** too much blank wood between the portrait and the title. Fix: reduce the crest's bottom margin, retaining the full portrait and the space reserved above the frame.
- **P2, interaction polish:** the default keyboard focus outline drew a separate square around the illustrated button. Fix: retain a visible warm-gold keyboard focus ring, inset to the illustrated button.

The existing gift and resource artwork is intentionally reused, so those symbols remain consistent with the rest of the game. Quantities and names are live text, not embedded in an illustration. Small status symbols from the concept are omitted to keep the mobile footer readable.

### Responsive findings and fixes

- **P2, 360px viewport:** quantities of 12,345 clipped in two-column loot rows. Evidence: `/tmp/victory-qa-before/360x800-many-top.png`. Large quantities now occupy a full row and can wrap; revised `/tmp/witch-victory/360x800-many-top.png` displays every digit with no horizontal overflow.
- **P2, 320 × 568 viewport:** the ordinary reward list needed scrolling to see the gift-XP numbers. Evidence: `/tmp/victory-qa-before/320x568-warlock.png`. A compact-height rule reduces icon sizes and spacing while keeping the button at least 44px high. Revised `/tmp/witch-victory/320x568-warlock.png` shows all three XP values without scrolling; the added browser assertion verifies this.

### Revised comparison — passed

The same selected source was opened in combined comparison inputs with the revised mobile, desktop and compact-phone captures. Evidence:

- Male: `/workspace/scratch/223bef3ac59f/victory-preview/victory-warlock.png`, 390 × 844 CSS/pixels.
- Female: `/workspace/scratch/223bef3ac59f/victory-preview/victory-witch.png`, 390 × 638 CSS/pixels.
- Desktop: `/tmp/witch-victory/1280x900-warlock.png`, 1280 × 900 CSS/pixels.
- Compact: `/tmp/witch-victory/320x568-warlock.png`, 320 × 568 CSS/pixels; final targeted rerun after the compact-height change.
- Variable gifts: `/tmp/witch-victory/390x844-1-gifts.png` and `390x844-2-gifts.png` show centered one/two-gift layouts.

Focused comparisons examined the crest/title, loot labels and complete quantities, XP medallion, gift symbols/XP and illustrated Continue button at native resolution. Separate crops were unnecessary: the complete 1× browser captures and full-resolution source make all these details clearly readable. The first three findings are resolved in the revised captures: the medallion replaces the book, the title sits directly below the portrait, and the keyboard ring follows the button instead of adding an outer square.

## Required fidelity surfaces

- **Fonts/typography:** the existing game font, Philosopher, is retained intentionally. Its Cyrillic 400/700 files are loaded locally; the gold heading, large quantities and quieter status text preserve the hierarchy. Labels wrap without truncation; the compact view retains readable 13px status/gift captions.
- **Spacing/layout rhythm:** crest above the thin frame, title, loot, hero XP, gift XP, status and Continue follow the selected order. Width is capped at 480px within the visible game canvas. Mobile gift icons stack over labels; desktop icons sit beside labels. One/two-gift and single-loot grids use the available width. Ordinary rewards remain fully visible on the smallest tested screen; long lists scroll independently.
- **Colors/tokens:** warm gold heading/quantities, ivory body text, walnut surface, plum fabric and subdued green recovery text match the direction. Background dimming remains within the actual game canvas. The focus indicator is visible warm gold.
- **Image quality:** crest variants, frame, button and XP medallion are generated raster assets with real transparency and encoded as WebP without cropping/resizing. No decorative image is substituted with custom CSS/SVG art. Existing resource/gift icons remain consistent with the game. No clipped portraits, stretched characters or noticeable compression halos are visible at rendered sizes.
- **Copy/content:** Russian game-facing labels, catalog item names, real confirmed quantities/XP, remaining mana and confirmed fight time. Level increases appear only when present in the result. No sample numbers are baked into artwork; an empty result omits reward sections. The alternative female portrait and feminine hero-XP wording are verified.

## Interaction and regression evidence

- `npm run test:victory:browser`: passed at 390 × 844, 390 × 638, 360 × 800, 320 × 568 and 1280 × 900; the final compact-height change was additionally rerun at 320 × 568.
- Touch Continue, Enter and Escape return from the actual combat scene to exploration. Double close calls the callback exactly once; a queued story modal survives closing victory. Displaying the result does not change inventory.
- The frame, full crest and button remain inside the game canvas; the button is at least 44px high. Twenty-four rewards with quantities 12,345 scroll without horizontal clipping. One/two-gift layouts are centered. No page or console errors were recorded.
- Production build and `check:bundle` passed. Existing UI smoke and subsequent regression tests passed. The local full `npm test` encountered the existing navigation timing assertion (250ms budget); no navigation or world data is changed by this patch. CI runs the complete suite independently.

**Follow-up polish/test limits:** physical-device/Safari and throttled-network runs were not performed. Raster artwork loads on first use and is cached. These are residual platform checks, not observed design defects.

Browser plugin is unavailable. Regular Playwright runs the existing game and Vite in the same native process, following the repository's existing e2e setup. The supervised preview runs at `http://terminal.local:4173/`; selecting the old cloud error tab was rejected by the browser's URL-protocol policy. That tab was not retried or bypassed. All implementation evidence is obtained independently through the native e2e test.

**final result: passed** — no actionable P0/P1/P2 design findings remain.
