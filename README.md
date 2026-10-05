# Splat Tanks

A multiplayer paint game for BitGames, made for ages 4 to 8 (three.js + Blender models). Toy tanks squirt
paint blobs and leave paint trails; whoever has the most floor in their colour when time runs out gets
the gold medal, and everyone gets a medal. Splashing another tank just turns it your colour for a moment:
there is no health, no knock-outs and no game over. Level up, pick upgrade cards, and grow
Squirter → Splasher → Roller → Titan. Up to 8 players on separate devices via the BitGames lobby, plus
robot friends. Works with keyboard + mouse, and twin-stick touch (iPad, phones).

The host decides where every splat lands and sends them in order (`pt` messages), so every device
paints the same 1 m grid (`public/js/paint.js`) and agrees on the score. The game id and Worker name
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
