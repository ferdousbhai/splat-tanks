# Splat Tanks: polish log

The standard and audit are in [AUDIT_2026-10-10.md](AUDIT_2026-10-10.md). It is the same standard as the twelve BitGames originals: calm, focus-building, learning inside the play.

## Pass 1 (2026-10-10): calm pass, Paint together, fixes

### Calm pass (both modes)

| Change | Where |
| --- | --- |
| The timer just counts: no red pulse, no "30 SECONDS LEFT!" banner or spoken warning | `hud.js` `timer`, `main.js` `battleStep`, `style.css` |
| Splashing a tank no longer shows "SPLAT!" crit text, plays a hit-marker ping or flashes the crosshair. Splashes make fewer sparks and a softer boing | `main.js` `onHit`, `audio.js` |
| The camera never shakes. Buckets make no confetti. The end of a round has no confetti storm. Confetti is kept only for growing a tier | `fx.js`, `main.js` |
| A plain level-up is two soft notes, with no banner. Banners fade in without overshoot. Banner and pickup text is in sentence case ("Super squirt", "Paint bucket!", "Titan") | `main.js` `setLevel`, `config.js`, `style.css` |
| Countdown: soft sine numbers, then "🎨 Paint!" with no shouted GO | `main.js`, `audio.js` |
| Music runs at 96 bpm (was 120): no hi-hats or snare, a triangle melody instead of a square one, a sparse kick, and quieter overall. Squirt, splosh, evolve and cheer are softer; the cheer is one chord | `audio.js` |
| The shared BitGames voice (`speech.js`, copied from the originals): lines queue instead of cutting each other off, at rate 0.9 and pitch 1.1 (was 1.3) | `audio.js` `voice` |
| Pickups bob and glow more slowly; the leader's crown sways more slowly | `main.js`, `tank.js` |
| Upgrade cards fade in instead of springing; the level badge bump is small. `prefers-reduced-motion` is honoured | `style.css` |
| Default robots: 2 on 🐢 (was 5 on 🐇) | `index.html`, `main.js` |

### Learning in the core loop: 🤝 Paint together (new default)

- Chalk lines cut the floor into equal parts: **halves, thirds or quarters**, chosen with pictured buttons that speak ("Quarters. Four equal parts."). Quarters alternate between four squares and four strips from round to round: different shapes, still quarters. Each part has a chalk "1 over n" on the floor, which gets a ring when the part is finished.
- The round opens with "The floor is cut into four equal parts. Each part is one quarter. Let's paint them all together!" There is no clock and no ranking: no leaderboard, no crown, and no XP, levels or upgrade cards.
- A fraction strip at the top is laid out like the floor (2×2 or a row). Each box fills as its part is painted, and the box for the part you're in is outlined.
- At 85% of a part's open floor, the host says the part is finished (`pd` message). Every device fills the gaps with the paint most of that part already wears, so everyone's grid stays identical. The game names the fraction: "One quarter painted! Three quarters to go." / "Two quarters painted! Two quarters make one half! …" / "Four quarters make one whole! We painted the whole floor together!"
- **Growing is the reward for finishing a part.** Every tank grows a tier per finished part (Squirter → Splasher → Roller → Titan), and the banner names the new perk (🎈 balloons, 🖌️ zoom stripe, 🌈 twin squirters).
- Robots never aim at tanks. They paint bare floor in the unfinished part nearest to done, so parts finish one after another and the fraction moments are spaced out.
- The results screen says "Four quarters make one whole floor!" and shows a picture of the floor with its chalk lines, plus everyone who painted it, in join order.
- Pickups are the ones that help paint (big brush, super squirt, balloon), with a slower respawn.

### ⏱️ Splat match (kept as a menu choice)

The original timed round, with the calm pass applied. Levels, upgrade cards, the live leaderboard and medals stay, because this is the game the children know.

### Fixes

- **Duplicate id:** the canvas and the 👀 button were both `id="view"`, so `$('view')` was the canvas. The 👀 button did nothing, and every mouse click to squirt toggled the driver's seat (confirmed on the shipped code before fixing). The button is now `#seat-btn`.
- **No way back to the menu:** there was none after a match short of reloading. The host now has 🏠 in play and on the results screen (`menu` message; a guest's `menu` is ignored). Every way out goes through `leaveRound()`, which hushes the voice, clears banners and the results timer, and hides upgrade cards.
- **Toast timer:** `hud.toast` now resets its timer, so a second toast no longer vanishes early.
- **Bucket respawn:** the 25 s bucket respawn no longer reaches into a later round.
- **Chalk depth:** the paint floor's polygon offset hid anything just above it, so chalk uses a stronger offset.

### Evidence

Test scripts and screenshots are in the session scratchpad `splat/` (`audit/` before, `after/` after).

- `curve.mjs`: quarters with 2 🐢 robots and the robot brain standing in for the child (0 errors). Parts finish at 1:20, 2:00, 2:45 and 3:05, so the whole floor takes about 3 minutes. Before the robots focused on one part, all four finished bunched between 3:20 and 4:20.
- `duo.mjs` runs two devices through `dev/two.html` in Chromium and WebKit (0 errors):
  - thirds sync to the guest
  - a finished part fills and grows tiers identically on both devices
  - a guest's `menu` is ignored
  - the host's 🏠 brings both devices to the menu
- `match.mjs` at 1194×834 Chromium, 390×844 and 834×1194 WebKit, and 844×390 Chromium (0 errors):
  - the match has no urgent timer and no thirty-second warning
  - results show the again and 🏠 buttons
  - 🏠 mid-round hushes speech and returns to the menu
- `smoke.mjs` in Chromium and WebKit: the spoken sequence from the menu to the whole floor is right, and the results show the floor picture.

### Fresh audit, round 1 (design, bugs, cleanup)

- **New host is stuck:** when the host left, the new host still saw the guest UI ("Waiting for the host", no PLAY, no 🏠, no Play again). `showHostButtons()` now runs on start, on migration and in the menu.
- **Late joiner:** a player joining after parts are finished starts as big as everyone else (`add` carries `lv`).
- **Pickups:** pads take the new round's respawn times, because the match is set before the pads. Paint together has no 🎈 pickups (balloons come with Splasher). Only one floater per pickup, so two no longer overlap.
- **Growth at the end:** the last part no longer grows tanks or shows a perk, so "…make one whole" is the moment. A perk shows only when your tank actually grew. One ring burst per growth, not three.
- **Fraction strip matches the floor:** strips are tall boxes that together make a square, so strip quarters look different from square quarters. Text is in words ("four quarters to paint"), and the goal says "Paint both halves!".
- **Reduced motion** now also covers the 3D: no confetti or ring bursts, still pickups, no crown sway, no splash wiggle, a still menu camera, and floaters that don't grow.
- **Landscape phones:** the results show the picture and painters side by side, never clipped. Tap targets are 44 px.
- **Cleanup:**
  - `setLevel` decides quietness itself
  - the paint and XP bars aren't updated while hidden
  - the crosshair writes only on change
  - part progress is measured only when the paint changed
  - one `cap` and one `cellAt`
  - the dead `--hot` colour is removed

### Open

- Real play by the children: whether 85% feels right, and whether thirds are too abstract for the youngest.
- Not deployed yet. Deploy with `npm run deploy` and then `publish_game` (see README).
