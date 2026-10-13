# Splat Tanks

A calm multiplayer paint game for BitGames, for ages 4 to 8: three.js, plain JavaScript ES modules, no build
step, Blender models. [README.md](README.md) describes the two modes (🤝 Paint together, the default, which
teaches halves, thirds and quarters; ⏱️ Splat match) and how to ship. The game id and Worker name stay
`tank-clash` from the first version; it is listed at https://bitgames.store/game/tank-clash.

## Code index

- `public/`: the whole game, deployed as static files (`index.html` is the entry; menu, HUD and results are
  its markup). three.js and the BitGames multiplayer client load from `https://bitgames.store/vendor/` through
  the import map; `public/_headers` sets the CSP for direct previews.
- `public/js/main.js`: game state, the network protocol (`handle`, message types `t`), hosting and host
  hand-over (rules in the "Hosting" comment near the top), the menu, the frame loop and boot.
- `public/js/config.js`: all tuning (tiers, upgrades, pickups, colours, match lengths).
- `public/js/paint.js` (the 1 m paint grid that decides the score), `parts.js` (Paint together's equal parts and
  fraction words), `bots.js`, `tank.js`, `shells.js`, `balls.js`, `treads.js`, `world.js` (renderer, arena,
  collisions), `input.js`, `hud.js`, `fx.js`, `audio.js` (all synthesised), `speech.js` (copied from bitgames
  `examples/_studio/originals/speech.js`; change it there).
- `public/js/agent-tools.js`: WebMCP. Registers `get_game_state`, `set_up_game`, `start_game` and
  `back_to_menu` (consequential: ends the round for everyone) on `document.modelContext` (or the older
  `navigator.modelContext`), feature-detected. `main.js` (`agentState`, `agentSetUp`, `agentStart`,
  `agentToMenu`) backs them with the same `setOpt`, `hostStartMatch` and `menu` broadcast the buttons use, and
  registers them in `boot` once the menu answers. Keep tools to setting up and starting; driving stays with
  the child.
- `public/llms.txt`: static llmstxt.org summary (what the game is, the WebMCP tools, the store page). Update it
  when modes or tools change.
- `bitgames.mjs`: writes `public/bitgames.json` (SHA-256 of every file in `public/`, git-ignored) before each
  deploy; BitGames checks it, so the reviewed version never changes.
- `blender/`: model sources (`tanks.py`, `arena.py`, `environment.py`; `polyhaven.py` fetches CC0 assets into
  the git-ignored `blender/.polyhaven/`). Never hand-edit the GLBs in `public/models/`.
- `dev/`: local test pages, not deployed (`two.html` two players in one page, `ipad.html`, `cover.html`).
- `docs/`: the audit standard (`AUDIT_2026-10-10.md`) and the polish log (`POLISH.md`).

## Commands

```sh
cd public && python3 -m http.server 5181   # open index.html?solo (&autostart&debug exposes window.__tank)
python3 -m http.server 5181                # from the repo root, for dev/two.html and dev/ipad.html
blender --background --python blender/tanks.py   # and arena.py, environment.py
npm install && npm run deploy              # only when asked; see README "Shipping"
```

There is no build, lint or test script; `node --check public/js/<file>.js` catches syntax errors, and the
`dev/` pages and `?solo&debug` are the way to check behaviour.

## Conventions and gotchas

- Calm by design (see `docs/`): no shaking, red warnings, shouted words or knock-outs. New feedback should be
  soft and spoken lines go through `voice`.
- The host decides where every splat lands, finished parts and ball positions, and sends them in order, so every
  device paints the same grid. Never decide game state on a guest.
- The menu's buttons (`.seg[data-opt]` in `index.html`) are the only list of allowed option values; `setOpt`
  ignores anything else, and the agent tools read the same list.
- Each deploy is a new Cloudflare version that BitGames pins after review; publishing needs the bitgames MCP
  (README). Do not deploy or publish unless asked.
