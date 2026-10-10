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

### Fresh audit, round 21

Cleanup came back clean.
- **Strip over the tank on landscape phones:** the camera looks ahead of the tank, so a child aiming down the screen drove their tank up under the top-centre fraction strip, fully hidden at 740×290 and 800×304. On short screens the strip now sits in the free top-right corner, at a smaller size.
- **Wrapped banners (from round 20):** the pill's extra width made "Two quarters painted!" wrap on 360–375 px phones, onto the half fact below. On taller screens the sub-line is now placed below the banner's real height, however many lines it wraps to, and the pill is a little wider again.
- **Match leaderboard:** it could show the previous round's names (robot ids repeat) until a percentage changed. Names and colours are now part of its redraw key.

### Fresh audit, round 22

A stricter check this round: the child's own tank, measured in all 8 aim directions. The camera looks ahead of the tank, so the tank moves around the middle of the screen, and HUD placed in that middle band will cover it.
- **Paint together banners on upright phones:** they covered the tank in about 6 of 8 directions. Banners now sit up top, under the strip and right of the minimap.
- **Very short landscape screens (toolbar showing, 340 px or less):** banners sit up top between the minimap and the strip. The strip keeps just its boxes there, because the voice says the words.
- **Splat match cards on upright phones:** they covered the tank until picked. They are now a compact row under the timer, right of the minimap.
- **Cards spoken:** "Level up! Pick a new power." when they come up, and each pick's name and what it does.
- **Layout mechanics:**
  - **Anchor:** style.css now says where banners hang from (`--banner-anchor`), and `placeBanners()` follows it.
  - **Sub-line after cards:** the sub-line is no longer measured from a banner the cards have hidden; it used to jump to the top edge once the cards closed. Banners are re-placed when the cards open or close.
  - **Strip rules:** the small-screen strip rules are written once, in one media block.
- **Result:** no banner, sub-line, strip or card covers the tank in any aim direction at 360×640, 375×667, 390×844, 414×736, 568×320, 667×320 or 740×290.

### Fresh audit, round 23

Checked at tablet and desktop sizes this time, again measuring the tank in all 8 aim directions.
- **Banners on landscape tablets and desktops:** they covered the tank when it rode down the screen. On every landscape screen, banners now hang just above the bottom panel, at a moderate size. 0 hits at 1024×768, 1194×834, 1366×1024, 1280×720, 1366×768 and 1440×900.
- **Splat match cards on landscape tablets:** compact, at the top in place of the timer. On upright tablets, the goal pill hides while the cards are up, so their title no longer prints over it.
- **News feed on small upright phones:** "… came to paint" rows wrap under the minimap, two at most, instead of running across the tank.
- **Quick Squirt card:** it now uses 💦, so ⚡ only ever means zoom.
- **Regressions from round 22:**
  - the very-short-screen top banners now skip the store's preview frame, which has no minimap to sit beside and uses full-width small banners above the panel
  - the banner CSS shares one rule for what both lines have in common

### Fresh audit, round 24

- **Splat match XP for splashing a tank:** 12 XP per hit (about 8 times a floor squirt) made aiming at friends the fastest way to level up. That was a hook the original audit named, but only its effects had been removed. It is now 2, about one floor splat's worth, so painting the floor is how you grow.
- **Desktop banners under the cards (from round 23):** on landscape desktops the bottom-anchored banner sat behind the upgrade cards. On every landscape screen, the banner now makes way while the cards are up; the voice still says it.
- **Toast on landscape phones:** "The host left…" and "Tap again for the menu" covered the tank when aiming down. On short screens toasts now sit at the top middle.
- **🎲 says the new name** ("You're Cosmic Turtle!"), because the name rides over the child's tank.
- **Cleanup:** one block for the compact top cards (landscape touch and short screens), no dead upgrade-card position, and the bottom anchor stated once (landscape).

### Fresh audit, round 25

- **Splat match banners on phones:** they still covered the tank in both orientations (round 22 fixed only Paint together). Now:
  - upright phones put every banner up top, right of the minimap, and the leaderboard makes way while one shows
  - short landscape screens put match banners up top between the minimap and the leaderboard, and the timer makes way while one shows
  - a `bannering` class on the page marks when a banner is up
  - clear in all 8 aim directions at 360×640, 375×667, 414×736, 667×375, 740×360 and 844×390
  - the 💦 that marks your own tank being splashed in a match still appears on the tank for a second, which is intended
- **Silent menu choices:** Robots, Speed and Time now speak, like every other menu choice.
- **News feed:** the wrap rule now reaches 430 px wide, which covers 414×736 phones.
- **Short screens with cards up:** the toast sits below the cards, and the cards hide the leaderboard.
- **Cleanup:**
  - one rule for compact cards
  - `noise()` lost its dead `out` option
  - `fire()` asks `hearing()` whether the sound is the player's own

### Fresh audit, round 26

Design and cleanup came back clean. The bug review found two regressions from round 25:
- **Blinking during the countdown:** in a match on phones, the leaderboard or timer made way for each "3", "2", "1" banner and came back in the 200 ms gaps, blinking once a second. What makes way for a banner now hides at once but returns only 0.5 s after the banner has faded, so a run of banners keeps it hidden throughout and it comes back once.
- **Toast with cards up:** the round 25 toast position below the cards sat where the tank rides on landscape phones. Toasts stay at the top, over the cards' title for 3 s (the title is also spoken).

### Fresh audit, round 27

Cleanup came back clean.
- **Reduced motion brought the countdown blinking back:** the round 26 fix was a CSS transition delay, which the reduced-motion rule switches off. The delay now lives in JS: `body.bannering` stays on until 0.5 s after the last banner line has gone, with or without reduced motion.
- **Short laptop windows (600–700 px tall, mouse):** Splat match cards hung into the middle over the tank. Compact top cards now also cover landscape windows up to 700 px tall. Clear at 1024×600, 1366×600, 1280×640 and 1366×657.
- **Small tidy-ups:** `freeColor` loses an unused default, and `cardsSaid` is declared with the other `game` fields.

### Fresh audit, round 28

- **Own landings as a stream:** a Titan's spray lands six blobs at once, and the player's own sounds were never spaced, so a high-level match made about 134 sound nodes a second. The player's own squirt still always plays, but their own landings are spaced 120 ms apart: about 26 nodes a second in that case, and under 6 sound events a second when painting together.
- **Top cards on narrow laptop windows:** they now centre in the space right of the minimap, so a card never covers it.
- **Cleanup:** the touch sticks no longer reset on every resize. That was left over from when they were placed in pixels, and it briefly mis-showed a stick held during rotation.

### Fresh audit, round 29

- **Mouse on touch-capable devices (from before today):** on touchscreen laptops and Chromebooks, and on iPads with a mouse, the invisible touch-stick zones swallowed the mouse over the lower half of the screen, so a child couldn't aim or squirt down-left or down-right of their tank. Mouse aiming, squirting and the driver's-seat pointer lock now work over those zones too, and both sets of control hints show.
- **Cards in the store's preview frame (from round 28):** the cards were pushed right of a minimap that isn't shown there and ran off the edge. They now centre across the whole frame.
- **Cleanup:** the cards' placement is written once, and the `hearing()` comment points to audio.js for how sounds are spaced.

### Fresh audit, round 30

Cleanup came back clean.
- **Honest paint bar (Splat match):** the bar filled relative to the leader while its label showed your share of the floor, so it could read 60% full beside "11%" and shrink while you painted. It now fills to your share of the floor, the same number as its label, and only ever grows.
- **Toasts on landscape laptop windows (521–700 px tall):** they now sit at the top middle too, clear of the tank.
- **Enter and HUD buttons:** a clicked 🏠, 👀 or 🎵 kept keyboard focus, so Enter, a key young children mash, pressed it again; one 🏠 click plus Enter ended the round. HUD buttons no longer take focus from a click.
- **Driver's seat hint on hybrid devices:** it now follows the input in use, so a mouse user hears "Click, then move the mouse to look".

### Fresh audit, round 31

(The design review reported after this was committed; its findings are fixed in round 32.)
- **Toast over the strip or timer on laptop windows (from round 30):** a top toast now measures the top-middle stack (fraction strip, or timer and goal) and sits just below it whenever they'd overlap.
- **Menu defaults:** they are set once, in `game.opts`, and shown through `setOpt`. The HTML no longer repeats them, so the two can't drift.
- **Comments:** the floaters comment and the `paintVersion` comment match what the code does.

### Fresh audit, round 32

Design came back clean. The round 31 design review, which arrived late, and round 32's bug review found:
- **Pointer in the driver's seat:** with cards up, or after Esc, the mouse was free but the crosshair stayed fixed in the middle, so a child couldn't see where they were pointing. Free of the pointer lock, the ring now follows the mouse; it centres only while the mouse is captured (or on touch).
- **Tab, Tab, Tab, Enter, Enter ended the round:** 🏠 in play now ignores keyboard-triggered clicks. Tab sits right beside Q, the balloon key. A real tap or click still works.
- **Toast stretching on rotation (from round 31):** a toast placed below the top-middle stack kept its inline position when the layout changed, and stretched into a tall panel. The toast now sets only one edge, and it is re-placed on resize.
- **Not changed:** with cards up, the toast still sits over the cards' title, which is also spoken, rather than over the tank (as decided in round 26).
- **Comment fix:** the tank-label comment says painting together shows the tier.

### Fresh audit, round 33

- **Stray taps skipped the ending:** the results appear right over where ⚡ and the sticks were. A child still tapping hit the results 🏠 (one tap), then the menu's PLAY. That skipped "Four quarters make one whole" and the floor picture, and on a host device it restarted everyone's game. A newly shown screen now holds its buttons back, faded: the results for 2.5 s, so the whole-floor line is heard, and the menu for 1.5 s.
- **🏠 and the keyboard (from round 32):** ignoring keyboard-triggered clicks also locked out screen-reader and switch users, who would have had no way out of a Paint together round. 🏠 is now left out of the Tab order instead, so Tab-and-Enter mashing can't reach it but assistive tech still can. The two-tap confirm is unchanged.
- **Comments:** the `placeBanners` comment sits on `placeBanners` again, and a contradictory CSS comment is gone.

### Fresh audit, round 34

- **Flashing in the driver's seat:** the camera sits just behind the nozzle, so the growing puff of every squirt filled the middle of the view about twice a second, a steady colour pulse. Your own squirts seen from the driver's seat now send only the little drops; the sky view is unchanged.
- **The button hold and the keyboard (from round 33):** `pointer-events: none` stopped taps but not Tab and Enter, so a child mashing keys could still skip the ending. The held buttons are now `inert` for the hold, which blocks keys too.
- **Comment fix:** the `cardsSaid` and `arriveTimer` comments are back on their own lines.

### Fresh audit, round 35

- **Bursts in the driver's seat:** round 34 calmed only your own squirt. Paint landing on a wall in front of you, or a robot's shot landing on you, still burst its pop ball and white ring across the view. This is now fixed in one place: in `fx.js`, any effect within 6 m of the camera (only the driver's seat gets that close) leaves out its pop, ring, sparks and confetti, and sends a few small low drops. Round 34's per-call flag is gone. The sky view is unchanged.
- **Tidy:** the `body.arriving` rule no longer repeats `pointer-events: none`, because `inert` already holds the buttons; it only fades them.

### Fresh audit, round 36

- **Big splashes just past 6 m:** a balloon or bucket burst grows several metres wide, so one 7–8 m ahead still filled the seat view. The near distance now grows with the splash's size (6 m plus 3 m per size step: about 13 m for a balloon, 15 m for a bucket). The sky camera stays 30 m away, so the sky view is unchanged.
- **Your own throw in the seat:** a blob, and especially a 🎈 balloon, starts half a metre from the seat camera and covered most of the view for a few frames on every throw. A blob is now hidden until it is clear of the camera (1.5 m, 3 m for a balloon), and its trail starts with it.
- **Respawn rings in the seat:** a child joining mid-round, or coming back after a host change, with the seat view saved saw the arrival rings spawn while the camera was still in the sky, then had the camera drop inside them. Your own arrival seen from the seat now has no rings.

### Fresh audit, round 37

Design and correctness came back clean.
- **Tidy:** a blob's trail now starts when the blob itself shows (one check, one radius), instead of a second near-camera check in `shellTrail` with its own 3 m. The `splash` size comment now matches its callers (0.8 blob, 2.5 balloon, 3 bucket).
- **Shown matches said:** the upgrade cards' title reads "Level up! Pick a new power", as the voice says it.

### Fresh audit, round 38

Code quality came back clean.
- **Seat lens after a resize:** `world.js` reset the field of view to the sky view's on every resize, and `setLens` skipped its work when the shape hadn't changed (browser zoom, or a window resized in proportion), so the driver's seat narrowed to 45°. Only `setLens` sets the field of view now.
- **Cards at "Time's up!":** an unpicked level-up kept the cards up through the match's ending, hiding the "Time's up!" banner and letting a pick talk over it. The cards now go away when the round is over.
- **Mouse-look in the countdown:** with the pointer locked during the countdown, mouse moves built up and turned the view in one jump at "Paint!". They're now let go until you can drive.
- **Switching into the seat mid-burst:** puffs and blobs spawned that frame were judged from the sky camera, then the camera dropped in among them. On the frame the camera enters the seat, effects and blobs around it are cleared or hidden.

### Open

- Real play by the children: whether 85% feels right, and whether thirds are too abstract for the youngest.
- Not deployed yet. Deploy with `npm run deploy` and then `publish_game` (see README).
