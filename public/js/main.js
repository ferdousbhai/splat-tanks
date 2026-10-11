// Splat Tanks: the match, the network protocol and the frame loop.
//
// Two ways to play. Paint together (the default): chalk cuts the floor into halves, thirds or quarters,
// everyone paints every part with no clock, and finishing a part names the fraction and grows every
// tank. The splat match: a timed round where each tank paints its own colour, levels up and picks upgrades.
//
// Networking: each device drives its own tank and sends its position ~20x a second.
// The host (the device that started the room) runs the rules: where paint lands, splashes, XP,
// levels, pickups, paint buckets and the bots, and tells everyone what happened.
import * as THREE from 'three'
import { joinRoom } from 'https://bitgames.store/vendor/bitgames/multiplayer-1.js'
import { ARENA, TANK_RADIUS, MAX_LEVEL, MATCH, BASE, UPGRADES, PICKUPS, XP, COLORS, COLOR_NAMES, TIERS, emptyLoadout, xpToNext, randomName, safeName, safeColor, r2 } from './config.js'
import { renderer, scene, camera, sun, sunDir, loadModels, buildArena, pushOut, lineOfSight, barrels, PADS, SPAWNS } from './world.js'
import { Tank, yawOf, dirOf, angleDiff, view, RECOIL_KICK } from './tank.js'
import { spawnShell, removeShell, updateShells, clearShells, hideNearCamera, LAND_Y } from './shells.js'
import { updateFx, clearNearCamera, updateFloaters, toScreen, splash, muzzleFlash, floatText, sparks, confetti, dust, boostTrail, levelBurst, emojiTexture, still } from './fx.js'
import { paint, resetPaint, setSlotColor, encodePaint, decodePaint, updatePaint, cellsOf, byPaint, painted, paintVersion, CELLS } from './paint.js'
import { botControls, botPickUpgrade, newBrain } from './bots.js'
import { input, bindMouse, bindTouch, onKey, mouseSurfaces, mouseAims, drivingAlone } from './input.js'
import { unlockAudio, sound, voice, toggleMusic, musicIntensity } from './audio.js'
import { layout, setupParts, clearParts, partProgress, finishPart, partsDone, partAt, doneWords, doneTitle, halfWords, introWords, goalWords, fractionWords, cap, DONE, turnLabels } from './parts.js'
import { updateTreads, clearTreads } from './treads.js'
import { balls, resetBalls, stepBalls, squirtBall, burstBalls, setOwner, blockTank, ballState, ballsMoving, takeBallState, renderBalls, fadeNearCamera } from './balls.js'
import * as hud from './hud.js'
import { $ } from './hud.js'

const show = (el, on = true) => (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on)
const now = () => performance.now()
const r1 = (v) => Math.round(v * 10) / 10
const r5 = (v) => Math.round(v * 1e5) / 1e5

const game = {
  phase: 'loading',
  room: null,
  selfId: 'solo',
  hostId: 'solo',
  tanks: new Map(),
  me: null,
  brains: new Map(),
  humans: new Map(), // id -> { name, color } from hello messages
  // mode: 'together' or 'match'. parts: how many equal parts painting together cuts the floor into.
  opts: { mode: 'together', parts: 4, bots: 2, difficulty: 'easy', length: 1 },
  match: null, // { seed, mode, endsAt, startAt, over, countdown }
  round: 0, // host: rounds started, so square and strip quarters take turns
  progress: [], // painting together: each part's painted share, measured when the paint changes
  progressVersion: -1, // the paintVersion it was measured at
  endTimer: 0,
  powerTimer: 0, // painting together: the new powers' banner, after the fraction line
  powers: [], // the tiers grown into that haven't been announced yet
  cardsSaid: false, // the splat match's "Pick a new power" was said for the cards now up
  arriveTimer: 0, // a new screen's buttons wait a moment (setScreen)
  pads: [],
  offer: null,
  shotCount: 0,
  lastNet: 0,
  lastStats: 0,
  statsDirty: false,
  paintQueue: [], // host: splats not yet sent
  lastPaintSend: 0,
  lastTrail: 0,
  lastBalls: 0,
  ballsRolled: false, // host: some ball was rolling at the last network tick
  myName: randomName(),
  myColor: COLORS[Math.floor(Math.random() * COLORS.length)],
  arenaSeed: 0,
  joinedAt: 0, // when we joined the room
}
let homeArmedUntil = 0 // in play, 🏠 needs a second tap before this time
const isHost = () => game.hostId === game.selfId
const together = () => game.match?.mode === 'together'
const tankList = () => [...game.tanks.values()]
/** A tank's colour by id, or null if it has gone (for a ball's last toucher). */
const tankColor = (id) => game.tanks.get(id)?.color ?? null

// --- Networking --------------------------------------------------------------------------

// The ?solo room's send() does nothing, so these need no solo check.
const send = (msg, to) => game.room?.send(msg, to ? { to } : {})
const sendFast = (msg) => game.room?.send(msg, { fast: true })
/** Host: tell everyone, and apply it here too. */
function broadcast(msg) {
  send(msg)
  handle(msg, game.selfId)
}

function hello(to) {
  send({ t: 'hello', name: game.myName, color: game.myColor, host: isHost() }, to)
}

function setupRoom(room) {
  game.room = room
  game.joinedAt = now()
  game.selfId = room.selfId
  game.hostId = room.isHost ? room.selfId : null
  room.on('join', (id) => hello(id))
  room.on('leave', (id) => {
    game.humans.delete(id)
    const t = game.tanks.get(id)
    if (t) {
      hud.feed(`${hud.tag(t)} went home 👋`)
      t.alive = false // a robot aiming at them lets go at once
      t.dispose()
      game.tanks.delete(id)
    }
    if (id === game.hostId) migrateHost()
    renderRoom()
  })
  room.on('message', (msg, from) => handle(msg, from))
  hello()
}

/** If the host leaves, the remaining player with the smallest id takes over, bots included. */
function migrateHost() {
  const ids = [game.selfId, ...(game.room?.peers ?? [])].sort()
  game.hostId = ids[0]
  if (!isHost()) return
  hud.toast('👑 The host left. You are running the game now!')
  voice.say("The host left. You're the host now.")
  for (const t of game.tanks.values()) {
    if (t.bot && !t.local) {
      t.local = true // the robots drive from here now (battleStep gives them brains)
      // Followed until now, so their tracks pick up the speed they were seen moving at, without a stall.
      t.trackVel.x = t.vel.x
      t.trackVel.z = t.vel.z
    }
    // A player who joined just before the old host left still needs their tank placed.
    if (!t.alive && !t.respawnAt) t.respawnAt = now() + 800
  }
  hello()
  showHostButtons()
}

/** Only the host starts, restarts and leaves rounds; a new host gets those buttons wherever the room is. */
function showHostButtons() {
  const host = isHost()
  show('home', host)
  show('end-host', host)
  show('end-wait', !host)
  showHostOptions()
}

/** The menu's host-only choices, and the rows for the chosen mode. */
function showHostOptions() {
  const host = isHost()
  for (const row of document.querySelectorAll('[data-for]')) show(row, row.dataset.for === game.opts.mode)
  show('host-options', host)
  show('go', host)
  show('waiting-host', !host)
  renderLobby()
}

/** Painting together, every tank grows one tier per finished part. */
const grownLevel = (done) => TIERS[Math.min(TIERS.length, 1 + done) - 1].level

/** What happens inside a round; a late one arriving after the host's 🏠 is dropped. */
const IN_ROUND = new Set(['pb', 'bl', 'f', 'lo', 'pt', 'hit', 'sp', 'st', 'pu', 'pk', 'bx', 'bu', 'pd'])

function handle(msg, from) {
  if (!msg || typeof msg !== 'object') return
  if (IN_ROUND.has(msg.t) && game.phase !== 'battle' && game.phase !== 'ending') return
  const t = game.tanks.get(msg.i)
  switch (msg.t) {
    case 'hello': {
      const h = { name: safeName(msg.name), color: safeColor(msg.color) }
      // A friend arriving in the menu is said; one joining a round is shown in the feed when their tank arrives.
      // (Not the players already in the room when we arrive: their hellos all come in the first moments.)
      if (!game.humans.has(from) && game.phase === 'menu' && now() - game.joinedAt > 3000) voice.say(`${h.name} is here!`)
      game.humans.set(from, h)
      if (msg.host) game.hostId = from
      const existing = game.tanks.get(from)
      if (existing && existing.name !== h.name) {
        existing.name = h.name
        existing.refreshLabel()
      }
      // Someone joined mid-game: the host gives them a tank (and a slot for their paint).
      if (game.phase === 'battle' && !existing && isHost()) {
        flushPaint()
        // A late painter starts as big as everyone else has grown.
        // With every colour on a tank, share a robot's colour, never another child's.
        const kids = new Set(tankList().filter((t) => !t.bot).map((t) => t.color))
        let c = freeColor(h.color, new Set(tankList().map((t) => t.color)), new Set([...tankList().map((t) => t.color), ...[...game.humans.values()].map((x) => x.color)]))
        if (kids.has(c)) c = COLORS.find((x) => !kids.has(x)) ?? c
        broadcast({ t: 'add', e: { i: from, n: h.name, c, s: nextSlot(), ...(together() && { lv: grownLevel(partsDone()) }) } })
        send(snapshot(), from)
        game.tanks.get(from).respawnAt = now() + 800
      }
      renderRoom()
      break
    }
    case 'add':
      if (game.phase !== 'battle' || game.tanks.has(msg.e.i)) break
      // In the colour the host gave them, mirroring "went home".
      if (!msg.e.b && msg.e.i !== game.selfId) hud.feed(`${hud.tag(addTank(msg.e))} came to paint 👋`)
      else addTank(msg.e)
      break
    case 'start':
      startBattle(msg)
      break
    case 'pb':
      for (const [i, ...pose] of msg.a) setPose(game.tanks.get(i), ...pose)
      break
    case 'bl':
      if (!isHost()) takeBallState(msg.a, tankColor)
      break
    case 'f': {
      const owner = game.tanks.get(msg.o)
      if (!owner || owner.local) return
      for (const [sid, x, z, dx, dz] of msg.s) {
        spawnShell({ sid, owner: msg.o, x, z, dx, dz, speed: msg.v, range: msg.r, splat: msg.d, bounces: msg.b, mega: !!msg.m, color: owner.color, bot: owner.bot })
        muzzleFlash(x, 1.1, z, dx, dz, owner.color, !!msg.m)
      }
      owner.recoil = 1
      sound.shoot(hearing(owner.pos.x, owner.pos.z).vol, !!msg.m)
      break
    }
    case 'lo': {
      if (!t || t === game.me) return
      t.upgrades = { ...emptyLoadout(), ...msg.u }
      t.recompute()
      game.statsDirty = true
      break
    }
    case 'pt':
      // Splats from the host, in order: [x, z, radius, slot, ...]
      if (isHost()) return
      for (let k = 0; k < msg.a.length; k += 4) paint(msg.a[k], msg.a[k + 1], msg.a[k + 2], msg.a[k + 3])
      break
    case 'hit':
      onHit(msg)
      break
    case 'sp':
      onSpawn(msg)
      break
    case 'st':
      if (isHost()) return
      for (const [i, lv, xp, al] of msg.a) {
        const s = game.tanks.get(i)
        if (!s) continue
        s.xp = xp
        if (!al && s.alive) s.alive = false
        if (lv !== s.level) setLevel(s, lv)
      }
      break
    case 'pu':
      setPad(msg.i, msg.k)
      break
    case 'pk':
      onPick(msg)
      break
    case 'bx':
      onBucket(msg)
      break
    case 'bu':
      setBarrel(barrels[msg.i], true)
      break
    case 'end':
      onEnd(msg)
      break
    case 'pd':
      onPartDone(msg)
      break
    case 'menu':
      if (from === game.hostId) toMenu()
      break
  }
}

/** A tank's position on the wire: [id, x, z, heading, turret, vx, vz, boosting]. */
const poseOf = (t) => [t.id, r2(t.pos.x), r2(t.pos.z), r2(t.heading), r2(t.turretYaw), r2(t.vel.x), r2(t.vel.z), t.boosting ? 1 : 0]

/** The latest position of a tank another device drives; follow() glides toward it. */
function setPose(t, x, z, h, ty, vx, vz, boosting) {
  if (!t || t.local) return
  t.target = { x, z, h, ty, vx, vz, t: now() }
  if (boosting) t.boostUntil = now() + 120
}

/** A burst bucket comes back after 25 s: every device notes when, so a new host can bring it back too. */
const BUCKET_BACK_MS = 25000
function setBarrel(b, alive) {
  if (!b) return
  b.alive = alive
  b.mesh.visible = alive
  b.backAt = alive ? 0 : now() + BUCKET_BACK_MS
}

// --- Match setup -------------------------------------------------------------------------

function nextSlot() {
  return Math.max(0, ...tankList().map((t) => t.slot)) + 1
}

function addTank(e) {
  if (game.tanks.has(e.i)) return game.tanks.get(e.i)
  const t = new Tank({ id: e.i, name: safeName(e.n), color: safeColor(e.c), slot: e.s, bot: !!e.b, local: e.i === game.selfId || (!!e.b && isHost()) })
  setSlotColor(t.slot, t.color)
  game.tanks.set(e.i, t)
  if (e.lv) {
    t.level = toLevel(e.lv)
    t.upgrades = { ...emptyLoadout(), ...e.u }
    t.recompute()
  }
  t.xp = e.xp ?? 0
  t.alive = !!e.al
  if (e.x !== undefined) t.place(e.x, e.z, e.h ?? 0)
  if (t.id === game.selfId) game.me = t
  return t
}

function snapshot() {
  const n = now()
  const m = game.match
  return {
    t: 'start',
    seed: m.seed,
    mode: m.mode,
    parts: layout.n,
    grid: layout.grid,
    done: layout.done.map((d) => (d ? 1 : 0)),
    rem: m.mode === 'match' ? Math.max(0, m.endsAt - n) : 0,
    cd: Math.max(0, m.startAt - n),
    fresh: false,
    opts: game.opts,
    roster: tankList().map((t) => ({ i: t.id, n: t.name, c: t.color, s: t.slot, b: t.bot ? 1 : 0, lv: t.level, xp: Math.round(t.xp), u: t.upgrades, al: t.alive ? 1 : 0, x: r2(t.pos.x), z: r2(t.pos.z), h: r2(t.heading) })),
    pads: game.pads.map((p) => p.kind),
    // 0 for a bucket that's up, else the milliseconds until it comes back, so a joiner who later hosts keeps the time.
    barrels: barrels.map((b) => (b.alive ? 0 : Math.max(1, b.backAt - n))),
    paint: encodePaint(),
    balls: ballState(),
  }
}

/** Host: begin a new match with everyone in the room plus bots. */
function hostStartMatch() {
  const seed = Math.floor(Math.random() * 1e9)
  const ids = [game.selfId, ...(game.room?.peers ?? [])]
  const used = new Set()
  const who = ids.map((id) => (id === game.selfId ? { name: game.myName, color: game.myColor } : game.humans.get(id) ?? { name: randomName(), color: COLORS[0] }))
  const wanted = new Set(who.map((h) => h.color))
  const roster = ids.map((id, k) => {
    const h = who[k]
    const c = freeColor(h.color, used, wanted)
    used.add(c)
    return { i: id, n: h.name, c, s: k + 1 }
  })
  const free = COLORS.filter((c) => !used.has(c))
  // Every tank's name is its own, so "which one is Twinkly Hippo?" has one answer.
  const names = new Set(roster.map((e) => e.n))
  const botName = () => {
    let n
    do n = randomName()
    while (names.has(n))
    names.add(n)
    return n
  }
  for (let i = 0; i < game.opts.bots; i++) roster.push({ i: `bot${i}`, n: botName(), c: free[i % free.length] ?? COLORS[i % COLORS.length], s: roster.length + 1, b: 1 })
  const spots = [...SPAWNS].sort(() => Math.random() - 0.5)
  roster.forEach((e, k) => {
    const [x, z] = spots[k % spots.length]
    e.x = x + (k >= spots.length ? 3 : 0)
    e.z = z
    e.h = yawOf(-x, -z)
    e.al = 1
  })
  const mode = game.opts.mode
  // Painting together starts at once with one spoken line; the match counts in.
  const cd = mode === 'match' ? 3000 : 0
  game.paintQueue.length = 0
  broadcast({
    t: 'start',
    seed,
    mode,
    parts: game.opts.parts,
    grid: game.round++ % 2 === 0,
    done: [],
    rem: mode === 'match' ? MATCH.minutes[game.opts.length] * 60000 + cd : 0,
    cd,
    fresh: true,
    opts: game.opts,
    roster,
    pads: PADS.map((_, i) => (mode === 'match' ? (i < 4 ? 'star' : i < 6 ? 'rapid' : null) : i < 2 ? 'roller' : i < 4 ? 'rapid' : null)),
    barrels: [],
  })
}

/**
 * Each child keeps their own colour. One already taken is swapped for a colour nobody wanted (`wanted`), so a
 * later child whose colour was free keeps theirs; only if every colour is wanted does it take any free one.
 */
const freeColor = (want, used, wanted) =>
  used.has(want) ? COLORS.find((c) => !used.has(c) && !wanted.has(c)) ?? COLORS.find((c) => !used.has(c)) ?? want : want

/**
 * Sets one game choice from a menu value. The menu's buttons are the only list of allowed values: a value
 * with no button (say, from another device) is ignored. Returns the button chosen.
 */
function setOpt(key, value) {
  const seg = document.querySelector(`.seg[data-opt="${key}"]`)
  const b = [...(seg?.querySelectorAll('button') ?? [])].find((x) => x.dataset.v === String(value))
  if (!b) return null
  game.opts[key] = ['difficulty', 'mode'].includes(key) ? b.dataset.v : Number(b.dataset.v)
  for (const x of seg.querySelectorAll('button')) hud.press(x, x === b)
  return b
}

/** The room's game choices travel with every start, so whoever hosts next keeps the same game. */
function takeOpts(o) {
  if (o && typeof o === 'object') for (const key of Object.keys(game.opts)) setOpt(key, o[key])
}

function startBattle(msg) {
  leaveRound()
  input.mouseUsed = seat.keys = false
  takeOpts(msg.opts)
  const mode = msg.mode === 'match' ? 'match' : 'together'
  view.levels = mode === 'match'
  for (const t of [...game.tanks.values(), ...demoTanks.splice(0)]) t.dispose()
  game.tanks.clear()
  game.brains.clear()
  game.me = null
  clearShells()
  clearTreads()
  resetBalls()
  // The new match first, so the pads below take its respawn times.
  const n = now()
  game.match = { seed: msg.seed, mode, endsAt: mode === 'match' ? n + msg.rem : Infinity, startAt: n + msg.cd, over: false, countdown: mode === 'match' ? Math.ceil(msg.cd / 1000) + 1 : 0 }
  if (msg.seed !== game.arenaSeed) {
    buildArena(msg.seed)
    game.arenaSeed = msg.seed
    makePads()
  }
  if (mode === 'together') setupParts([2, 3, 4].includes(msg.parts) ? msg.parts : 4, !!msg.grid, msg.done ?? [])
  else clearParts()
  game.progress = []
  game.progressVersion = -1
  hud.resetMinimap()
  barrels.forEach((b, i) => {
    const back = msg.barrels[i] ?? 0
    setBarrel(b, !back)
    if (back) b.backAt = now() + back
  })
  game.pads.forEach((p, i) => setPad(i, msg.pads[i] ?? null))
  if (msg.paint) decodePaint(msg.paint)
  else resetPaint()
  for (const e of msg.roster) addTank(e)
  if (!game.me) addTank({ i: game.selfId, n: game.myName, c: game.myColor, s: nextSlot() })
  // Joining part way through: the balls are where the host has rolled them.
  if (msg.balls) takeBallState(msg.balls, tankColor, true)
  setScreen('battle')
  showHostButtons()
  document.body.classList.toggle('together', mode === 'together')
  if (game.me) {
    camPos.set(game.me.pos.x, 30, game.me.pos.z + 20)
  }
  // Everyone hears how the round works, including a player joining part way through.
  if (mode === 'together') {
    const n = layout.n
    const k = partsDone()
    $('goal').textContent = `🎨 ${goalWords(n)}`
    hud.banner('🤝 Paint together!', goalWords(n), 2600)
    voice.sayNow(introWords(n))
    if (k) voice.say(`${cap(fractionWords(k, n))} ${k === 1 ? 'is' : 'are'} painted already.`)
    if (game.me?.tier > 1) voice.say(TIERS[game.me.tier - 1].say)
  } else {
    // The countdown (or, for a joiner, its last step on the next frame) says the opening line.
    $('goal').textContent = '🎨 Paint the floor your colour!'
  }
  // A friend already had this colour, so the host gave us another: say which, as a child knows their tank by
  // it, and tell the room so friends' menus show the colour we really have.
  if (game.me && game.me.color !== game.myColor) {
    game.myColor = game.me.color
    voice.say(`You're ${COLOR_NAMES[COLORS.indexOf(game.myColor)]}!`)
    hello()
  }
  // The driver's seat is remembered between rounds: say so, after the round's own opening line.
  if (msg.fresh && seat.on) voice.say("You're in the driver's seat.")
}

/** Every way out of a round goes through here: nothing from it keeps talking, waiting or showing. */
function leaveRound() {
  clearTimeout(game.endTimer)
  clearTimeout(game.powerTimer)
  game.powers.length = 0
  homeArmedUntil = 0
  voice.hush()
  hud.clearBanners()
  game.offer = null
  hud.showUpgrades(null)
  input.firing = false
}

/** The host's 🏠: everyone goes back to the menu, where the host can change the game. */
function toMenu() {
  if (game.phase === 'menu' || game.phase === 'loading') return
  leaveRound()
  if (game.match) game.match.over = true
  clearShells()
  if (document.pointerLockElement) document.exitPointerLock()
  setScreen('menu')
  // Tanks stay parked in the menu's arena: draw them once more from the sky, so a round left from the
  // driver's seat doesn't leave seat-sized name labels (or our own hidden one) behind.
  view.seat = false
  view.seatTank = null
  for (const t of game.tanks.values()) {
    if (t.firstPerson) t.setFirstPerson(false)
    t.render(0, false)
  }
  renderMenu()
  if (!isHost()) voice.say('Waiting for the host to start.')
}

/** Which screen shows: the menu, a round ('battle') or the results ('end'). */
function setScreen(phase) {
  game.phase = phase
  // Tanks stop being drawn afresh behind the results: their name labels would sit over its lines.
  if (phase === 'end') for (const t of game.tanks.values()) t.label.visible = t.crown.visible = false
  // A new screen's buttons wait before they answer (style.css body.arriving): the results long enough for the
  // whole-floor line to be heard, the menu a moment.
  // Inert as well, so keys (Tab, Enter) can't press them either.
  const held = [$('go'), $('end-host')]
  document.body.classList.add('arriving')
  for (const el of held) el.inert = true
  clearTimeout(game.arriveTimer)
  game.arriveTimer = setTimeout(() => {
    document.body.classList.remove('arriving')
    for (const el of held) el.inert = false
  }, phase === 'end' ? 2500 : 1500)
  show('menu', phase === 'menu')
  show('hud', phase === 'battle')
  show('end', phase === 'end')
  document.body.classList.toggle('playing', phase === 'battle')
  if (phase !== 'battle') document.body.classList.remove('together', 'seat')
  musicIntensity(phase === 'battle')
}

// --- Pickups -----------------------------------------------------------------------------

const glowGeo = new THREE.SphereGeometry(0.9, 16, 12)

function makePads() {
  for (const p of game.pads) {
    scene.remove(p.group)
    p.sprite.material.dispose()
    p.glow.material.dispose()
  }
  game.pads = PADS.map(([x, z], i) => {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
    sprite.scale.setScalar(1.8)
    sprite.position.y = 1.6
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }))
    glow.position.y = 1.6
    group.add(sprite, glow)
    group.visible = false
    scene.add(group)
    return { i, x, z, kind: null, respawnAt: now() + 6000 + Math.random() * 6000, group, sprite, glow }
  })
}

function setPad(i, kind) {
  const p = game.pads[i]
  if (!p) return
  p.kind = kind
  p.group.visible = !!kind
  if (kind) {
    p.sprite.material.map = emojiTexture(PICKUPS[kind].icon, PICKUPS[kind].color)
    p.sprite.material.needsUpdate = true
    p.glow.material.color.set(PICKUPS[kind].color)
  } else p.respawnAt = now() + (together() ? 16000 : 9000) + Math.random() * (together() ? 10000 : 7000)
}

/** Painting together has no XP, so no stars: just things that help paint. */
function randomPickup() {
  const r = Math.random()
  // No balloons: they come with growing into a Splasher.
  if (together()) return r < 0.5 ? 'roller' : 'rapid'
  return r < 0.35 ? 'star' : r < 0.6 ? 'rapid' : r < 0.85 ? 'roller' : 'mega'
}

function onPick(msg) {
  const t = game.tanks.get(msg.by)
  setPad(msg.i, null)
  if (!t) return
  const n = now()
  const def = PICKUPS[msg.k]
  if (msg.k === 'rapid') t.rapidUntil = n + def.seconds * 1000
  if (msg.k === 'roller') t.rollerUntil = n + def.seconds * 1000
  if (msg.k === 'mega') t.megaReadyAt = 0
  sparks(t.pos.x, t.pos.z, def.color, 10)
  if (t === game.me) {
    sound.pickup()
    // One floating word: a balloon picked up before level 4 says when balloons come.
    floatText(t.pos.x, t.pos.z, msg.k === 'mega' && !t.stats.mega ? '🎈 at Lv 4!' : `${def.icon} ${def.text}`, 'xp')
  }
}

// --- Host rules: paint, splashes, XP -----------------------------------------------------

/** Host: paint a splat here and on every device, and give its painter XP for new floor. */
function hostPaint(x, z, r, t) {
  if (!t || game.match?.over) return
  // Paint exactly what is sent, so every device's grid stays identical.
  x = r1(x)
  z = r1(z)
  r = r1(r)
  const gained = paint(x, z, r, t.slot)
  game.paintQueue.push(x, z, r, t.slot)
  if (gained) addXp(t, gained * XP.perCell)
}

function flushPaint() {
  game.lastPaintSend = now()
  if (!game.paintQueue.length) return
  send({ t: 'pt', a: game.paintQueue })
  game.paintQueue = []
}

/** Host: a blob (or balloon) splashed a tank. It turns that colour for a moment; no harm done. */
function splashTank(target, by, sid) {
  if (!target.alive || game.match?.over) return
  if (by && by !== target) addXp(by, XP.splat)
  hostPaint(target.pos.x, target.pos.z, 1.8, by)
  broadcast({ t: 'hit', i: target.id, by: by?.id, s: sid })
}

/** Host: a big splash (balloon or bucket) paints the floor and every tank close by. */
function bigSplash(x, z, radius, by) {
  hostPaint(x, z, radius, by)
  for (const t of game.tanks.values()) {
    if (!t.alive || t === by) continue
    if (Math.hypot(t.pos.x - x, t.pos.z - z) < radius + TANK_RADIUS) splashTank(t, by, null)
  }
  // A robot's burst rolls a ball but never takes it: the balls are the children's.
  for (const b of burstBalls(x, z, radius)) if (by && !by.bot) setOwner(b, by.id, by.color)
  const match = game.match
  barrels.forEach((b, i) => {
    if (b.alive && Math.hypot(b.x - x, b.z - z) < radius) setTimeout(() => hostBucket(i, by, match), 150)
  })
}

/** Host: a blob knocks a ball along and turns it the squirter's colour. */
function hostBall(b, s) {
  if (!isHost()) return
  const by = game.tanks.get(s.owner)
  squirtBall(b, s.dx, s.dz)
  if (by) setOwner(b, by.id, by.color)
}

/** match: the round this bucket burst in; a timer from an earlier round does nothing. */
function hostBucket(i, by, match = game.match) {
  const b = barrels[i]
  if (!b?.alive || !isHost() || !by || game.match !== match || match.over) return
  // Burst it here first: a burst bucket can never set off its own chain again.
  setBarrel(b, false)
  broadcast({ t: 'bx', i, by: by.id })
  addXp(by, XP.bucket)
  bigSplash(b.x, b.z, 5.5, by)
}

/** XP and levels belong to the splat match; painting together grows tanks by finished parts instead. */
function addXp(t, amount) {
  if (t.level >= MAX_LEVEL || together()) return
  t.xp += amount
  let lv = t.level
  while (lv < MAX_LEVEL && t.xp >= xpToNext(lv)) {
    t.xp -= xpToNext(lv)
    lv++
  }
  if (lv >= MAX_LEVEL) t.xp = 0
  if (lv !== t.level) setLevel(t, lv)
  game.statsDirty = true
}

function sendStats() {
  game.lastStats = now()
  game.statsDirty = false
  send({ t: 'st', a: tankList().map((t) => [t.id, t.level, Math.round(t.xp), t.alive ? 1 : 0]) })
}

function endMatch() {
  if (game.match.over) return
  flushPaint()
  sendStats()
  // Painting together lists everyone in the order they joined, not by how much they painted.
  const sorted = together() ? tankList() : tankList().sort(byPaint)
  broadcast({ t: 'end', a: sorted.map((t) => [t.id, t.level]) })
}

// --- Events everyone shows --------------------------------------------------------------

/**
 * How loud a sound at (x, z) is, and whether it is the player's own (owner: the tank it came from). The
 * player's own paint is heard across the floor; everyone else's is quiet and only from close by, so busy
 * robots stay in the background. { vol, mine }; how sounds are spaced out is decided in audio.js.
 */
function hearing(x, z, owner) {
  const c = game.me?.alive ? game.me.pos : { x: camTarget.x, z: camTarget.z }
  const d = Math.hypot(x - c.x, z - c.z)
  if (owner !== undefined && owner === game.me?.id) return { vol: Math.max(0.3, 1 - d / 50), mine: true }
  return { vol: Math.max(0, 1 - d / 24) * 0.5, mine: false }
}

function onHit(msg) {
  const t = game.tanks.get(msg.i)
  const by = game.tanks.get(msg.by)
  if (msg.s) removeShell(msg.s)
  if (!t) return
  if (by) {
    t.paintColor.set(by.color)
    t.paintT = 1
  }
  // Painting together, a stray blob (a robot's or a friend's) just tints you: no flash, splash word or boing,
  // so squirting each other is never the fun part. Your own blob bouncing back off a wall is the same in any
  // game. The squirter hears the same soft splat as on the floor.
  if (together() || t === by) {
    const ear = hearing(t.pos.x, t.pos.z, by?.id)
    if (ear.mine) sound.splat(ear.vol * 0.6, true)
    return
  }
  t.flash = 1
  sparks(t.pos.x, t.pos.z, by?.color ?? '#ffffff', 5)
  const ear = hearing(t.pos.x, t.pos.z, by?.id)
  const mine = ear.mine || t === game.me
  sound.splat(mine ? 1 : ear.vol, mine)
  if (t === game.me) {
    floatText(t.pos.x, t.pos.z, '💦', 'me')
    sound.boing()
  }
}

function onSpawn(msg) {
  const t = game.tanks.get(msg.i)
  if (!t) return
  t.place(msg.x, msg.z, msg.h)
  t.alive = true
  // From the driver's seat the camera drops into this tank in the same frame, inside the rings: no burst then.
  if (!(t === game.me && seat.on)) levelBurst(msg.x, msg.z, t.color)
}

function onBucket(msg) {
  const b = barrels[msg.i]
  const by = game.tanks.get(msg.by)
  if (!b) return
  const color = by?.color ?? '#ff6ec7'
  setBarrel(b, false)
  splash(b.x, b.z, 3, color)
  sound.splosh(by === game.me ? 1 : hearing(b.x, b.z).vol)
  if (by === game.me) hud.subBanner('🪣 Paint bucket!', 1400, true)
}

/** Levels arrive from the network: keep them whole and in range, since they index the tier and XP tables. */
const toLevel = (lv) => Math.min(MAX_LEVEL, Math.max(1, Math.floor(lv) || 1))

/**
 * A tank's level changed (anywhere). Handles growing, the player's upgrade cards and bots' picks.
 * Painting together, onPartDone names the fraction and the perk, so here the tank only grows.
 */
function setLevel(t, lv) {
  lv = toLevel(lv)
  const oldTier = t.tier
  const up = lv > t.level
  t.level = lv
  t.recompute()
  if (!up) return
  const evolved = t.tier !== oldTier
  const quiet = together()
  if (evolved) {
    levelBurst(t.pos.x, t.pos.z, t.color)
    if (!quiet) confetti(t.pos.x, t.pos.z, [t.color, '#ffffff', '#ffd60a'])
  }
  if (t === game.me) {
    if (evolved) {
      sound.evolve()
      if (!quiet) {
        const tier = TIERS[t.tier - 1]
        hud.banner(`✨ ${tier.name}!`, tier.perk, 2600)
        voice.say(`You are a ${tier.name}!`)
        voice.say(tier.say)
      }
    } else {
      sound.levelUp()
      levelBurst(t.pos.x, t.pos.z, '#ffd60a')
    }
  } else if (evolved && t.tier === 4 && !quiet) {
    hud.subBanner(`🌈 ${t.name} grew into a Titan!`, 2500)
  }
  if (t.bot && isHost() && !together()) {
    while (pendingPoints(t) > 0) {
      const opts = offerFor(t)
      if (!opts.length) break
      t.upgrades[botPickUpgrade(opts, game.opts.difficulty)]++
    }
    t.recompute()
    send({ t: 'lo', i: t.id, u: t.upgrades })
  }
}

function pendingPoints(t) {
  if (together()) return 0
  const used = Object.values(t.upgrades).reduce((a, b) => a + b, 0)
  return t.level - 1 - used
}
function offerFor(t) {
  const keys = Object.keys(UPGRADES).filter((k) => t.upgrades[k] < UPGRADES[k].max)
  return keys.sort(() => Math.random() - 0.5).slice(0, 3)
}

function pickUpgrade(key) {
  const me = game.me
  if (!me || !game.offer?.includes(key) || pendingPoints(me) <= 0) return
  me.upgrades[key]++
  me.recompute()
  send({ t: 'lo', i: me.id, u: me.upgrades })
  game.statsDirty = true
  sound.click()
  floatText(me.pos.x, me.pos.z, `${UPGRADES[key].icon} ${UPGRADES[key].name}`, 'xp')
  voice.say(`${UPGRADES[key].name}. ${UPGRADES[key].text}.`)
  game.offer = null
}

function onEnd(msg) {
  if (!game.match) return
  game.match.over = true
  for (const [i, lv] of msg.a) {
    const t = game.tanks.get(i)
    if (t && t.level !== lv) setLevel(t, lv)
  }
  const sorted = msg.a.map(([i]) => game.tanks.get(i)).filter(Boolean)
  // A power that can no longer be used isn't announced over the ending.
  clearTimeout(game.powerTimer)
  game.powers.length = 0
  sound.cheer()
  if (together()) hud.banner('🎉 The whole floor!', '', 2200)
  else {
    hud.banner("Time's up!", '', 2200)
    voice.say("Time's up! Great painting!")
  }
  clearTimeout(game.endTimer)
  game.endTimer = setTimeout(() => {
    setScreen('end')
    hud.results(sorted, game.me, Math.round((painted() / CELLS) * 100), together())
    if (!isHost()) voice.say('Waiting for the host.')
  }, 2400)
  game.phase = 'ending'
}

/** Painting together: the host says a part is finished. Its gaps fill in, the fraction is named and every tank grows. */
function onPartDone(msg) {
  if (!together() || game.match.over || !Number.isInteger(msg.p) || msg.p < 0 || msg.p >= layout.n || layout.done[msg.p]) return
  finishPart(msg.p)
  const k = partsDone()
  const n = layout.n
  // The last part ends the round: nobody grows then, so the whole floor is the moment.
  let tier = null
  if (k < n) {
    const was = game.me?.tier
    for (const t of game.tanks.values()) if (t.level < grownLevel(k)) setLevel(t, grownLevel(k))
    if (game.me && game.me.tier !== was) tier = TIERS[game.me.tier - 1]
  }
  // Two beats, each shown while it is said: the fraction (and the half fact), then the new power once the
  // fraction line has had time to be said (about 75 ms a letter), whether or not speech finishes or is cut short.
  // Two parts can finish close together: their powers wait in game.powers and are announced together.
  const words = doneWords(k, n)
  hud.banner(doneTitle(k, n), halfWords(k, n), 3000)
  voice.say(words)
  if (tier) game.powers.push(tier)
  clearTimeout(game.powerTimer)
  if (game.powers.length) {
    game.powerTimer = setTimeout(() => {
      const grown = game.powers.splice(0)
      hud.banner(`✨ ${grown.at(-1).name}!`, grown.map((t) => t.perk).join(' '), 3000)
      for (const t of grown) voice.say(t.say)
    }, Math.max(3000, words.length * 75))
  }
}

// --- Squirting ---------------------------------------------------------------------------

/** aim: where the paint should land ({ x, z }, the mouse's point), else as far as it can go. */
function fire(t, mega = false, aim = null) {
  const s = t.stats
  const muzzles = t.muzzles()
  const out = []
  const spread = mega ? [0] : Array.from({ length: s.shells }, (_, i) => (i - (s.shells - 1) / 2) * 0.16)
  const from = mega ? [muzzles[0]] : muzzles
  for (const m of from) {
    // A big tank's nozzle can reach into (or past) a wall it's pressed against: squirt from its middle then.
    if (!lineOfSight(t.pos.x, t.pos.z, m.x, m.z)) m.set(t.pos.x, m.y, t.pos.z)
    for (const a of spread) {
      const { x: dx, z: dz } = dirOf(t.turretYaw + a)
      out.push([`${t.id}.${game.shotCount++}`, r2(m.x), r2(m.z), r5(dx), r5(dz)])
      muzzleFlash(m.x, m.y, m.z, dx, dz, t.color, mega)
    }
  }
  const splat = mega ? BASE.megaSplat * (1 + 0.1 * t.upgrades.big) : s.splat * (s.twin ? 0.85 : 1)
  const speed = mega ? s.shellSpeed * 0.7 : s.shellSpeed
  // Measured from the nozzle, which sits further forward on the bigger tiers.
  const reach = aim ? Math.hypot(aim.x - from[0].x, aim.z - from[0].z) : Infinity
  const range = Math.max(3, Math.min(reach, mega ? s.range * 0.8 : s.range))
  for (const [sid, x, z, dx, dz] of out) spawnShell({ sid, owner: t.id, x, z, dx, dz, speed, range, splat, bounces: mega ? 0 : s.bounces, mega, color: t.color, bot: t.bot })
  send({ t: 'f', o: t.id, m: mega ? 1 : 0, d: r2(splat), v: r2(speed), r: r2(range), b: mega ? 0 : s.bounces, s: out })
  t.recoil = 1
  const ear = hearing(t.pos.x, t.pos.z, t.id)
  sound.shoot(ear.vol, mega, ear.mine)
}

/** Shared controls for the player and bots: drive, zoom, aim and squirt, then move. */
function control(t, c, dt) {
  const n = now()
  t.drive(c.mx, c.mz, dt, c.backUp)
  if (c.boost && n >= t.boostReadyAt) {
    t.boostUntil = n + BASE.boostTime * 1000
    t.boostReadyAt = n + BASE.boostCooldown * 1000
    if (t === game.me) sound.boost()
  }
  squirt(t, c, n, dt)
  moveTank(t, dt)
}

/**
 * Swings the turret round to the aim and squirts. In the driver's seat (c.snap) the turret is the view itself, so
 * it follows at once and nothing waits.
 *
 * A press's first squirt, and a balloon, wait until the turret has swung onto the aim, so a click lands where it
 * was made rather than where the nozzle happened to point. Let go before it goes (a quick flick of the aim stick, a
 * tap, a balloon press), it keeps the aim it was pressed with, and with a mouse the floor point, which stays the
 * aim as the tank drives on. With squirting held (sweeping paint round like a hose), the rest go on time from
 * wherever the nozzle points. A new press always waits for its own aim, and squirting ahead on its own (c.auto)
 * never counts as hosing. Robots never wait: their aim wobbles a little on purpose (BOT_LEVELS aimError), and
 * waiting would leave them hardly squirting at all.
 */
function squirt(t, c, n, dt) {
  if (c.fire || c.mega) {
    t.dueAim = c.aimYaw
    t.dueAt = null
    if (c.aimAt) {
      t.dueSpot.x = c.aimAt.x
      t.dueSpot.z = c.aimAt.z
      t.dueAt = t.dueSpot
    }
  }
  const waiting = (t.shotDue || t.megaDue) && !c.fire && !c.snap
  const aimAt = waiting ? t.dueAt : c.aimAt
  const aim = !waiting ? c.aimYaw : aimAt ? yawOf(aimAt.x - t.pos.x, aimAt.z - t.pos.z) : t.dueAim
  // It stays on the aim while the hull turns.
  const swing = BASE.turretRate * dt
  t.turretYaw = c.snap ? aim : t.turretYaw + Math.max(-swing, Math.min(swing, angleDiff(t.turretYaw, aim)))
  if (!c.fire || c.tap || c.auto) t.hosing = false
  const onAim = c.snap || t.bot || Math.abs(angleDiff(t.turretYaw, aim)) < 0.06
  if (c.mega && t.stats.mega && n >= t.megaReadyAt) t.megaDue = true
  if (t.megaDue && onAim) {
    t.megaDue = false
    t.megaReadyAt = n + BASE.megaCooldown * 1000
    fire(t, true, aimAt)
  }
  // A press (a click or tap, or the aim stick pushed out) counts even while reloading: it squirts as soon as the
  // nozzle is ready.
  if ((c.fire && n >= t.nextFireAt) || c.tap) t.shotDue = true
  if (t.shotDue && n >= t.nextFireAt && (onAim || t.hosing)) {
    t.shotDue = false
    t.hosing = c.fire && !c.auto
    t.nextFireAt = n + t.stats.reload * (n < t.rapidUntil ? 0.45 : 1) * 1000
    fire(t, false, aimAt)
  }
}

/** Moves a tank this device drives, then slides it off walls, props, other tanks and the balls. */
function moveTank(t, dt) {
  t.pos.x += t.vel.x * dt
  t.pos.z += t.vel.z * dt
  const wantX = t.pos.x
  const wantZ = t.pos.z
  pushOut(t.pos, TANK_RADIUS)
  for (const o of game.tanks.values()) {
    if (o === t || !o.alive) continue
    const dx = t.pos.x - o.pos.x
    const dz = t.pos.z - o.pos.z
    const d = Math.hypot(dx, dz)
    const min = TANK_RADIUS * 2
    if (d < min && d > 0.001) {
      t.pos.x = o.pos.x + (dx / d) * min
      t.pos.z = o.pos.z + (dz / d) * min
    }
  }
  const ballX = t.pos.x
  const ballZ = t.pos.z
  const held = blockTank(t.pos)
  // A ball's push doesn't count below (the host kicks the ball on with the speed the tank pushes it with), unless
  // the ball is held against a wall (or a stuck ball) and can't go on: then it stops the tank like the wall.
  const ballDx = held ? 0 : t.pos.x - ballX
  const ballDz = held ? 0 : t.pos.z - ballZ
  pushOut(t.pos, TANK_RADIUS)
  // Pressed against a wall, a prop or a tank, the tank shows no speed into it (to friends' devices, its dust and
  // its suspension). Its tracks keep pushing (t.trackVel is untouched), so it slides along at full speed.
  let nx = t.pos.x - wantX - ballDx
  let nz = t.pos.z - wantZ - ballDz
  const l = Math.hypot(nx, nz)
  if (l > 1e-4) {
    nx /= l
    nz /= l
    const vn = t.vel.x * nx + t.vel.z * nz
    if (vn < 0) {
      t.vel.x -= vn * nx
      t.vel.z -= vn * nz
    }
  }
}

// --- Player input ------------------------------------------------------------------------

const ray = new THREE.Raycaster()
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LAND_Y) // where blobs land
const aimPoint = new THREE.Vector3()
const mouseNdc = new THREE.Vector2()

/** The floor point under the mouse (aimPoint, where blobs land), or null. */
function mouseGround() {
  ray.setFromCamera(mouseNdc.set(input.mouse.x, input.mouse.y), camera)
  return ray.ray.intersectPlane(aimPlane, aimPoint)
}

function playerControls(me, dt) {
  const c = { mx: input.moveX, mz: input.moveZ, aimYaw: me.turretYaw, fire: input.firing || input.clicked, tap: input.clicked, boost: input.boost, mega: input.mega }
  if (firstPerson()) return seatControls(me, c, dt)
  if (mouseAims()) {
    if (mouseGround()) {
      c.aimYaw = yawOf(aimPoint.x - me.pos.x, aimPoint.z - me.pos.z)
      // Paint lobs onto the point under the mouse.
      c.aimAt = aimPoint
    }
  } else if (input.aimStick.active || input.flicked) {
    // (Or a flick of the aim stick over within a frame: it keeps its direction.)
    c.aimYaw = yawOf(input.aimStick.x, input.aimStick.y) // the turret's swing smooths it (squirt)
  } else if (drivingAlone() && !me.shotDue && !me.megaDue) {
    // Little thumbs: with only the drive stick (or the keys) held, squirt paint ahead automatically, but not while
    // a squirt or balloon pressed a moment ago waits for the turret (squirting ahead would take over its aim).
    c.aimYaw = me.turretYaw + angleDiff(me.turretYaw, me.heading) * Math.min(1, dt * 4)
    c.fire = c.auto = true
  }
  return c
}

// --- Driver's seat view --------------------------------------------------------------------
// The camera rides in the turret and looks where the paint squirts. Driving is relative to the view. Driving
// alone (keys or the drive stick), left and right turn the view and up drives along it. With the mouse in use,
// it looks around once the pointer is locked and left and right move sideways; on touch the right stick turns
// the view.

const VIEW_KEY = 'splat-tanks.view'
const seat = { on: false, yaw: 0, pitch: 0, keys: false } // keys: this round, keys alone have been steering
try {
  seat.on = localStorage.getItem(VIEW_KEY) === 'seat'
} catch {}

const firstPerson = () => seat.on && game.phase === 'battle' && game.me?.alive

function setSeat(on) {
  seat.on = on
  try {
    localStorage.setItem(VIEW_KEY, on ? 'seat' : 'top')
  } catch {}
  hud.press($('seat-btn'), on)
  if (game.me) seat.yaw = game.me.turretYaw
  seat.pitch = 0
  if (!on && document.pointerLockElement) document.exitPointerLock()
  if (game.phase === 'battle') sayView()
}

/** Shows and says which view is on, so a child who can't read knows what changed. */
function sayView() {
  // A touch laptop or an iPad with a mouse is told about whichever it was last used with.
  const touch = input.touch || (matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches)
  if (!seat.on) {
    hud.subBanner('🗺️ Sky view', 2200)
    voice.sayNow('Sky view.')
    return
  }
  // Keys alone (no mouse yet this round) steer like a toy tank: say so rather than send them to the mouse.
  const [shown, said] = touch
    ? ["👀 Driver's seat! Right stick looks around", "You're in the driver's seat. The right stick looks around."]
    : input.mouseUsed
      ? ["👀 Driver's seat! Click, then move the mouse to look", "You're in the driver's seat. Click, then move the mouse to look around."]
      : ["👀 Driver's seat! ← → turn", "You're in the driver's seat. The arrow keys turn and drive."]
  hud.subBanner(shown, 2600)
  voice.sayNow(said)
}

function seatControls(me, c, dt) {
  // The mouse has just taken over from the keys: say how it looks around now.
  if (seat.keys && input.mouseUsed) {
    seat.keys = false
    sayView()
  }
  const look = input.look
  seat.yaw -= look.dx * 0.0028
  seat.pitch = Math.max(-0.35, Math.min(0.2, seat.pitch - look.dy * 0.002))
  look.dx = look.dy = 0
  // Driving only, like a toy tank: left and right turn the view gently, up and down drive along it, and paint
  // squirts ahead.
  const toyTank = drivingAlone()
  if (input.aimStick.active) seat.yaw -= input.aimStick.x * 2.4 * dt
  else if (toyTank) {
    seat.yaw -= input.moveX * 1.3 * dt
    // The hull turns with the view, so up always drives forward (never the tank's reverse) and down backs up.
    me.heading += angleDiff(me.heading, seat.yaw) * Math.min(1, dt * 8)
    c.fire = c.auto = true
    seat.keys = !input.touch
  }
  const d = dirOf(seat.yaw)
  const ahead = -input.moveZ
  const right = toyTank ? 0 : input.moveX
  c.mx = d.x * ahead - d.z * right
  c.mz = d.z * ahead + d.x * right
  c.aimYaw = seat.yaw
  c.snap = true
  c.backUp = Infinity // the hull follows the view, so it backs up for as long as it's held
  return c
}

const eye = new THREE.Vector3()
let lens = ''
function setLens(fov, near) {
  if (lens === `${fov}|${near}|${camera.aspect}`) return
  lens = `${fov}|${near}|${camera.aspect}`
  camera.fov = fov
  camera.near = near
  camera.updateProjectionMatrix()
}

// --- Camera ------------------------------------------------------------------------------

const camPos = new THREE.Vector3(0, 40, 40)
const camTarget = new THREE.Vector3()
const camWant = new THREE.Vector3() // scratch
const demoTanks = [] // parked in the menu's arena until the first match
let menuAngle = 0

function updateCamera(dt) {
  const portrait = innerHeight > innerWidth
  const inside = firstPerson()
  view.seat = !!inside
  view.seatTank = inside ? game.me.id : null
  const entering = inside && !game.me.firstPerson
  if (game.me && game.me.firstPerson !== inside) {
    game.me.setFirstPerson(inside)
    if (inside) seat.yaw = game.me.turretYaw
  }
  if (!inside && document.pointerLockElement) document.exitPointerLock()
  setLens(inside ? (portrait ? 80 : 70) : portrait ? 62 : 45, inside ? 0.1 : 0.5)
  turnLabels(inside ? game.me.turretYaw : 0)
  if (inside) {
    seatCamera(dt)
    // This frame's puffs and blobs were judged from the sky camera: clear the ones now around the seat.
    if (entering) {
      clearNearCamera()
      hideNearCamera()
    }
    return
  }
  if (game.phase === 'menu' || game.phase === 'loading') {
    if (!still.matches) menuAngle += dt * 0.08
    camera.position.set(Math.sin(menuAngle) * 58, 34, Math.cos(menuAngle) * 58)
    camera.lookAt(0, 0, 0)
    return
  }
  const me = game.me
  if (me) {
    const look = me.alive ? 4 : 0
    const d = dirOf(me.turretYaw)
    camTarget.lerp(camWant.set(me.pos.x + d.x * look, 0, me.pos.z + d.z * look), Math.min(1, dt * 5))
  }
  const height = portrait ? 40 : 30
  const back = portrait ? 18 : 19
  camPos.lerp(camWant.set(camTarget.x, height, camTarget.z + back), Math.min(1, dt * 6))
  camera.position.copy(camPos)
  camera.lookAt(camTarget.x, 0, camTarget.z)
  followSun()
}

function seatCamera(dt) {
  const me = game.me
  const d = dirOf(me.turretYaw)
  me.turret.getWorldPosition(eye)
  eye.y += 0.75 + me.tier * 0.08
  eye.x -= d.x * 0.15
  eye.z -= d.z * 0.15
  camera.position.copy(eye)
  const p = seat.pitch - 0.06
  camera.lookAt(eye.x + d.x * Math.cos(p) * 10, eye.y + Math.sin(p) * 10, eye.z + d.z * Math.cos(p) * 10)
  // Keep the top view ready to take over smoothly, and the shadows centred ahead of the tank.
  camTarget.set(me.pos.x + d.x * 4, 0, me.pos.z + d.z * 4)
  camPos.set(camTarget.x, 30, camTarget.z + 19)
  followSun()
}

function followSun() {
  sun.position.copy(sunDir).multiplyScalar(70).add(camTarget)
  sun.target.position.copy(camTarget)
}

// --- Frame loop --------------------------------------------------------------------------

let last = now()
let dustT = 0

function frame() {
  const n = now()
  const dt = Math.min(0.05, (n - last) / 1000)
  last = n

  if (game.phase === 'battle' || game.phase === 'ending') battleStep(dt, n)
  updateFx(dt)
  updateFloaters(dt)
  updatePaint(n)
  updateCamera(dt)
  fadeNearCamera() // after the camera has moved this frame
  renderer.render(scene, camera)
  input.boost = input.mega = input.clicked = input.flicked = false
  input.pick = 0
}

function battleStep(dt, n) {
  const m = game.match
  const me = game.me
  const live = n >= m.startAt && !m.over
  const tanks = tankList()

  // Countdown.
  if (!live && !m.over) {
    const c = Math.ceil((m.startAt - n) / 1000)
    if (c !== m.countdown && c > 0) {
      m.countdown = c
      hud.banner(String(c), '', 800)
      sound.countdown()
    }
  } else if (m.countdown > 0) {
    m.countdown = 0
    hud.banner('🎨 Paint!', 'Paint the floor your colour!', 1400)
    sound.countdown(true)
    voice.say('Paint the floor your colour!')
  }

  // Our tank and (on the host) the bots.
  if (me?.alive && live) control(me, playerControls(me, dt), dt)
  else if (me) {
    me.stop()
    input.look.dx = input.look.dy = 0 // mouse-look counts only while you drive, so the view can't jump at "Paint!"
  }
  if (isHost()) {
    for (const t of game.tanks.values()) {
      if (!t.bot || !t.alive) continue
      // Out of play (the countdown, the round over), robots stand still like us.
      if (!live) {
        t.stop()
        continue
      }
      const brain = game.brains.get(t.id) ?? game.brains.set(t.id, newBrain()).get(t.id)
      control(t, botControls(t, brain, tanks, game.pads, game.opts.difficulty, dt, together()), dt)
    }
  }
  for (const t of game.tanks.values()) if (!t.local) t.follow(dt)

  // Blobs: the host's copy decides where paint lands.
  // A balloon bursts wherever it lands; a blob splashes the tank it hit, or paints the floor.
  const landed = (s, t) => {
    if (!isHost()) return
    const by = game.tanks.get(s.owner)
    if (s.mega) bigSplash(s.x, s.z, s.splat, by)
    else if (t) splashTank(t, by, s.sid)
    else hostPaint(s.x, s.z, s.splat, by)
  }
  updateShells(dt, tanks, {
    tank: landed,
    barrel: (s, i) => hostBucket(i, game.tanks.get(s.owner)),
    land: landed,
    // A balloon bursts on a ball as it would anywhere.
    ball: (s, b) => (s.mega ? landed(s) : hostBall(b, s)),
  }, hearing)

  if (isHost() && live) hostStep(dt, n)
  if (isHost() && n - game.lastPaintSend > 100) flushPaint()

  // Upgrade cards, while the round is on (they'd hide "Time's up!").
  if (me && !m.over) {
    if (input.pick && game.offer) pickUpgrade(game.offer[input.pick - 1])
    const pending = pendingPoints(me)
    // The cards are said once when they come up, so a child who can't read knows what they're for.
    if (pending > 0 && !game.cardsSaid) voice.say('Level up! Pick a new power.')
    game.cardsSaid = pending > 0
    game.offer = pending > 0 ? (game.offer ?? offerFor(me)) : null
    hud.showUpgrades(game.offer, me.upgrades, pending, pickUpgrade)
    if (game.offer && document.pointerLockElement) document.exitPointerLock() // free the cursor for the cards
  } else if (game.offer) {
    game.offer = null
    hud.showUpgrades(null)
  }

  // Network: our tank, and on the host the bots too, in one batch.
  if (n - game.lastNet > 50) {
    game.lastNet = n
    const a = tanks.filter((t) => t.alive && (t === me || (t.bot && isHost()))).map(poseOf)
    if (a.length) sendFast({ t: 'pb', a })
    // The balls while they roll, once more as they come to rest (so friends' last word of them is "still"), and
    // now and then when they're still (for a friend who just joined).
    if (isHost()) {
      const rolling = ballsMoving()
      if (rolling || game.ballsRolled || n - game.lastBalls > 1000) {
        game.lastBalls = n
        sendFast({ t: 'bl', a: ballState() })
      }
      game.ballsRolled = rolling
    }
  }
  if (isHost() && ((game.statsDirty && n - game.lastStats > 150) || n - game.lastStats > 1000)) sendStats()

  // Visuals.
  dustT += dt
  // Painting together has no ranking: no leaderboard, no crown and no paint bar.
  const sorted = together() ? null : hud.board(tanks, me)
  const best = sorted ? cellsOf(sorted[0]?.slot ?? 0) : 0
  const leader = best > 0 ? sorted[0] : null
  for (const t of game.tanks.values()) {
    t.render(dt, t === leader)
    if (!t.alive) continue
    const speed = Math.hypot(t.vel.x, t.vel.z)
    const fwd = dirOf(t.heading)
    if (t.boosting) boostTrail(t.pos.x - fwd.x * 1.4, t.pos.z - fwd.z * 1.4, t.color)
    else if (speed > 3 && dustT > 0.08) dust(t.pos.x - fwd.x * 1.2, t.pos.z - fwd.z * 1.2, Math.min(1, speed / 10))
  }
  if (dustT > 0.08) dustT = 0
  updateTreads(game.tanks.values(), n)
  renderBalls(dt, isHost(), (b, k) => {
    const ear = hearing(b.x, b.z, b.by)
    sound.thump(ear.vol * k, ear.mine)
  })
  for (const p of game.pads) {
    if (!p.kind || still.matches) continue
    p.sprite.position.y = 1.6 + Math.sin(n / 700 + p.i) * 0.2
    p.glow.position.y = p.sprite.position.y
    p.glow.scale.setScalar(1 + Math.sin(n / 900 + p.i) * 0.06)
  }

  // HUD.
  if (together()) {
    // Measure only when the paint changed (it uploads about 10 times a second).
    if (game.progressVersion !== paintVersion) {
      game.progressVersion = paintVersion
      game.progress = partProgress()
    }
    hud.fraction(game.progress, me?.alive ? partAt(me.pos.x, me.pos.z) : -1)
  } else hud.timer(m.over ? 0 : Math.min(m.endsAt - n, m.endsAt - m.startAt))
  if (me) hud.bars(me, n, together())
  hud.minimap(tanks, me, game.pads, balls)
  const inside = firstPerson()
  document.body.classList.toggle('seat', !!inside)
  // In the driver's seat the aim is the middle of the view, but only while the mouse is captured: when it is
  // free (cards up, or after Esc) the ring follows the mouse, so a child can always see where they're pointing.
  if (inside && (input.touch || document.pointerLockElement)) {
    hud.crosshair(true, innerWidth / 2, innerHeight / 2)
    hud.reach(false)
  } else {
    const aiming = mouseAims() && me?.alive
    hud.crosshair(aiming, ...toScreen(mouseNdc.set(input.mouse.x, input.mouse.y)))
    showReach(aiming && !inside ? me : null)
  }
}

/**
 * Shortens the fraction k of the way from p to a (one axis) to stop at the outer wall, less about a blob's radius
 * (where shellObstacle stops it).
 */
function edgeAt(p, a, k) {
  const edge = ARENA - 0.3
  const at = p + (a - p) * k
  return Math.abs(at) > edge ? (Math.sign(at) * edge - p) / (a - p) : k
}

const nozzle = new THREE.Vector3()
const landing = new THREE.Vector3()
/**
 * With the mouse beyond squirting range, a dot shows where the paint will really land (as far as it goes toward
 * the ring), and the ring dims, so the ring never promises paint where it can't reach.
 */
function showReach(me) {
  if (!me || !mouseGround()) return hud.reach(false)
  // Measured from the nozzle as it will be once the turret has swung round to the mouse.
  me.muzzleNodes[0].getWorldPosition(nozzle)
  // (Plus how far a squirt has just pulled the barrel back, so the dot doesn't flicker with each squirt.)
  const ahead = Math.hypot(nozzle.x - me.pos.x, nozzle.z - me.pos.z) + me.recoil * RECOIL_KICK
  const d = Math.hypot(aimPoint.x - me.pos.x, aimPoint.z - me.pos.z)
  if (d - ahead <= me.stats.range) return hud.reach(false)
  // No further than the outer wall, where the paint would splat.
  const k = edgeAt(me.pos.z, aimPoint.z, edgeAt(me.pos.x, aimPoint.x, (me.stats.range + ahead) / d))
  landing.set(me.pos.x + (aimPoint.x - me.pos.x) * k, LAND_Y, me.pos.z + (aimPoint.z - me.pos.z) * k).project(camera)
  hud.reach(true, ...toScreen(landing))
}

function hostStep(dt, n) {
  // Wheels leave a paint trail; zooming as a Roller (or with the big brush) paints a wide stripe.
  const trail = n - game.lastTrail > 120
  if (trail) game.lastTrail = n
  // A rolling ball paints a stripe in the colour of the tank that touched it last.
  // A robot bumping a ball rolls it on but leaves its colour: the balls are the children's.
  for (const { b, t } of stepBalls(dt, tankList())) if (!t.bot) setOwner(b, t.id, t.color)
  for (const b of balls) {
    const by = b.by && game.tanks.get(b.by)
    if (!by || Math.hypot(b.vx, b.vz) <= 1.2) b.trailAt = null
    else if (trail) trailTo(b, b.x, b.z, 0.9, by)
  }
  for (const t of game.tanks.values()) {
    if (!t.alive) {
      t.trailAt = null
      if (n >= t.respawnAt && t.respawnAt) {
        t.respawnAt = 0
        const spot = pickSpawn(t)
        broadcast({ t: 'sp', i: t.id, x: spot.x, z: spot.z, h: yawOf(-spot.x, -spot.z) })
        game.statsDirty = true
      }
      continue
    }
    if (Math.hypot(t.vel.x, t.vel.z) <= 1) t.trailAt = null
    else if (trail) {
      const wide = n < t.rollerUntil || (t.stats.roller && t.boosting)
      trailTo(t, t.pos.x, t.pos.z, wide ? Math.max(2.4, t.stats.trail * 2) : t.stats.trail, t)
    }
    for (const p of game.pads) {
      if (!p.kind || Math.hypot(p.x - t.pos.x, p.z - t.pos.z) > TANK_RADIUS + 1) continue
      if (p.kind === 'star') addXp(t, XP.star + 5 * t.level)
      broadcast({ t: 'pk', i: p.i, by: t.id, k: p.kind })
      game.statsDirty = true
    }
  }
  for (const p of game.pads) if (!p.kind && n >= p.respawnAt) broadcast({ t: 'pu', i: p.i, k: randomPickup() })
  barrels.forEach((b, i) => !b.alive && n >= b.backAt && broadcast({ t: 'bu', i }))
  if (together()) {
    // A part is finished once most of it is painted; the whole floor ends the round.
    const p = game.progress.findIndex((v, i) => !layout.done[i] && v >= DONE)
    if (p >= 0) {
      flushPaint()
      broadcast({ t: 'pd', p })
    }
    if (partsDone() === layout.n) endMatch()
  } else if (n >= game.match.endsAt) endMatch()
}

/**
 * Host: paints a trail from where `o` (a tank or ball) last painted to (x, z), filling in splats where the gap
 * would show, so a zooming tank or a fast ball leaves a solid stripe rather than dots.
 */
function trailTo(o, x, z, r, by) {
  const from = o.trailAt
  const d = from ? Math.hypot(x - from.x, z - from.z) : 0
  const n = d < 8 ? Math.min(6, Math.floor(d / (1.4 * r))) : 0
  for (let k = 1; k <= n; k++) hostPaint(from.x + ((x - from.x) * k) / (n + 1), from.z + ((z - from.z) * k) / (n + 1), r, by)
  hostPaint(x, z, r, by)
  o.trailAt = { x, z }
}

/** The start point farthest from other tanks. */
function pickSpawn(t) {
  let best = SPAWNS[0]
  let bestD = -1
  for (const [x, z] of SPAWNS) {
    let d = Infinity
    for (const o of game.tanks.values()) if (o !== t && o.alive) d = Math.min(d, Math.hypot(o.pos.x - x, o.pos.z - z))
    d += Math.random() * 6
    if (d > bestD) ((bestD = d), (best = [x, z]))
  }
  return { x: best[0], z: best[1] }
}

// --- Menu --------------------------------------------------------------------------------

function renderMenu() {
  $('callsign').textContent = game.myName
  $('colors').innerHTML = ''
  COLORS.forEach((c, k) => {
    const b = document.createElement('button')
    b.style.background = c
    hud.press(b, c === game.myColor)
    // A colour a friend already has is dimmed: picking it would swap you to another one at the start.
    const taken = [...game.humans.values()].some((h) => h.color === c)
    b.classList.toggle('taken', taken)
    b.setAttribute('aria-label', taken ? `${COLOR_NAMES[k]}, a friend has it` : COLOR_NAMES[k])
    b.addEventListener('click', () => {
      game.myColor = c
      voice.sayNow(COLOR_NAMES[k])
      menuChanged()
    })
    $('colors').appendChild(b)
  })
  showHostOptions()
}

/** Someone joined, left or changed: in the menu the colour buttons show who has which colour too. */
const renderRoom = () => (game.phase === 'menu' ? renderMenu() : renderLobby())

/** The player changed their name or colour: show it and tell the room. */
function menuChanged() {
  sound.click()
  renderMenu()
  hello()
}

function renderLobby() {
  const box = $('lobby')
  if (!game.room || game.room.solo) {
    box.innerHTML = ''
    return
  }
  const chips = [[game.selfId, { name: game.myName, color: game.myColor }], ...game.humans]
  box.innerHTML = `<span class="label">Room ${hud.esc(game.room.code ?? '')}</span>` + chips.map(([id, h]) => `<span class="chip" style="border-color:${hud.esc(h.color)}">${id === game.hostId ? '👑 ' : ''}${hud.esc(h.name)}${id === game.selfId ? ' (you)' : ''}</span>`).join('')
}

function setupMenu() {
  takeOpts(game.opts) // the menu shows the defaults in game.opts, the one place they're set
  $('reroll').addEventListener('click', () => {
    game.myName = randomName()
    menuChanged()
    voice.sayNow(`You're ${game.myName}!`) // the name rides over your tank; a child who can't read hears it
  })
  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', (e) => {
      const key = seg.dataset.opt
      const b = setOpt(key, e.target.closest('button')?.dataset.v)
      if (!b) return
      sound.click()
      if (b.dataset.say) voice.sayNow(b.dataset.say)
      if (key === 'mode') showHostOptions()
    })
  }
  const start = () => isHost() && hostStartMatch()
  $('go').addEventListener('click', start)
  $('again').addEventListener('click', start)
  const home = () => isHost() && broadcast({ t: 'menu' })
  // In play, 🏠 ends the round for everyone, so it asks for a second tap: a stray tap loses nothing.
  // 🏠 is left out of the Tab order, so Tab-then-Enter (keys a child mashes beside WASD and Q) can't reach it;
  // screen readers and switch access still can.
  $('home').tabIndex = -1
  $('home').addEventListener('click', () => {
    if (!isHost()) return
    if (now() < homeArmedUntil) return home()
    homeArmedUntil = now() + 3000
    // A toast, so it shows even while upgrade cards hide the sub-banner.
    hud.toast('🏠 Tap again for the menu', 3000)
    voice.sayNow('Tap the house again to stop painting.')
  })
  $('to-menu').addEventListener('click', home)
  const flipMusic = () => {
    const on = toggleMusic()
    $('music').classList.toggle('off', !on)
    $('music').setAttribute('aria-pressed', String(on))
  }
  $('music').addEventListener('click', flipMusic)
  onKey('KeyM', flipMusic)
  // HUD buttons never keep keyboard focus from a click, so Enter (a key young children mash) can't press one again.
  for (const b of document.querySelectorAll('#hud button')) b.addEventListener('mousedown', (e) => e.preventDefault())
  hud.press($('seat-btn'), seat.on)
  $('seat-btn').addEventListener('click', () => setSeat(!seat.on))
  onKey('KeyV', () => setSeat(!seat.on))
  for (const el of mouseSurfaces(renderer.domElement)) {
    el.addEventListener('pointerdown', (e) => {
      // Lock the pointer for mouse look, but not while the upgrade cards want clicking.
      if (e.pointerType === 'mouse' && firstPerson() && !game.offer && !document.pointerLockElement) renderer.domElement.requestPointerLock()?.catch?.(() => {}) // refused just after Esc: no matter
    })
  }
  // iOS Safari only unlocks audio from certain gestures, and the sticks cancel clicks.
  // A guest's round starts from the network, so if their first touch comes mid-round, the opening line went
  // unheard: it's said again.
  const wake = (e) => unlockAudio(e) && game.phase === 'battle' && together() && voice.say(introWords(layout.n))
  for (const ev of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown']) addEventListener(ev, wake, { capture: true, passive: true })
}

// --- Boot --------------------------------------------------------------------------------

async function boot() {
  bindMouse(renderer.domElement)
  bindTouch()
  setupMenu()
  renderer.setAnimationLoop(frame)
  await loadModels((p) => ($('loadfill').style.width = `${p * 100}%`))
  game.arenaSeed = 1234
  buildArena(game.arenaSeed)
  makePads()
  // A few tanks parked around a painted arena make the menu look alive.
  ;[[0, 9, '#ff3b3b', 1], [7, -6, '#2f8cff', 2], [-8, -5, '#22c55e', 3], [16, 16, '#ffb703', 4]].forEach(([x, z, c, tier], i) => {
    const t = new Tank({ id: `demo${i}`, name: '', color: c })
    t.level = TIERS[tier - 1].level
    t.recompute()
    t.place(x, z, yawOf(-x, -z))
    t.alive = true
    t.render(0, false)
    t.label.visible = false
    demoTanks.push(t)
    setSlotColor(i + 1, c)
    for (let k = 0; k < 6; k++) paint(x + (Math.random() - 0.5) * 16, z + (Math.random() - 0.5) * 16, 1.5 + Math.random() * 2.5, i + 1)
  })
  $('loading-text').textContent = 'Finding other players…'
  const params = new URLSearchParams(location.search)
  const room = params.has('solo') ? { solo: true, selfId: 'solo', isHost: true, peers: [], on() {}, send() {} } : await joinRoom({ maxPlayers: 8 })
  setupRoom(room)
  show('loading', false)
  game.phase = 'menu'
  renderMenu()
  show('menu')
  if (!isHost()) voice.say('Waiting for the host to start.')
  if (params.has('autostart')) hostStartMatch()
  if (params.has('debug')) window.__tank = { game, hud, input, camera, addXp, setLevel, step: () => frame(), renderer, layout, partProgress, broadcast, voice, balls }
}

boot().catch((e) => {
  console.error(e)
  $('loading-text').textContent = '😕 Something went wrong. Reload to try again.'
})
