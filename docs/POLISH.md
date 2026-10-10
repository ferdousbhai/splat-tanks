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
- **Growing is the reward for finishing a part.** Every tank grows a tier per finished part except the last (Squirter → Splasher → Roller → Titan with quarters), and the banner names the new perk (🎈 balloons, 🖌️ zoom stripe, 🌈 twin squirters).
- Robots never aim at tanks. They paint bare floor in the unfinished part nearest to done, so parts finish one after another and the fraction moments are spaced out.
- The results screen says "Four quarters make one whole floor!" and shows a picture of the floor with its chalk lines, plus everyone who painted it, in join order.
- Pickups are the ones that help paint (big brush, super squirt), with a slower respawn.

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

### Fresh audit, round 2

- **Grid desync:** the host painted exact splats but sent ones rounded to 0.1 m, so guests' grids drifted (48 of 1,895 painted cells after 20 s). The host now rounds first and paints exactly what it sends: 0 cells differ.
- In-round messages that arrive after the host's 🏠 are dropped, so no frozen blob is left in the menu.
- A player who joins just before the old host leaves still gets placed.
- Both bucket timers check their round through one guard in `hostBucket`.
- **Landscape phones:** banners sit below the fraction strip, so the box that just filled stays visible.
- The second quarter shows "Two quarters make one half!" on screen as well as saying it. The halves intro says "Let's paint both together!".
- **Cleanup:** one `dab()` draws a whole cell. Progress is measured whenever the paint changes, and the strip updates every frame through change-only writes.
- **Test note:** headless WebKit's WebRTC in `dev/two.html` connects only about 1 time in 3, on the original code as well, so a failed WebKit connect in `duo.mjs` is the environment. When it connects, the test passes.

### Fresh audit, round 3

- **Bucket loop (high, introduced in round 2):** a host 🏠 within 150 ms of a bucket chain made the bucket burst itself endlessly. The round 2 message filter dropped the host's own `bx`, so the bucket never counted as burst; up to 322,000 messages in 4 s, and match XP kept climbing in the menu. `hostBucket` now stops once the round is over and marks the bucket burst before it broadcasts: 0 messages after 🏠.
- **🏠 in play asks for a second tap** ("Tap the house again to stop painting."), so a stray tap from a 4-year-old host can't throw away everyone's floor. The results screen 🏠 is still one tap.
- **Short screens:** 🎨 PLAY stays in view at the bottom of the menu, with a smaller title on landscape phones (it was below the screen on all landscape phones).
- **Touch sticks** rest in the middle of their zones from the start. They used to sit half off-screen, and the aim stick sat on top of the player's tank.
- **Banners:** they make way for the upgrade cards, and on narrow screens sit below the leaderboard.
- **Paint together, shown as said:**
  - the strip reads "one quarter painted · three to go"
  - each new power is also spoken ("Now you can throw paint balloons!")
  - the half fact shares one helper with the spoken line
- **Readability:** the strip's fraction digits are larger and dark on finished boxes. "Level up!" is in sentence case.
- **Cleanup:**
  - `announce` was folded into `voice.say`
  - robots take a plain `together` flag
  - a duplicate host check was dropped
  - the README lists `dev/cover.html`

### Fresh audit, round 4

- **Thirds were unequal on the floor:** 92 one-metre cells don't divide by three, so a finished third filled half a metre past its chalk line. Strips are now cut on whole cells, symmetrically (thirds are 31, 30 and 31 m), and the chalk is drawn exactly on those cuts, so paint never crosses a line. Halves and quarters were already exact.
- **The 🏠 "tap again" prompt** is a toast, so it shows even while upgrade cards are up. It used to be a sub-banner that the cards hid.
- **Spoken view changes:** switching between the driver's seat and the sky view is said aloud, and a round that starts in a remembered driver's seat says so after its opening line.
- **Cleanup:**
  - `showHostOptions()` updates the host-only menu choices without rebuilding the colour buttons
  - one `@media (max-height: 520px)` block
  - `solidAt()` in world.js is the one "what is solid" rule

### Fresh audit, round 5

- **Leftover prompt:** the "🏠 Tap again" toast stayed up for up to 3 s after leaving and covered 🎨 PLAY. Leaving a round now clears toasts too, and toasts never block taps.
- **Words at the end of a round:** the strip said "four quarters painted · no to go" at the climax; it now says "four quarters make one whole".
- **Second quarter:** the screen shows both the half fact and the new Roller power, matching what is said. Round 8 changed this into two beats, one after the other.
- **Banners:** a banner without a sub-line clears any old one.
- **Splat match:** a tier-up also says the new power aloud ("Now you can throw paint balloons!").
- **Cleanup:**
  - `setScreen()` is the one way to switch between menu, round and results, and it also clears the driver's-seat vignette on the results
  - robot brains are made in one place
  - the dead `skip` and `fresh` parameters are gone

### Fresh audit, round 6

The bug and cleanup reviews came back clean. Design found two problems:
- **Bucket over the half fact:** picking up a paint bucket replaced the "Two quarters make one half!" sub-line while it was being said. Passing notes are now `soft` and never replace a sub-line that is still showing.
- **Banners on small phones:** on 375×667, 360×640 and 414×736, 🏠 covered the start of every banner. On narrow screens, banners now start below the left column.

### Fresh audit, round 7

- **Banners in tiny frames:** the round 6 rule pushed banners below the bottom of very short narrow frames, such as the store's 375×260 phone preview. The position is now capped at 45%, and the tiny-frame layout puts banners back at 24%.
- **Buckets after a host change:** a burst bucket came back on a 25 s timer kept only by the old host, so after a host change it stayed gone. Every device now notes when each bucket is due back (`backAt`), and whoever is host brings it back in `hostStep`.
- **Upgrade cards and touch (Splat match):**
  - Upright phones: the cards used to sit on the sticks' resting spots, so a thumb meant for driving picked an upgrade. They now sit below the left column, with the leaderboard and banner hidden while they're up. Every stick base now hits the stick at 360×640, 375×667 and 390×844.
  - Landscape phones: the cards are compact, at the top in place of the timer, and no longer cover the tank.
- A stale CSS comment was fixed. Keeping part progress in `parts.js` was suggested but skipped as marginal.

### Fresh audit, round 8

- **New power, shown as said:** the power was spoken after its banner had gone. Finishing a part is now two beats. First the fraction and the half fact; then, once that line has been said and no sooner than 3 s, "✨ Splasher! 🎈 Paint balloons!" is shown while it is said. The timer is cleared by `leaveRound`.
- **Menu on upright phones:** each label sits on its own line, so "2 3 4" (and every other row of choices) stays on one line.
- **Colour buttons:** they have names for screen readers (`aria-label`, `aria-pressed`) and say their colour when tapped.
- **Bucket times for joiners:** the mid-join snapshot sends each burst bucket's time left, so a joiner who later becomes host brings it back on time.
- **Cleanup:**
  - banner placement is one `--banner-top` / `--sub-gap` pair, defaulted on `:root` and set per layout, instead of rules competing on specificity
  - a dead tiny-frame selector was removed
  - the chalk label comment says "ring", not "tick"

### Fresh audit, round 9

- **The power beat is now timer-based:** the round 8 version waited for the fraction line's speech to end, and that caused two bugs:
  - **Over the ending:** if the last part finished soon after, the power banner replaced "🎉 The whole floor!" and the power was said over the results, for a power that could never be used.
  - **Interrupted speech:** if speech was cut short (driver's seat toggle, 🏠 prompt, switching tabs), the power never showed.
  It now uses its own timer (at least 3 s, or about 75 ms per letter of the fraction line), whatever speech does, and `onEnd` cancels it.
- A `pre-line` sub-banner rule left over from round 5 was removed.

### Fresh audit, round 10

The cleanup review came back clean.
- **Two powers close together:** if two parts finished within about 3 s, the first new power was never shown or said. Powers now wait in `game.powers` and are announced together: the newest tier's name, every new power on screen, and each power's line said.
- **Joining mid-round:** a player who joins part way through hears how the round works, as everyone did at the start: the intro, "One quarter is painted already.", and the power they have already grown into. A match joiner hears "Paint the floor your colour!".
- **Spoken status:** a guest at the menu hears "Waiting for the host to start." A new host hears "The host left. You're the host now."

### Fresh audit, round 11

- **Match joiner heard the opening line twice** (from round 10): `startBattle` no longer says it, and the countdown's last step says it once.
- **🎈 on the aim stick:** on small phones the balloon button sat on the aim stick's resting ring, so a thumb there threw a balloon or did nothing. The aim stick now rests up and in from its corner, and no point on the ring hits a button at 360×640, 375×667, 390×844 or 667×375.
- **Same colour for two children:** the host now gives a child whose colour is taken the first free one, at the start and when joining mid-round. That child hears "You're Blue!". The menu dims colours a friend already has.
- **A friend arriving:** the feed shows "… came to paint 👋", mirroring "went home", and in the menu the game says "… is here!".
- The README and this log now say tanks grow at every part except the last.

### Fresh audit, round 12

The cleanup review came back clean.
- **Swapped colour reaches the room:** a child given a free colour now sends `hello`, so friends' menus dim the colour they really have and their chip shows it. Before, a third child could pick a colour that looked free and be swapped again.
- **"Came to paint" colour:** the line now appears when the joiner's tank arrives (`add`), in the colour the host gave them.
- **A new host keeps the room's game:** every `start` (and the mid-join snapshot) now carries the game choices (mode, parts, robots, speed, time). Every device takes them and shows them in its menu, so whoever hosts next replays the same game, and the robots keep their speed.

### Fresh audit, round 13

Design and cleanup came back clean. The one bug: a child whose colour was free could still be moved, because a clashing child before them took it. Duplicates now go to a colour nobody chose, so only the child who clashed is moved (checked with three devices).

### Fresh audit, round 14

Cleanup came back clean.
- **Results buttons on small phones:** with many robots, the Paint together results pushed "Play again" and 🏠 below the screen at 360×640 and 375×667. On short screens they now stay at the bottom, as the menu's PLAY does.
- **Full room:** when every colour is on a tank, a late joiner shares a robot's colour, never another child's, and hears which one.
- A guest on the results screen hears "Waiting for the host."

### Fresh audit, round 15

The bug and cleanup reviews came back clean.
- **Banners over your tank on landscape phones:** the camera keeps the tank in the middle of the screen, and Paint together banners sat right on it for about 6 s at each finished part (and match sub-lines did too). On short screens, banners now sit at 66%, below the tank and above the level pill, at a smaller size. Checked at 640×360, 667×375, 844×390 and 932×430.
- A child who has just joined no longer hears "… is here!" for everyone already in the room.

### Fresh audit, round 16

Design came back clean.
- **Short-screen banners are placed by measurement:** the round 15 fixed 66% put Splat match sub-lines on the level and paint panel on landscape phones, and in the store's tiny preview frame it put Paint together banners back over the fraction strip. On screens 520 px tall or less, `hud.placeBanners()` now puts the sub-line just above wherever the bottom panel really is, and the banner just above that, in smaller type. The banner clears the tank, the panel and the strip at 640×360, 667×375, 740×360, 844×390, 932×430, 1024×500 and in 900×280, 568×270 and 480×270 frames.
- **The menu buttons are the one list of game choices:** `setOpt()` serves both taps and choices arriving with a start, so a new button can't be dropped by other devices.

### Fresh audit, round 17

Cleanup came back clean.
- **Robot noise:** robot squirts and splats played with no limit. With the child near the robots there were about 9 sounds a second with 2 robots and about 30 with 7: a constant stream, which the calm standard rules out.
  - Other tanks' sounds now carry only 24 m, at half volume.
  - At most one squirt, splat or bounce plays every 150 ms. The player's own sounds always play.
  - Now: about 4.5 a second with 2 robots and about 8 with 7, the player's own sounds included.
- **Robot hits in Paint together:** a robot's stray blob hitting the child just tints the tank, with no flash, 💦 word or boing (it was up to 11 a minute).
- **Rotation:** turning the phone while a banner shows now re-places it, so it never lands on the fraction strip.

### Fresh audit, round 18

Cleanup came back clean.
- **The player's own sounds were muted (from round 17):** the robots' quieter, spaced-out treatment also caught the child's own blob landings and bounces, so most of them were silent. `hearing()` now says whose sound it is. The player's own paint is heard across the floor at near-full volume and is never spaced out; only other tanks' sounds are quiet and spaced.
- **Drive stick on landscape phones:** its area began under 🎵 👀 🏠, so a thumb could flip the view or arm 🏠 instead of driving. On short touch screens it now starts right of that column.
- **Floor labels:** with square quarters, a part's chalk "1/4" sat under a crate, wall, rock or tree in 43% of arenas. Each label now goes to the nearest spot to its part's middle where its whole square (and 2 m around it) is clear and inside the part: 0% over 200 arenas, in every layout.

### Fresh audit, round 19

Cleanup found only a comment to fix.
- **Giant name labels after the driver's seat (from before today):** switching views changed the labels' `sizeAttenuation` without rebuilding the material, so the change only took effect when a label was next redrawn. In Paint together every tank grows (and redraws) at each part, so after the driver's seat, names could fill the screen in the sky view, or vanish in the seat. The materials now rebuild on every switch.
- **Store preview frame:** the drive stick's offset (round 18) applied there too, where the button column is hidden, losing the left 68 px of the drive area. It now applies only above 280 px tall.

### Fresh audit, round 20

Cleanup came back clean.
- **Leaving from the driver's seat:** labels in the menu's arena stayed seat-sized and your own stayed hidden. `toMenu` now draws the parked tanks once more from the sky.
- **Banner backing:** banners and sub-lines sit on a soft dark pill, so they read over anything behind them. On tablets in the driver's seat, "Two quarters make one half!" used to print over robots' name labels.
- **Results on landscape phones with the toolbar showing (about 290–340 px tall):** a smaller title, a capped picture and compact painter chips keep the floor picture, all eight painters and the buttons in view, so Play again no longer floats over the picture.
- **Aim stick on 568-wide phones:** its ring rests further in, clear of 🎈.

### Open

- Real play by the children: whether 85% feels right, and whether thirds are too abstract for the youngest.
- Not deployed yet. Deploy with `npm run deploy` and then `publish_game` (see README).
