# Splat Tanks

A multiplayer paint game for BitGames, made for ages 4 to 8 (three.js + Blender models). Toy tanks squirt
paint blobs and leave paint trails. Up to 8 players on separate devices via the BitGames lobby, plus
robot friends. Works with keyboard + mouse, and twin-stick touch (iPad, phones). Calm by design: soft
sounds, a gentle voice, no shaking, no hurry (see `docs/AUDIT_2026-10-10.md` and `docs/POLISH.md`).

Two ways to play, chosen on the menu:

- **🤝 Paint together** (the default). Chalk lines cut the floor into equal parts: halves, thirds or
  quarters (square quarters and strip quarters take turns). Everyone paints together with no clock;
  the fraction strip at the top shows each part filling. When a part is nearly painted its gaps fill in
  and the game names the fraction ("Two quarters painted! Two quarters make one half!"), and every
  tank grows a tier (Squirter → Splasher → Roller → Titan). The round ends with "Four quarters make
  one whole!" and a picture of the floor everyone painted. Robots help with the part nearest to done.
- **⏱️ Splat match.** The original round: 2, 3 or 5 minutes, each tank paints its own colour, levels up
  and picks upgrade cards. Splashing another tank just turns it your colour for a moment: there is no
  health, no knock-outs and no game over.

The host's 🏠 takes everyone back to the menu.

The host decides where every splat lands and sends them in order (`pt` messages), so every device
paints the same 1 m grid (`public/js/paint.js`) and agrees on the score. Painting together, the host also
says when a part is finished (`pd`); every device fills it the same way from that grid (`public/js/parts.js`). The game id and Worker name
stay `tank-clash` from the game's first version.

- `public/`: the game (static files deployed to Cloudflare). Entry point: `public/index.html`.
- `blender/`: model sources. Rebuild with `blender --background --python blender/tanks.py` (and `blender/arena.py`,
  `blender/environment.py` for the sky HDRI and ground textures). The realistic look comes from [Poly Haven](https://polyhaven.com)
  (CC0): `blender/polyhaven.py` downloads models, texture sets and the HDRI into `blender/.polyhaven/` (git-ignored), and
  the scripts decimate the models and shrink textures to 512 px before baking them into the GLBs.
- `dev/`: local test pages (not deployed). Serve the repo root (`python3 -m http.server 5181`) and open:
  - `dev/two.html`: two players in one page, relaying WebRTC like the BitGames lobby does.
  - `dev/ipad.html`: iPad landscape and portrait layouts.
- Local solo play: serve `public/` and open `index.html?solo` (add `&autostart&debug` for testing; exposes `window.__tank`).

## Shipping (needs the bitgames MCP)

1. Get a creator key from https://bitgames.store/make and add the server in local scope, which keeps the key out of the repo:
   `claude mcp add --transport http bitgames https://bitgames.store/mcp --header "Authorization: Bearer <key>"`
2. `save_game` returns the game id. If it isn't `tank-clash`, change the worker name in
   `cloudflare.config.ts` and `package.json` to `bitgames-<id>`.
3. `npm install && npm run deploy` (log in once with `npx cf auth login`).
4. `publish_game` with the version URL `https://<8 chars>-bitgames-<id>.<account>.workers.dev/`.
