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

- **Chalk fractions from the seat (design):** each label was fixed to face the sky camera, so from the driver's seat facing south "1 over 4" read upside down as "4 over 1", and facing east or west it lay sideways. The labels now turn to the quarter turn nearest the seat's heading (`parts.js turnLabels`), and back for the sky view.
- **Cards by keyboard and assistive tech (design):** the cards answered only a press, so Enter, Space and screen readers couldn't pick one. They now answer a click too; a press's own click finds the offer already taken.

### Fresh audit, round 39

Code quality came back clean.
- **A friend's splash in Paint together (design):** round 17 calmed robot hits only, so one child squirting another flashed and wiggled the friend's tank about twice a second, with sparks, 💦 and a boing each time. In Paint together every tank hit now just tints the tank; the floor under it is still painted. Splat match is unchanged.
- **One tap, two powers (correctness):** with more points waiting, the click that follows a tap landed on the next set of cards and took a second, unchosen power. A press's own click is now skipped; Enter and assistive tech still pick by click.
- **Chalk labels near a diagonal (correctness):** looking along a diagonal from the seat flipped every label back and forth. They now turn only once the view is a little past the diagonal.

### Fresh audit, round 40

- **Keyboard-only painting (design):** no key squirted, so a child driving with the arrow keys alone painted only a thin wheel trail, and in the driver's seat ← → slid the tank while the view stayed fixed. Driving now paints on keys too (`input.js handsFree`; changed in round 41), as the drive stick does on touch: the turret squirts ahead in the sky view, and in the seat the view swings behind the tank so ← → steer. Moving or clicking the mouse gives aim back to it. The menu's keyboard hint says "WASD or arrows drive and paint".
- **Selected choices for screen readers (design):** the menu choices and 🎵 now carry `aria-pressed`, as the colours already did.
- **Your own splat on a tank in Paint together (correctness):** round 39's early return also silenced the squirter's own splat when a blob hit a tank. The squirter hears the same soft splat as on the floor again.
- **Tidy (code quality):** a card press now removes both its end listeners once either fires, instead of leaving one behind per pick.

### Fresh audit, round 41

- **Whirling in the driver's seat (design):** round 40's keyboard driving in the seat chased the tank's heading with the view, so holding → spun the tank in a tight circle at about 230°/s, and ← kept it spinning the same way. The touch drive stick held sideways did the same. Driving alone in the seat now steers like a toy tank: left and right turn the view gently, up and down drive along it, and paint squirts ahead.
- **The mouse keeps the aim (design):** after 2.5 s of a resting mouse the turret left the cursor, squirted on its own, then snapped back at the next nudge. Driving alone now paints only until the mouse is used in a round (`input.mouseUsed`, cleared at each start); from then on the mouse aims, resting or not.
- **The seat line for keys (design):** a keyboard child is now told "← → turn" rather than sent to the mouse.
- **Squirting stuck on (correctness):** with left and right buttons held together, letting go of left arrived as a move and the last release named the right button, so squirting stayed on into later rounds. Squirting now follows the left button's state, and stops on leaving a round.
- **Tidy (code quality):** the crosshair and the aim share one `mouseAims()`, and toggle buttons (menu choices, colours, 👀) go through one `hud.press`, which gave 👀 its `aria-pressed` too.

### Fresh audit, round 42

- **A brush of the mouse (design):** any 1 px mouse or trackpad move took the keys' painting and toy-tank steering away for the rest of the round. Only a press, or about 40 px of movement within half a second, hands the aim to the mouse now. When it takes over from the keys in the driver's seat, the child hears how the mouse looks around.
- **Backwards in the toy-tank seat (correctness):** ← → turned the view but not the hull, so after a big turn ↑ took the tank's reverse path at 75% speed for good. The hull now turns with the view, so ↑ always drives forward.
- **A second mouse button (correctness, older than today):** pressing right while holding left (or left while holding right) arrives as a move, so the balloon or the squirt didn't start. Such a press is now heard.
- **Tidy (code quality):** the toy-tank steering shares the seat's driving code, and the seat comment describes both ways of steering.

### Fresh audit, round 43

- **Reaching for the cards (design):** a keyboard child who picked an upgrade card with the mouse swept the cursor across the game on the way, which handed the aim to the mouse for the rest of the round; in the seat the mouse line also cut off "Pick a new power". Mouse movement while the cards are up, and for a moment after, no longer counts.
- **A stale cursor spot (correctness):** the sweep tally remembered the cursor's last spot on the game for good, so after a round, a menu or a HUD button, the first 1 px brush counted the whole jump back and took the keys. Only moves close together add up now, and leaving the game's surface starts afresh.
- **Tidy (code quality):** a mouse press and a chorded press share one `press`, and the sky view and the seat share one `drivingAlone()`.

### Fresh audit, round 44

- **The bigger tanks had no turret (design):** the four tanks share one GLB with the same node names, and the loader renames repeats (`turret_1`, `barrel_1`, …), so only the Squirter found its turret, barrel and muzzle. From the Splasher up, the whole tank swivelled to the aim and slid sideways while driving (robots and friends too), blobs and puffs started from the tank's middle at floor height, and in the seat the camera sat low with the Titan's barrels hanging over the view. Nodes are now found by their original name (`userData.name`; restored at load since round 45), so every tier's turret turns on its hull and the seat eye sits above its own nozzle.
- **Muzzle drops in the seat (design):** the near-camera muzzle skipped its puff but still threw full-size drops up toward eye height twice a second. Beside the camera it now shows nothing; the blob shows once it's clear.
- **After a card pick (correctness):** the quiet moment around the cards was only refreshed by moves over the game, so it had run out by the time a child who'd looked at the cards picked one, and moving off the card handed the aim to the mouse. It now runs from any move or press on the page while the cards are up.
- **Tidy (code quality):** `handsFree` is private to `input.js`.

### Fresh audit, round 45

Design came back clean: every tier turns its turret on a still hull, fires from its own barrels, and sits its seat eye above its nozzle.
- **Squirting through walls (correctness, from round 44):** the bigger tanks' nozzles reach about 2.5 m out, so a Roller or Titan pressed against a thin wall started its blobs inside or past the wall, and the paint landed on the far side. When the way from the tank's middle to a nozzle isn't clear, the blob now starts from the middle (`lineOfSight` also checks its end point).
- **Blobs from last frame's aim (correctness):** the nozzles were read before the frame had turned the turret, so a quick flick fired from where it pointed before, behind the tank. `muzzles()` now poses the tank first (`Tank.pose`, shared with `render`).
- **Renamed parts, fixed once (code quality):** the loader's renamed nodes now get their own names back when the models load, so `setModel` finds parts with plain `getObjectByName`. The fallbacks that had quietly hidden the missing parts (whole model as turret, turret as muzzle) are gone.

### Fresh audit, round 46

- **Names over the results (design):** the results screen sits over the stilled 3D scene, and tank name labels draw on top of everything, so a tank left high on the screen put its name across "Four quarters make one whole floor!". Labels and the crown are hidden when the results come up.
- **Splashing yourself (correctness, older; more often since round 45):** with ricochet, squirting at a nearby wall bounced the blob back onto your own tank: in Splat match a flash, 💦 and boing on every shot. Your own blob coming back now just tints you with a soft splat, as in Paint together.
- **Tidy (code quality):** `muzzles()` no longer updates every matrix in the tank per shot; `getWorldPosition` updates each nozzle's own chain.

### Fresh audit, round 47

Correctness and code quality came back clean.
- **Chalk fractions under pads and buckets (design):** label spots avoided walls, crates, rocks and trees but not the pickup pads (not colliders) or the paint buckets (skipped on purpose). In halves nearly every label had a pad 1–3 m from its numerals, its disc and floating icon covering the "1" of "1/2"; in square quarters some sat under a bucket. Labels now keep clear of both, and if no spot with room around it exists they settle for the label alone being clear (0 of 390 labels over 30 arenas touch one).
- **PLAY over the choices on landscape phones (design):** the sticky PLAY floated over the Robots and Speed rows, so a tap meant for 🚀 started the round. On landscape phones PLAY now stands, smaller, in its own column beside the choices and stays mid-screen while they scroll.

### Fresh audit, round 48

Correctness came back clean.
- **A ticking countdown in Paint together (design):** a Super squirt or Big brush showed 💦 7, 6, 5 … under the tank, a clock in the mode that promises none (and a number a pre-reader can't use). Powers now show just their icon with a thin bar that drains as they wear off, in both games.
- **Tidy (code quality):** the landscape-phone PLAY placement states its sticky spot on its own, rather than half relying on the general short-screen rule (`bottom: auto`).

### Fresh audit, round 49

Design and correctness came back clean (real painting to the end on iPad, phones and two devices, reduced motion on for one run; three devices with a mid-round joiner; 28 fuzzed rounds).
- **Tidy (code quality):** the power pills take their icon and length from `PICKUPS`, as the pickups themselves do, and find their bars directly rather than querying each frame.

### Fresh audit, round 50

Correctness came back clean (12 rounds back to back with steady geometries, textures and heap; three devices; a host leaving mid-match).
- **A guest who hasn't touched yet hears nothing (design):** iOS drops every spoken line until one is spoken inside a tap (Chrome likewise on an untouched page). A host's first line comes from the PLAY tap, but a guest's round starts from the network, so a guest child who only drove heard none of the fraction lines. The first gesture now opens speech with a silent word (the first that counts as one, since round 51), and if it comes mid-round in Paint together, the opening line is said again.
- **Space on buttons (design):** Space was stopped on every screen, so it couldn't press a focused menu choice, PLAY or Play again (Space is the usual button key, and many switch setups send it). It now presses a focused button; in play it still zooms, and never picks a card.
- **Two robots with one name (design):** robots drew names at random, so with 7 robots two could both be "Twinkly Hippo", or share the child's name. Every tank's name is now its own.
- **Tidy (code quality):** the short-screen CSS comment no longer claims to hold every short-screen rule.

### Fresh audit, round 51

Design came back clean (real painting to the end on iPad, phones and two devices; keyboard only; every menu button reachable at seven sizes).
- **Speech opened on a finger landing (correctness):** round 50 opened speech on whichever input came first, and on touch that is the finger landing, which browsers don't count as a gesture; the silent word was dropped and it never tried again, so on an iPad a guest who only drove still heard nothing. Speech now opens on the first event that counts (a finger lifting, a click, a key, a mouse press).
- **Speech opened with sound (code quality):** the silent word now lives in `unlockAudio` beside the sound unlock it shares a reason with, so each tap runs one listener, not two.

### Fresh audit, round 52

All three reviews came back clean: design (real painting to the end in WebKit and Chromium on iPad, phone, laptop and two devices), correctness (gesture rules per input device, fuzzed rounds, three devices with a late joiner) and code quality. This ends the fresh-audit loop.

### Open

- Real play by the children: whether 85% feels right, and whether thirds are too abstract for the youngest.
- On a real iPad: that speech opens when a stick drag ends (headless engines can't show iOS's gesture rule).
- Not deployed yet. Deploy with `npm run deploy` and then `publish_game` (see README).

## Pass 2 (2026-10-11): more realistic, more to play with, still calm

| Change | Where |
| --- | --- |
| Tanks drive like tracked vehicles: the hull's turn eases in and out, and it turns quicker on the spot than at full speed. The tank pulls away with some weight and brakes harder than it accelerates, and the tracks grip, so sideways sliding dies away | `tank.js` `drive` |
| The hull rocks on its suspension: it squats as it pulls away, noses down as it stops, leans out of turns and rocks back when it squirts. It is worked out from how the tank moves, so friends' tanks rock too. It settles after one small rock and is off under `prefers-reduced-motion` | `tank.js` `suspend` |
| The turret swings round to the aim (about half a second for a half turn) and stays on it while the hull turns. In the driver's seat it is the view, so it follows at once | `main.js` `squirt`, `BASE.turretRate` |
| Tread marks: each track presses a pattern into the sand, and through paint, which fades over about 30 s. It is only for looks and never counts as paint | `treads.js` |
| Blobs fly a real arc, higher the farther they go, tipped and stretched along their path. With a mouse they land on the point under the pointer, so the aim ring is where the paint goes | `shells.js`, `main.js` `fire`, `playerControls` |
| 🏐 Beach balls, one in each quarter. A tank nudges a ball along, and a squirt knocks it (up to a gentle speed). Balls roll to a stop, bounce off walls and each other, and paint a stripe in the colour of whoever touched them last (later rounds: they roll back off the outer wall and off any wall or prop they are left against). A balloon or bucket nearby sends them rolling. They show on the minimap. Robots leave them for the children: they steer round them, their blobs fly past them, and their bumps and bursts roll a ball without taking its colour. Knocks make a soft bonk | `balls.js`, `main.js` `hostBall`, `hostStep`, `bigSplash` |
| Fast trails stay solid: the host fills in splats between trail points when the gap would show, so a zooming tank or a fast ball leaves a stripe rather than dots | `main.js` `trailTo` |

The host rolls the balls and sends them in a `bl` message, `[[x, z, vx, vz, toucher], …]`, 20 times a second while any ball moves, twice more as they come to rest (a quick message may be lost; from round 65), and once a second when they are all still. Other devices glide after the host's balls the way they follow tanks. Each device keeps its own tank out of the balls, and the host gives itself a 0.25 m reach, so a friend's tank still nudges the ball. A friend joining part way through gets the balls in the round's snapshot.

### Evidence

Test scripts are in the session scratchpad (`ball.mjs`, `duo.mjs`, `modes.mjs`). They report 0 errors in Chromium and WebKit.

- `ball.mjs`: a tank driving into a ball from a short run-up sends it rolling about 5 m. The ball takes the tank's colour and paints a stripe.
- `duo.mjs` (`dev/two.html`): a guest's tank pushes a ball, and the host rolls it. The two devices end within 0.1–0.5 m of each other and agree on the ball's colour.
- `modes.mjs`: Splat match at iPad landscape with touch, and the driver's seat view with the lower arc. Paint stays out of the middle of the view.

### Fresh audit, round 53

- **The first squirt missed the click (design):** with the turret now swinging round, a click away from where it pointed sent the first blob the old way (20 m from the pointer). With the aim stick the first blobs went 90–174° off. Most children click once, so that first blob is the one they see. A squirt or balloon now waits until the turret is on the aim, and the aim stick hands its direction straight to the turret's swing. Both land on the aim (0.1 m, 1°).
- **Robots took the balls (design):** robots steered round the balls, but their blobs still hit them. Robots were the last to touch a ball about 30 times in two minutes against 3 for the child, and their shoves walked the balls to the walls. A robot's blob now flies past a ball, and its bumps and bursts roll a ball without colouring it. That made 0 robot touches, and the balls stay out in the play area.
- **A ball over a chalk fraction (design):** the balls start near the middle of each square quarter, where the label goes. Labels now keep clear of the balls' starting spots, as they do of pads and buckets (at least 3.4 m over 12 arenas).
- **Balls rolled away too far (design):** a full-speed bump sent a ball off at 14 m/s for 12–20 m, too far for a small child to follow. It now goes about 8–10 m, so a ball can be pushed along like a football.
- **A ball rolling into a tank stuck to it (correctness):** a ball was only moved back out of a tank, keeping its speed into it. It sat against a parked tank still "rolling", which kept the `bl` messages and its trail going. On a friend's device the ball glided on ahead and shoved their parked tank about 5 m. A ball now bounces off a tank, and a friend's tank moves about 0.5 m at most (network lag).
- **A ball pushed through a wall (correctness, plausible):** the host places a friend's tank slightly ahead of where it was last heard of. The ball is now moved out of a tank by at most 0.6 m a step, and out of walls again after the tanks.
- **Tread marks never quite faded (correctness):** the canvas keeps alpha in whole steps, so the last 1–3 % of every mark stayed for the whole round, and the fade re-uploaded the texture every 2 s forever. Marks below 3 % are now hidden (`alphaTest`), and fading stops once everything is under that.
- **Paint past the pointer on big tanks (correctness):** the mouse's range took the nozzle as 1.5 m ahead, but it is 2.1–2.5 m on the bigger tiers, so paint landed up to 1 m past the ring. The range is now measured from the real nozzle.
- **Suspension tied to the frame rate (code quality):** the pitch came from the gap to the smoothed speed divided by the frame time, about 6× too big at 60 Hz and 12× at 120 Hz, so it just flipped between its limits. It now uses the smoothed derivative.
- **Braking while reversing (code quality):** pushing the stick backwards while rolling forwards used the gentler pull-away rate. It now brakes.
- **Tidy (code quality):**
  - Balls and tanks share one glide helper (`glideTo`) and `r2`, and the arc's tilt uses its exact slope.
  - `trailAt` is declared where tanks and balls are made.
  - The turret rate moved to `BASE.turretRate`.
  - A balloon hitting a ball goes through the same `landed` path as anywhere else.
  - The dead `mesh.visible` checks are gone.
  - The `stepBalls` comment now says what it returns.
  - A split Pass 2 table row is mended.

### Fresh audit, round 54

- **A quick flick of the aim stick misfired (correctness):** let go of the stick before the turret had swung round, and the waiting squirt took the turret's half-way direction as its aim and went off at once, up to 143° wrong. The 🎈 button did the same. A waiting squirt or balloon now keeps the aim it was pressed with until it has gone. It lands on that aim (0.01 rad) however short the flick.
- **Blobs flew one frame past their range (correctness):** a blob moved a whole frame before checking its flight time, so paint landed up to 0.4 m past the ring at 60 Hz and 1.3 m at a slow host's 20 Hz. It now flies only the time it has left (0–0.04 m).
- **Your own blobs over the ring in the driver's seat (design):** the higher Pass 2 arc carried your own blobs, 70–150 px tall, up through the aim ring and the tank you were aiming at. From the driver's seat your own blobs now show only from 6 m out, and see-through.
- **The ring beyond reach (design):** the mouse's ring is the cursor, but about a quarter of a laptop screen is past squirting range (22 m), and paint fell up to 21 m short with no sign of it. Past range, the ring dims and a dot shows where the paint will really land.
- **Lobs splatting in mid-air (design):** collisions ignored height, so a lob 2 m up splatted on a 1.6 m wall it plainly flew over, and splashed tanks it passed above. Every prop now has its height from the Blender models (wall 1.6, crate 2, rock 2, tyres 1.4, tree 5, tower 5.3 m), as do tanks (1.8 m) and balls (2.3 m), and a blob flies over anything lower. A short squirt still hits a wall in front of you; a long lob clears it (8–13 m beyond). Paint buckets are hit at any height.
- **Backing up forever (design, older):** with the stick or keys held behind, the tank reversed for as long as they were held, auto-squirting back over the ground it had driven. It now backs up for 0.6 s, then turns round and drives that way. The driver's seat, which steers its own hull, still backs up for as long as it's held.
- **A tank pressed into a wall kept its speed (design):** it kept its 10 m/s, with dust, suspension and that speed sent to friends' devices. It now loses its speed into a wall, a prop or a tank and keeps the part along it. A ball doesn't count, since the host kicks the ball on with the speed the tank pushes it with.
- **Cheaper tread marks (correctness, plausible on iPad):** the marks use a plain lit material and are drawn only while there are marks.
- **A guest's ball inside a wall (correctness, plausible):** a guest carries the host's balls on by their speed, so a ball just bounced off a wall could show inside it for a moment. It is kept out of walls.
- **Tidy (code quality):**
  - The ball shoves for a squirt and a burst live in `balls.js` (`squirtBall`, `burstBalls`) with the other ball physics. A burst exactly in line with a ball no longer tilts its push.
  - The heights blobs fly between are named once (`NOZZLE_Y`, `LAND_Y`), and the mouse aims at `LAND_Y`.
  - Robots hand their aim to the same turret swing as everyone (their own 5 rad/s clamp is gone). The comment says why they squirt while it swings.
  - The suspension's smoothing rate is named once. `KICK` and the ball's white are named.
  - A stale `TURRET_RATE` and a ball distance in the docs are corrected.

### Fresh audit, round 55

- **Squirts sailed over tanks 4.5–15 m away (design, from round 54):** without a mouse (stick, keys, the driver's seat, robots) every blob flies its whole 22 m, and from about 4.5 to 15 m out its arc is above a tank. Squirts at a tank there missed every time, at the most natural distance. Tanks and balls are now hit at any height, like paint buckets; only props are flown over (4/4 hits from 3.5 to 21 m).
- **Balls stuck at the walls (design):** a child chasing the balls drove most of them to the outer wall within a minute or two, and a ball in a corner couldn't be driven or squirted out. With no clock in Paint together, every ball ended up out of play. Over the last 4 m by the outer wall a ball now rolls back as if the floor rose there, at up to about 2 m/s (from a corner to about 4.5 m out, room for a tank to get behind it).
- **A quick tap didn't squirt (design, older):** a press and release between two frames, as a trackpad tap often is, gave no squirt (0 of 6). The press is now kept for the frame, like zoom and balloon presses, and the squirt then waits for the turret with the aim it was pressed with (6 of 6).
- **A waiting click took the mouse's later distance (correctness):** a squirt or balloon waiting for the turret kept the clicked direction but, when it went, took the distance to wherever the mouse had moved by then. Clicked 6 m behind, then moved on, it landed 20 m away. It now keeps the clicked spot too (6 m).
- **Sticky wall slides (correctness, from round 54):** taking a tank's speed into a wall also fed into its driving, whose grip then killed the sideways part, so a diagonal push slid along at about half speed (4 m/s instead of 7.3 at 45°). The tank now keeps its tracks' own speed (`trackVel`) apart from the speed it shows and sends (`vel`), and slides as before.
- **Lobs landing inside props (correctness):** a lob coming down onto a crate, rock, wall or tyres was already over it, so it took a side's bounce from inside. Bouncy blobs ping-ponged there and then splatted in the middle, or were thrown 6 m back. A blob coming down from above now lands on top, and a bounce only happens off a side it is flying into.
- **The reach dot from a swinging nozzle (correctness, plausible):** the dot measured from the nozzle where it was mid-swing, so it could show "out of reach" for a shot that reaches. It now measures as if the turret were already turned to the mouse.
- **Tidy (code quality):**
  - The mouse's floor point is found once (`mouseGround`), and `showReach` stops early when nothing is aimed.
  - Projected points become screen pixels in one place (`toScreen`), and the ring and the reach dot share one marker helper.
  - The driver's seat tank lives in `view.seatTank` beside `view.seat`, instead of a second flag set elsewhere, and it is cleared at the menu.
  - Your own see-through blobs in the seat have no solid shine or shadow.
  - Small tidies: a blob's step start is read before it moves, and the crosshair's CSS is back together.

### Fresh audit, round 56

- **Sweeping paint like a hose squirted far less (design, from round 53):** every squirt waited for the turret, so with squirting held and the aim swept round (how young children paint), squirts stopped until it settled: 1.2 a second swinging side to side, 0.3 twirling the stick, against about 2. Only a press's first squirt (and a balloon) waits now; while squirting is held the rest go on time from wherever the nozzle points (2 a second, evenly spaced).
- **A diagonal pull behind did a three-point turn (design):** backing up first steered the rear onto the stick, then turned round the other way, about 225° of turning before the tank went where it was pointed. Backing up now goes straight back along the hull, then turns round directly.
- **A flick while driving misfired again (correctness):** with the drive stick held, letting go of a flick handed the squirt straight to squirting ahead, which took over its aim (100–123° off). Squirting ahead now waits until a flicked squirt has gone.
- **A click before any move aimed at an old spot (correctness):** a press didn't record where it was, so the first click after PLAY (no move over the arena yet) aimed at the middle of the screen or last round's spot. It now records where it was pressed.
- **Robots stalled when a new host took over (correctness, from round 55):** a guest's robots only follow, so their tracks' speed was zero, and on taking over they stopped dead for half a second. They now carry on at the speed they were moving.
- **Robots kept their speed after the round (correctness, older):** parked robots kept puffing dust through "Time's up!", and sent that speed to friends. Out of play they stand still like the player's tank.
- **Small (correctness, plausible):**
  - A tap during the reload is kept, and squirts as soon as the nozzle is ready.
  - A blob landing on top of a prop splashes up there, not hidden inside it.
  - The reach dot allows for a squirt's recoil, so it doesn't flicker.
- **Tidy (code quality):**
  - A blob that comes down onto a prop is told by a zero normal, which already stops a bounce, rather than a separate `top` flag. The comment says why `y > 0` tells a blob from a line of sight.
  - The tracks' own speed is named `trackVel`, and it is zeroed with `vel` when the tank isn't driving.
  - A waiting squirt's floor point is copied without a new object each frame.
  - Comments now match the code: the turret-wait comment covers taps and the mouse's spot, the ball-return comment no longer claims a sloping floor, its speed reasoning is right, and the over-tank distance is 4.5–15 m.
  - Round 55's log no longer lists two tidies that the same round undid.
  - The README mentions the dot past the mouse's reach.

### Fresh audit, round 57

- **After driving alone, the next press squirted wherever the turret pointed (correctness, from round 56):** squirting ahead on its own counted as hosing, and hosing never ended while it ran. So the first flick or click after driving went off at once along the turret, without waiting (up to 78° off, about 40% of flicks). A new press now always waits for its own aim, and squirting ahead never counts as hosing (3° or less).
- **A click in the driver's seat froze the view (correctness, from round 56):** a click during the reload made the seat's turret, and with it the camera, hold the old aim while you looked round, then jump 80°. Nothing waits in the seat now; its aim is the view.
- **A click while driving landed metres off (correctness, from round 56):** a click kept during the reload went along the direction clicked from where the tank had been, up to 5 m off after driving on. While a clicked squirt waits, it now keeps aiming at the clicked spot (0.15–0.17 m).
- **A ball pushed into a corner froze and drummed (design):** a child pushing a ball into a corner or against a prop left both stopped dead. The tank still showed full speed, with dust and that speed sent to friends. The ball kept its speed into the wall, sent 20 messages a second and bonked about 8 times a second.
  - The ball now loses its speed into the wall.
  - A tank pushing a ball that can't go on stops against it as against a wall.
  - The ball squeezes out sideways past the tank to whichever side is open. Wedged in a corner with no side open, it just rests, quietly, and rolls back out when the tank backs off.
  - A ball that isn't moving never bonks.
- **The reach dot outside the arena (design):** near an edge it could sit on the grass beyond the outer wall, where the paint splats on the wall. It now stops at the wall.
- **Splashes on top of props were still hidden (code quality):** round 56 raised a splash to the blob's height, but kept offsets measured from the floor, so its ring sat inside the prop. It also used the blob's height from the frame before, and raised splashes on tanks and balls into the air. A blob that comes down on a prop now splashes at that prop's top. Everything else splashes on the floor as before.
- **Taps during the reload were only kept for the mouse (code quality):** pushing the aim stick out now counts as a press too, so a child's quick flick during the reload isn't lost either.
- **Tidy (code quality):**
  - `Tank.stop()` stands a tank still in the three places that did it by hand.
  - The barrels' kick is one constant (`RECOIL_KICK`), shared with the reach dot.
  - The waiting-squirt fields say what they do.
  - The squirt-ahead comment says what the branch is for first.
  - `drive` skips the steering maths while backing straight up.

### Fresh audit, round 58

- **Balls against walls, simplified (correctness and code quality):** round 57's sideways squeeze ran whenever any tank was within reach of a slow ball by a wall. A parked tank, one backing away, or a passing robot flung the ball off at 4 m/s and took it for that colour. Its wall check also ignored which side the wall was on, so pushing a ball along a wall stopped the tank and popped the ball off. Pushing diagonally into a wall could also build a ball up to 10 m/s, and a wedged ball and the outer wall's roll-back took turns, bonking. All of it is replaced by one rule: a ball pushed into a wall or prop in its way keeps only the part of the push along it, no faster than the push sends it. Pushed straight in, or into a corner, nothing is left and it rests, held, until the tank backs off or comes from the side. Only a wall in the push's way counts, and the tank stops against such a ball as against the wall. Results:
  - A parked or departing tank leaves a ball alone.
  - A push along a wall rolls the ball along it.
  - A corner held for 20 s gives 3–4 bonks instead of dozens.
- **A flick over within a frame (correctness, plausible):** it keeps the stick's direction instead of the turret's.
- **Tidy (code quality):**
  - `control()` is split into `squirt()` (aim, turret, waiting and hosing, documented in one place) and `moveTank()` (moving and sliding).
  - The seat's squirt-ahead is marked `c.auto` too.
  - The reach dot's wall clamp is a small helper without per-frame arrays.
  - The bonk only counts a ball moving faster than 0.6 m/s, whatever the frame rate.
  - `stepBalls`' comment sits on it again.

### Fresh audit, round 59

- **A ball jammed into a narrow gap drummed (design, from round 58):** "in the way" was judged from the single direction the walls together push a ball out, which in a gap between two props narrower than a ball points mostly sideways. So the wall really in the way was missed, and the ball was kicked in and bounced out every frame: about 8 bonks a second at full volume, a shuddering ball, and a stopped tank showing full speed (about 1 arena in 6 had such a spot in reach). The walls are now asked by motion: the ball is tried a little way along the push, settled clear of every wall and prop over a few passes, and how far it got decides. Pushed straight in, or into a corner or gap, it rests and the tank stops (0 bonks). Pushed at an angle it rolls on the way it is free to.
- **A ball stuck for good in an L of walls (design, from round 58):** from most angles a tank couldn't get a ball out of the inside corner of an L, and with no roll-back there (only the outer wall has one) it stayed for the rest of a Paint together round. A still ball left against any wall, prop, corner or gap now rolls gently off it over the first metre, half a second after a tank last touched it (about 1.5 m out of an L's corner).
- **A friend's push along a wall is weaker than the host's (design, open):** with the network's lag, the host sees a friend's tank a little behind where it is, so its push along a wall drifts the ball off the wall. It is minor and left as it is.
- **A mouse click on a touch laptop took the old stick direction (correctness, from round 58):** the one-frame flick rule tested any press while touch was in use, so a mouse click before moving the mouse aimed where the aim stick last pointed (or straight down). The aim stick now marks its own press (`input.flicked`).
- **Tidy (code quality):**
  - Comments follow the code after round 58: references to `control` now name `squirt`, and "wedged" is now "held".
  - The ball's top speed along a wall is said to be what the push sends it (1.15× the push), and a crawl along a wall resting is noted.
  - The final wall pass just moves balls back out (its cap did nothing).
  - `showReach` has its comment back on it.
  - Round 57's log is as it was.

### Fresh audit, round 60

- **Balls by walls, one test (code quality):** round 59's ball code had grown two "can't go on" tests that disagreed. The tank stopped against a ball pushed up to 33° off straight-in while the ball rolled away along the wall. The redirected kick measured from where a tank had just shoved the ball (sometimes into a wall), so it could send the ball back at a friend's tank. And its roll-off used one wide push, so between two props about 3 m apart it pulled a ball that touched neither into one of them. Now:
  - A pushed ball is tried `PROBE` along the push from where it sits clear of every wall and prop. Getting less than `STUCK` of the way, it rests and the tank stops, both by that one test. Otherwise it rolls on the way it got, no faster than the push.
  - A still ball rolls off a wall or prop only if it is really touching one, once each time tanks leave it, at `ROLL_OFF` (about a metre clear).
  - The tuning is named (`PROBE`, `STUCK`, `CRAWL`, `LEFT_FOR`, `ROLL_OFF`), and `touchedAt` says what it holds.
  - Guests' balls settle over the same passes as the host's.
- **Two balls pushed together into a wall shuddered (correctness, older):** the trial roll only asked walls and props, so a ball pushed into another ball resting against a wall counted as free. It was kicked at 11.8 m/s every step and bounced out again, kept both balls "moving" (messages 20 times a second, top speed past the cap), showed the stopped tank at full speed, and on a friend's device made the balls shudder through each other. Another ball now counts as in the way if it is stuck itself, all along a chain. Two or three balls pushed into a wall or corner rest, and the tank stops (1–4 bonks in 10 s, mostly the first touches).
- **A ball and a parked tank batted it to and fro (correctness, from round 60's rework):** a ball rolling off a wall into a tank parked just out of reach came back to the wall and rolled off again, for ever. Only a real push (or a squirt, or a burst) now lets a ball roll off a wall again.
- **Roll-off from a ball still moving (correctness):** the roll-off took any ball slower than 0.5 m/s, so one just bouncing gently off a wall was sent off at 2 m/s. It now waits until the ball has come to rest (under 0.05 m/s). A ball that comes to rest against a wall still rolls clear by design.
- **Dribbling at full speed drummed (design, older):** a tank driving on into a ball it was pushing caught it up about every 0.25 s and topped its speed up by 2.5–2.6 m/s, just over the bonk's threshold. So pushing a ball at full stick (and always on the keys) made a steady soft bonk four times a second, 53–93 a minute for a child chasing balls. A bonk now needs a knock big for the ball's speed (at least 40% of it), so a top-up doesn't count (1 bonk at the first touch instead of 17 in 5 s); hits from rest, and off walls and balls, still bonk.
- **Docs:** round 59's log no longer names the removed `wallInWay`, and the Pass 2 table mentions the balls rolling back off walls.

### Fresh audit, round 61

- **Robots rocked against walls (design, from Pass 2):** a robot steering round something can have its way flip between almost opposite directions every few frames, and each flip restarted the child's brief back-up. So robots sat pressed to a wall, rocking, for 10–35 s at a time (15–169 s a round with 3 robots), and stopped helping. `drive` now takes how long to back up: a moment for a child, as long as it's held in the driver's seat, and not at all for a robot, which turns round straight away. Now 0–50 s a round, the longest 11.5 s, at or below what they did before Pass 2.
- **A ball beside a stuck ball stopped too (correctness, from round 60):** the chain test counted any ball ahead within reach, including one off to the side that the push would pass by. So a ball pushed past another resting against a post froze in open floor, and stopped the tank with it. Only a ball in the pushed ball's path counts now.
- **Wall bounces sometimes made no bonk (correctness):** the bonk needed the ball to move a little that frame, and the frame a ball reaches a wall it may cover only the last centimetres, so 5–20% of wall hits were silent. It now looks at this frame's movement or the last one's (20 of 20 at 3–12 m/s). Held balls and chains stay quiet (0–3 bonks in 10 s), and dribbling gives 1–2.
- **Tidy (code quality):**
  - `tryRoll` asks the chain of balls ahead before the walls, so it no longer saves and restores its scratch around the recursion. Its comment says what it leaves when another ball stops it.
  - "Stuck" is now decided along the push's line in both places, the ball's rest and the tank's stop, so they really are one test. The ball's free direction is only used to steer a ball that isn't stuck.
  - Named: a real push (`pushing`), the touch margin (`TOUCH`) and tank-to-ball reach (`REACH`).
  - `settle` is no longer exported.
  - Comments are fixed: the ball's shape lists `rolledOff`, `LEFT_FOR` says "by it", the roll-off comment reads in order, and the top-up comment says "a little for how fast it is going".
  - Round 60's chain bonk count is re-measured (1–4 in 10 s).

### Fresh audit, round 62

- **A ball wedged between a wall and a rock drummed (design, older):** in about 1 arena in 16 a rock (or tyres, or a tree) stands just short of a ball's width from the end of an L of walls, leaving a V narrower than a ball. A ball pushed into it shuddered, bonking every frame (about 7 a second heard, the sound being spaced out), and the stopped tank showed full speed. The trial along the push slid along the wall into the rock and still seemed to get somewhere. A trial that can't settle anywhere a ball fits now counts as stuck (5 bonk calls instead of 77 in 2.5 s; the ball rests and the tank stops).
- **Robots nose-in to an L's corner (design, older):** when every way toward its goal was blocked, a robot drove straight at the goal anyway, and a pickup or a new spot behind the wall kept it there for 14–57 s. Boxed in, a robot now picks somewhere else to go and leaves pickups for 4 s (no robot stuck in 8 full rounds, against about 4 rounds with a stuck robot in 18 before).
- **A stray bonk when a ball jumps (correctness, plausible):** on a friend's device a ball that jumps to the host's spot (after a stall, or on joining) no longer counts that frame for a bonk.
- **Tidy (code quality):**
  - How long a tank backs up now travels with its controls: the robots' steering sets `backUp: 0` beside the comment on why, and the driver's seat sets `Infinity`. `control` just passes it on, and `drive` names the seat case.
  - The back-up comments now say it is a child's.
  - The stuck-ball docs list a stuck ball among what can be in the way.
  - The `min` aliases of `REACH` are gone, and a long comment is wrapped.
  - Open items are gathered below.

### Fresh audit, round 63

- **A friend joining heard the balls bonk (correctness, minor):** joining part way through, each ball within 6 m of its starting spot spun to the host's spot as if it had rolled there, and a rolling one bonked. Joining now puts the balls there outright, mesh and all.
- **Tidy (code quality):**
  - A friend's ball's jump distance is one constant (`SNAP`), used by the glide, the spin and the bonk, and the bonk reads `jumped`.
  - `tryRoll`'s comment covers both ways it can be stuck, and the fit check's centimetre is explained.
  - Robots set `backUp` beside their steering, and skip the pickup loop while boxed in.
  - Round 62's log gives its bonk counts and stuck robots in one unit each, with its entries in order.

### Fresh audit, round 64

- **A ball filling the driver's seat view (design):** pushed along from the seat, a ball sat just ahead of the nozzle and covered about 40% of the screen. Within about 3 m of the seat camera (from its surface) it now shows see-through, as your own blobs do.
- **A stray bonk after a network hiccup (correctness, minor):** when a friend's device heard nothing from the host for more than 150 ms, a fast ball's speed caught up all at once, which counted as a knock. The frame after such a gap is now quiet.
- **Small (correctness, plausible):** a robot lets go of a friend who has gone home at once, and a mouse lock refused just after Esc no longer leaves an error in the console.
- **Tidy (code quality):**
  - Putting a ball somewhere outright (a new round, a friend joining) is one helper (`placeBall`).
  - `glideTo` says when it jumped, so `renderBalls` no longer guesses it from how far the mesh moved.
  - The aiming ring's comment is back on `crosshair`.
  - The `tryRoll` comment and two README paragraphs are re-wrapped, and a dangling `else` is tidied.
  - Round 63's joining entry is put precisely, and an Open item cites where it was found.

### Fresh audit, round 65

- **Real knocks swallowed after a quiet spell (code quality and correctness, from round 64):** the host sends still balls only once a second, so the first knock after everything had been still came after a long gap and was taken for a hiccup: friends heard 1 of 12. A ball rolling slowly to a stop and knocked again within a second was missed the same way (9 of 12). Now only a gap about a ball last heard rolling fast enough to bonk counts (`GAP`, 150 ms; `BONK_MOVING`, 0.6 m/s), and the host sends the balls once more as they come to rest.
- **Tidy (code quality):**
  - A ball goes see-through by the seat camera at the same opacity as your own blobs (`SEE_THROUGH`, in `fx.js` beside `nearCamera`, whose comment now names it).
  - It fades once the camera has moved for the frame (it was a frame late going in and out of the seat), draws over the floor's marks while faded, and is transparent from the start, so fading needs no new shader on an iPad.
  - `takeBallState` reads the clock once per message.
  - Round 64's gap and the fade's comment say what the code does.

### Fresh audit, round 66

- **A child's paint landed out of sight (design, older):** with the aim stick or squirting ahead, every blob flew its whole 22 m, but the sky camera looks only a few metres ahead. On an iPad, squirting down landed below the screen, down-left and down-right at its very edge, and up under the fraction strip. A phone was the same, and on a portrait iPad left and right went off the sides. Squirting toward yourself, a natural way for a child to push, painted nothing they could see. A stick or keys squirt now lands as far as it can go but no further than the floor shows on screen, clear of the top panel and the bottom controls: about 11–14 m down, about 16 m up, the full range to the sides on a landscape iPad. The mouse still lands on its point, and the driver's seat looks along the squirt.
- **Silent tanks (design):** the driving looks heavy and real, but made no sound. Your own tank now has a soft, low engine purr that rises a little with speed and dies away when it stops. It is only your own, and well under the squirts.
- **The balls' stop message could be lost (correctness, plausible):** the quick channel doesn't resend, so the one extra send as the balls come to rest could be dropped, leaving a friend's last word of a ball "rolling fast" for up to a second. It is sent twice now.
- **Tidy (code quality):** the `GAP` and `BONK_MOVING` comments say what they cover (about two missed messages; both uses of the speed), the bonk comment names `BONK_MOVING`, `nearCamera`'s comment sits on it again, the ball send asks `isHost()` once, the fade's use of `depthWrite` is explained, and round 64's log says what round 64 did.

### Fresh audit, round 67

- **The engine purred on in a hidden tab (code quality):** the game stops drawing in a hidden tab, and with it the calls that set the engine's level, but sound plays on, so a child switching away mid-drive left it purring. It is hushed when the tab hides or the page goes, and makes no calls at all while it is quiet.
- **A joiner's camera swung in from last round's spot (correctness, plausible):** a round's start put the camera above our tank but left it looking at the old spot, so a friend joining part way through (no countdown) saw it swing round. It now looks at our tank from the start.
- **The engine droned (design, from round 66):** its steady triangle tone was louder on average than the whole music bed (about +8 dB at full speed, where a child spends most of a round), and it glided 85–130 Hz through the music's bass, beating against it like a siren. It is now a real purr: low rumbling noise with a soft wobble nine to twelve times a second, growing a little with speed, at a touch under the music's level (RMS about 0.007 against 0.0086).
- **Tidy (code quality):**
  - The nozzle's distance ahead (with the squirt's recoil) is one helper, `nozzleAhead`, used by the reach dot and the seen spot.
  - The seen spot's screen margins and its least distance are named, with what each clears.
  - The engine has its own section, its comment sits on it, and it fades with one time constant.
  - The balls' rest sends are a named counter (`restSends`).
  - The README says only your own tank purrs, and where a stick squirt lands.

### Fresh audit, round 68

- **The purr was still a hiss over the music (design, from round 67):** "a touch under the music" held only for raw level. As it sounds (A-weighted) through an iPad's speakers it was about 2 dB over the music, and one lowpass let a soft hiss through, which is most of what a small speaker plays, at full level whenever a child drives. A second lowpass now leaves only the low rumble (the share above 500 Hz falls from about −9 to −25 dB), and its level is lower (0.10 instead of 0.15): about 5 dB under the music as it sounds, on an iPad's speakers or a laptop's.
- **A joiner's camera still swept in (correctness, from round 67):** a friend joining part way through gets their tank a moment after the round starts, so the camera framed the arena's middle and then swept 40–50 m across to the tank. It now frames our tank the moment it arrives.
- **The engine kept making calls after stopping (correctness, minor):** a tank easing to a stop never quite reaches 0, so the engine's level stayed a hair above it and its calls ran every frame for minutes. Levels under 1% count as quiet.
- **Tidy (code quality):**
  - The sky camera's framing is two helpers (`skyTarget`, `skyPos`) used by the camera, the driver's seat, a round's start and our tank's arrival, so a round starts framed exactly as play goes on (it still swung a little before).
  - `nozzleAhead`'s and `seenSpot`'s comments sit on them, and the bottom margin reads like the others.
  - The rest sends' count is named (`REST_SENDS`).
  - The engine's two hush listeners share one function, like speech's, its wobble is described as it is, and its filters keep the default Q.

### Fresh audit, round 69

- **Tidy (code quality):** the round-start camera comment gives its real reason, `REST_SENDS` sits by the ball sends, one `upright()` decides both the camera's lens and its height, the engine keeps its filters in a list, and round 68's tidy list matches round 68.

### Fresh audit, round 70

- **Tidy (code quality):** one `snapSky` puts the camera on our tank for a round's start, its arrival and the driver's seat; a `vel` comment names `moveTank`; the rest sends' reason is given once; the README's ball sentence sits with what the host decides; the Pass 2 protocol note mentions the rest sends; and small wording and spacing.

### Open (Pass 2)

- **Splat match: a child who just drives ends last (design, older, for the owner):** with the default 2 🐢 robots, a child driving and squirting ahead paints 8–25% against the robots' 40–48%. That is the same before Pass 2, and the child's tank driven by the robots' own brain paints about as much as them, so it is what the robots do that a small child doesn't: sweep the nozzle, grab pickups, throw balloons and zoom. Making 🐢 robots leave pickups and balloons alone and squirt less is a change to the match the children know, so it is left for the owner.
- **A friend's push along a wall is weaker than the host's** (round 59): network lag; minor. Likewise a friend pushing a ball straight into a wall bonks about twice a second (found in the round 62 audit).
- **🤝 Paint together with no robots is slow to its first moment** (round 64): a child alone took about 8 minutes to finish the first quarter (12 for the whole floor), against about a minute with the default 2 robots. Robots paint about twice as fast and all on the part nearest done, while a child spreads paint over every part. A lower finishing mark with few painters, or a gentle pointer to the part nearest done, is for the owner, alongside the open "whether 85% feels right".
- **A close tank's name tag floats high in the driver's seat** (round 65, cosmetic, older): a tank a few metres ahead has its tag drawn well above it, near the fraction strip. Placing it just above the hull in the seat, or hiding it close up, would tidy it.
- Real play by the children on an iPad: how the heavier driving, the turret swing and the beach balls feel in small hands (headless browsers can't show it).
