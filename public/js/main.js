// Splat Tanks: the match, the network protocol and the frame loop.
//
// Networking: each device drives its own tank and sends its position ~20x a second.
// The host (the device that started the room) runs the rules: where paint lands, splashes, XP,
// levels, pickups, paint buckets and the bots, and tells everyone what happened.
import * as THREE from 'three'
import { joinRoom } from 'https://bitgames.store/vendor/bitgames/multiplayer-1.js'
import { TANK_RADIUS, MAX_LEVEL, MATCH, BASE, UPGRADES, PICKUPS, XP, COLORS, TIERS, emptyLoadout, xpToNext, randomName } from './config.js'
import { renderer, scene, camera, sun, loadModels, buildArena, pushOut, barrels, PADS, SPAWNS } from './world.js'
import { Tank, yawOf, angleDiff } from './tank.js'
import { spawnShell, removeShell, updateShells, clearShells } from './shells.js'
import { updateFx, updateFloaters, splash, muzzleFlash, floatText, sparks, confetti, dust, boostTrail, levelBurst, addShake, shake } from './fx.js'
import { paint, resetPaint, setSlotColor, encodePaint, decodePaint, updatePaint, cellsOf, painted, CELLS } from './paint.js'
import { botControls, botPickUpgrade, newBrain } from './bots.js'
import { input, bindMouse, bindTouch, onKey } from './input.js'
import { unlockAudio, sound, announce, toggleMusic, musicIntensity } from './audio.js'
import * as hud from './hud.js'

const $ = (id) => document.getElementById(id)
const show = (id, on = true) => $(id).classList.toggle('hidden', !on)
const now = () => performance.now()
const r1 = (v) => Math.round(v * 10) / 10
const r2 = (v) => Math.round(v * 100) / 100

const game = {
  phase: 'loading',
  room: null,
  selfId: 'solo',
  hostId: 'solo',
  tanks: new Map(),
  me: null,
  brains: new Map(),
  humans: new Map(), // id -> { name, color } from hello messages
  opts: { bots: 5, difficulty: 'normal', length: 1 },
  match: null, // { seed, endsAt, startAt, over }
  pads: [],
  offer: null,
  shotCount: 0,
  lastNet: 0,
  lastStats: 0,
  statsDirty: false,
  paintQueue: [], // host: splats not yet sent
  lastPaintSend: 0,
  lastTrail: 0,
  myName: randomName(),
  myColor: COLORS[Math.floor(Math.random() * COLORS.length)],
  arenaSeed: 0,
  announcedTime: false,
}
const isHost = () => game.hostId === game.selfId
const tankList = () => [...game.tanks.values()]
const bySlot = (slot) => tankList().find((t) => t.slot === slot)

// --- Networking --------------------------------------------------------------------------

function send(msg, to) {
  if (!game.room || game.room.solo) return
  game.room.send(msg, to ? { to } : {})
}
function sendFast(msg) {
  if (!game.room || game.room.solo) return
  game.room.send(msg, { fast: true })
}
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
  game.selfId = room.selfId
  game.hostId = room.isHost ? room.selfId : null
  room.on('join', (id) => hello(id))
  room.on('leave', (id) => {
    game.humans.delete(id)
    const t = game.tanks.get(id)
    if (t) {
      hud.feed(`${hud.tag(t)} went home 👋`)
      t.dispose()
      game.tanks.delete(id)
    }
    if (id === game.hostId) migrateHost()
    renderLobby()
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
  for (const t of game.tanks.values()) {
    if (t.bot) {
      t.local = true
      if (!game.brains.has(t.id)) game.brains.set(t.id, newBrain())
    }
  }
  hello()
  renderLobby()
}

function handle(msg, from) {
  if (!msg || typeof msg !== 'object') return
  const t = game.tanks.get(msg.i)
  switch (msg.t) {
    case 'hello': {
      game.humans.set(from, { name: String(msg.name).slice(0, 24), color: msg.color })
      if (msg.host) game.hostId = from
      const existing = game.tanks.get(from)
      if (existing && existing.name !== msg.name) {
        existing.name = String(msg.name).slice(0, 24)
        existing.refreshLabel()
      }
      // Someone joined mid-game: the host gives them a tank (and a slot for their paint).
      if (game.phase === 'battle' && !existing && isHost()) {
        flushPaint()
        broadcast({ t: 'add', e: { i: from, n: msg.name, c: msg.color, s: nextSlot() } })
        send(snapshot(), from)
        game.tanks.get(from).respawnAt = now() + 800
      }
      renderLobby()
      break
    }
    case 'add':
      if (game.phase === 'battle') addTank(msg.e)
      break
    case 'start':
      startBattle(msg)
      break
    case 'p': {
      if (!t || t.local) return
      t.target = { x: msg.x, z: msg.z, h: msg.h, ty: msg.y, vx: msg.vx, vz: msg.vz, t: now() }
      if (msg.b) t.boostUntil = now() + 120
      break
    }
    case 'pb':
      for (const [i, x, z, h, y, vx, vz, b] of msg.a) {
        const bt = game.tanks.get(i)
        if (!bt || bt.local) continue
        bt.target = { x, z, h, ty: y, vx, vz, t: now() }
        if (b) bt.boostUntil = now() + 120
      }
      break
    case 'f': {
      const owner = game.tanks.get(msg.o)
      if (!owner || owner.local) return
      for (const [sid, x, z, dx, dz] of msg.s) {
        spawnShell({ sid, owner: msg.o, x, z, dx, dz, speed: msg.v, range: msg.r, splat: msg.d, bounces: msg.b, mega: !!msg.m, color: owner.color })
        muzzleFlash(x, 1.1, z, dx, dz, owner.color, !!msg.m)
      }
      owner.recoil = 1
      sound.shoot(hearing(owner.pos.x, owner.pos.z), !!msg.m)
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
    case 'bu': {
      const b = barrels[msg.i]
      if (b) {
        b.alive = true
        b.mesh.visible = true
      }
      break
    }
    case 'end':
      onEnd(msg)
      break
  }
}

// --- Match setup -------------------------------------------------------------------------

function nextSlot() {
  return Math.max(0, ...tankList().map((t) => t.slot)) + 1
}

function addTank(e) {
  if (game.tanks.has(e.i)) return game.tanks.get(e.i)
  const t = new Tank({ id: e.i, name: e.n, color: e.c, slot: e.s, bot: !!e.b, local: e.i === game.selfId || (!!e.b && isHost()) })
  setSlotColor(t.slot, t.color)
  game.tanks.set(e.i, t)
  if (e.lv) {
    t.level = e.lv
    t.upgrades = { ...emptyLoadout(), ...e.u }
    t.recompute()
  }
  t.xp = e.xp ?? 0
  t.alive = !!e.al
  if (e.x !== undefined) t.place(e.x, e.z, e.h ?? 0)
  if (t.id === game.selfId) game.me = t
  if (t.bot && isHost()) game.brains.set(t.id, newBrain())
  return t
}

function snapshot(fresh = false) {
  const n = now()
  const m = game.match
  return {
    t: 'start',
    seed: m.seed,
    rem: Math.max(0, m.endsAt - n),
    cd: Math.max(0, m.startAt - n),
    fresh,
    roster: tankList().map((t) => ({ i: t.id, n: t.name, c: t.color, s: t.slot, b: t.bot ? 1 : 0, lv: t.level, xp: Math.round(t.xp), u: t.upgrades, al: t.alive ? 1 : 0, x: r2(t.pos.x), z: r2(t.pos.z), h: r2(t.heading) })),
    pads: game.pads.map((p) => p.kind),
    barrels: barrels.map((b) => (b.alive ? 1 : 0)),
    paint: encodePaint(),
  }
}

/** Host: begin a new match with everyone in the room plus bots. */
function hostStartMatch() {
  const seed = Math.floor(Math.random() * 1e9)
  const ids = [game.selfId, ...(game.room?.peers ?? [])]
  const used = new Set()
  const roster = ids.map((id, k) => {
    const h = id === game.selfId ? { name: game.myName, color: game.myColor } : game.humans.get(id) ?? { name: randomName(), color: COLORS[0] }
    used.add(h.color)
    return { i: id, n: h.name, c: h.color, s: k + 1 }
  })
  const free = COLORS.filter((c) => !used.has(c))
  for (let i = 0; i < game.opts.bots; i++) roster.push({ i: `bot${i}`, n: randomName(), c: free[i % free.length] ?? COLORS[i % COLORS.length], s: roster.length + 1, b: 1 })
  const spots = [...SPAWNS].sort(() => Math.random() - 0.5)
  roster.forEach((e, k) => {
    const [x, z] = spots[k % spots.length]
    e.x = x + (k >= spots.length ? 3 : 0)
    e.z = z
    e.h = yawOf(-x, -z)
    e.al = 1
  })
  const cd = 3000
  game.paintQueue.length = 0
  broadcast({
    t: 'start',
    seed,
    rem: MATCH.minutes[game.opts.length] * 60000 + cd,
    cd,
    fresh: true,
    roster,
    pads: PADS.map((_, i) => (i < 4 ? 'star' : i < 6 ? 'rapid' : null)),
    barrels: [],
  })
}

function startBattle(msg) {
  for (const t of game.tanks.values()) t.dispose()
  game.tanks.clear()
  game.brains.clear()
  game.me = null
  clearShells()
  if (msg.seed !== game.arenaSeed) {
    buildArena(msg.seed)
    game.arenaSeed = msg.seed
    hud.resetMinimap()
    makePads()
  }
  msg.barrels.forEach((a, i) => {
    if (barrels[i]) {
      barrels[i].alive = !!a
      barrels[i].mesh.visible = !!a
    }
  })
  if (!msg.barrels.length) for (const b of barrels) ((b.alive = true), (b.mesh.visible = true))
  game.pads.forEach((p, i) => setPad(i, msg.pads[i] ?? null))
  if (msg.paint) decodePaint(msg.paint)
  else resetPaint()
  for (const e of msg.roster) addTank(e)
  if (!game.me) addTank({ i: game.selfId, n: game.myName, c: game.myColor, s: nextSlot() })
  const n = now()
  game.match = { seed: msg.seed, endsAt: n + msg.rem, startAt: n + msg.cd, over: false, countdown: Math.ceil(msg.cd / 1000) + 1 }
  game.offer = null
  game.announcedTime = false
  game.phase = 'battle'
  show('menu', false)
  show('end', false)
  show('hud')
  document.body.classList.add('playing')
  musicIntensity(true)
  if (game.me) {
    camPos.set(game.me.pos.x, 30, game.me.pos.z + 20)
  }
  if (msg.cd <= 0) hud.banner("🎨 LET'S PAINT!")
}

// --- Pickups -----------------------------------------------------------------------------

const pickupTex = {}
function emojiTexture(emoji) {
  if (pickupTex[emoji]) return pickupTex[emoji]
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  // A coloured token under the emoji, so it still reads where emoji fonts are missing.
  const kind = Object.values(PICKUPS).find((p) => p.icon === emoji)
  g.fillStyle = kind?.color ?? '#fff'
  g.beginPath()
  g.arc(64, 64, 58, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = '#fff'
  g.stroke()
  g.font = '72px serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(emoji, 64, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return (pickupTex[emoji] = t)
}
const glowGeo = new THREE.SphereGeometry(0.9, 16, 12)

function makePads() {
  for (const p of game.pads) scene.remove(p.group)
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
    p.sprite.material.map = emojiTexture(PICKUPS[kind].icon)
    p.sprite.material.needsUpdate = true
    p.glow.material.color.set(PICKUPS[kind].color)
  } else p.respawnAt = now() + 9000 + Math.random() * 7000
}

function randomPickup() {
  const r = Math.random()
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
    floatText(t.pos.x, t.pos.z, `${def.icon} ${def.text}`, 'xp')
    if (msg.k === 'mega' && !t.stats.mega) floatText(t.pos.x, t.pos.z, '🎈 at Lv 4!', 'xp')
  }
}

// --- Host rules: paint, splashes, XP -----------------------------------------------------

/** Host: paint a splat here and on every device, and give its painter XP for new floor. */
function hostPaint(x, z, r, t) {
  if (!t || game.match?.over) return
  const gained = paint(x, z, r, t.slot)
  game.paintQueue.push(r1(x), r1(z), r1(r), t.slot)
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
function bigSplash(x, z, radius, by, skip) {
  hostPaint(x, z, radius, by)
  for (const t of game.tanks.values()) {
    if (!t.alive || t === skip || t === by) continue
    if (Math.hypot(t.pos.x - x, t.pos.z - z) < radius + TANK_RADIUS) splashTank(t, by, null)
  }
  barrels.forEach((b, i) => {
    if (b.alive && Math.hypot(b.x - x, b.z - z) < radius) setTimeout(() => hostBucket(i, by), 150)
  })
}

function hostBucket(i, by) {
  const b = barrels[i]
  if (!b?.alive || !isHost() || !by) return
  broadcast({ t: 'bx', i, by: by.id })
  addXp(by, XP.bucket)
  bigSplash(b.x, b.z, 5.5, by)
  setTimeout(() => {
    if (isHost() && game.phase === 'battle') broadcast({ t: 'bu', i })
  }, 25000)
}

function addXp(t, amount) {
  if (t.level >= MAX_LEVEL) return
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
  const sorted = tankList().sort((a, b) => cellsOf(b.slot) - cellsOf(a.slot) || b.level - a.level)
  broadcast({ t: 'end', a: sorted.map((t) => [t.id, t.level]) })
}

// --- Events everyone shows --------------------------------------------------------------

function hearing(x, z) {
  const c = game.me?.alive ? game.me.pos : { x: camTarget.x, z: camTarget.z }
  return Math.max(0, 1 - Math.hypot(x - c.x, z - c.z) / 50)
}

function onHit(msg) {
  const t = game.tanks.get(msg.i)
  const by = game.tanks.get(msg.by)
  if (msg.s) removeShell(msg.s)
  if (!t) return
  t.flash = 1
  if (by) {
    t.paintColor.set(by.color)
    t.paintT = 1
  }
  sparks(t.pos.x, t.pos.z, by?.color ?? '#ffffff', 8)
  sound.splat(hearing(t.pos.x, t.pos.z))
  if (msg.by === game.selfId && t !== game.me) {
    floatText(t.pos.x, t.pos.z, 'SPLAT! 🎨', 'crit')
    sound.hitMarker()
    crosshairHit()
  }
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
  levelBurst(msg.x, msg.z, t.color)
}

function onBucket(msg) {
  const b = barrels[msg.i]
  const by = game.tanks.get(msg.by)
  if (!b) return
  b.alive = false
  b.mesh.visible = false
  splash(b.x, b.z, 3, by?.color ?? '#ff6ec7')
  confetti(b.x, b.z, [by?.color ?? '#ff6ec7', '#ffffff', '#ffd60a'])
  sound.splosh(hearing(b.x, b.z))
  addShake(0.2 * hearing(b.x, b.z))
  if (by === game.me) hud.subBanner('🪣 PAINT BUCKET!', 1200)
}

/** A tank's level changed (anywhere). Handles growing, the player's upgrade cards and bots' picks. */
function setLevel(t, lv) {
  const oldTier = t.tier
  const up = lv > t.level
  t.level = lv
  t.recompute()
  if (!up) return
  const evolved = t.tier !== oldTier
  if (evolved) {
    levelBurst(t.pos.x, t.pos.z, t.color)
    confetti(t.pos.x, t.pos.z, [t.color, '#ffffff', '#ffd60a'])
  }
  if (t === game.me) {
    if (evolved) {
      const tier = TIERS[t.tier - 1]
      hud.banner(`✨ ${tier.name.toUpperCase()}!`, tier.perk, 2600)
      sound.evolve()
      announce(`You are a ${tier.name}!`)
    } else {
      hud.banner(`LEVEL ${lv}!`, '', 900)
      sound.levelUp()
    }
    levelBurst(t.pos.x, t.pos.z, '#ffd60a')
  } else if (evolved && t.tier === 4) {
    hud.subBanner(`🌈 ${t.name} grew into a TITAN!`, 2500)
  }
  if (t.bot && isHost()) {
    while (pendingPoints(t) > 0) {
      const opts = offerFor(t)
      if (!opts.length) break
      t.upgrades[botPickUpgrade(t, opts, game.opts.difficulty)]++
    }
    t.recompute()
    send({ t: 'lo', i: t.id, u: t.upgrades })
  }
}

function pendingPoints(t) {
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
  for (const t of sorted) confetti(t.pos.x, t.pos.z, COLORS)
  hud.banner("🎉 TIME'S UP!", '', 2200)
  sound.cheer()
  announce("Time's up! Great painting!")
  setTimeout(() => {
    game.phase = 'end'
    hud.results(sorted, game.me, Math.round((painted() / CELLS) * 100))
    show('hud', false)
    show('end')
    show('again', isHost())
    show('end-wait', !isHost())
    document.body.classList.remove('playing')
    musicIntensity(false)
  }, 2400)
  game.phase = 'ending'
}

// --- Squirting ---------------------------------------------------------------------------

function fire(t, mega = false) {
  const s = t.stats
  const muzzles = t.muzzles()
  const out = []
  const spread = mega ? [0] : Array.from({ length: s.shells }, (_, i) => (i - (s.shells - 1) / 2) * 0.16)
  const from = mega ? [muzzles[0]] : muzzles
  for (const m of from) {
    for (const a of spread) {
      const yaw = t.turretYaw + a
      const dx = -Math.sin(yaw)
      const dz = -Math.cos(yaw)
      out.push([`${t.id}.${game.shotCount++}`, r2(m.x), r2(m.z), r2(dx * 1000) / 1000, r2(dz * 1000) / 1000])
      muzzleFlash(m.x, m.y, m.z, dx, dz, t.color, mega)
    }
  }
  const splat = mega ? BASE.megaSplat * (1 + 0.1 * t.upgrades.big) : s.splat * (s.twin ? 0.85 : 1)
  const speed = mega ? s.shellSpeed * 0.7 : s.shellSpeed
  const range = mega ? s.range * 0.8 : s.range
  for (const [sid, x, z, dx, dz] of out) spawnShell({ sid, owner: t.id, x, z, dx, dz, speed, range, splat, bounces: mega ? 0 : s.bounces, mega, color: t.color })
  send({ t: 'f', o: t.id, m: mega ? 1 : 0, d: r2(splat), v: r2(speed), r: r2(range), b: mega ? 0 : s.bounces, s: out })
  t.recoil = 1
  sound.shoot(t === game.me ? 1 : hearing(t.pos.x, t.pos.z), mega)
}

/** Shared controls for the player and bots: drive, aim, squirt, zoom, balloon. */
function control(t, c, dt) {
  const n = now()
  t.drive(c.mx, c.mz, dt)
  t.turretYaw = c.aimYaw
  if (c.boost && n >= t.boostReadyAt) {
    t.boostUntil = n + BASE.boostTime * 1000
    t.boostReadyAt = n + BASE.boostCooldown * 1000
    if (t === game.me) sound.boost()
  }
  if (c.mega && t.stats.mega && n >= t.megaReadyAt) {
    t.megaReadyAt = n + BASE.megaCooldown * 1000
    fire(t, true)
  }
  if (c.fire && n >= t.nextFireAt) {
    t.nextFireAt = n + t.stats.reload * (n < t.rapidUntil ? 0.45 : 1) * 1000
    fire(t)
  }
  // Move, then slide off walls and other tanks.
  t.pos.x += t.vel.x * dt
  t.pos.z += t.vel.z * dt
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
  pushOut(t.pos, TANK_RADIUS)
}

// --- Player input ------------------------------------------------------------------------

const ray = new THREE.Raycaster()
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1)
const aimPoint = new THREE.Vector3()

function playerControls(me, dt) {
  const c = { mx: input.moveX, mz: input.moveZ, aimYaw: me.turretYaw, fire: input.firing, boost: input.boost, mega: input.mega }
  if (input.mouse.active && !input.touch) {
    ray.setFromCamera(new THREE.Vector2(input.mouse.x, input.mouse.y), camera)
    if (ray.ray.intersectPlane(aimPlane, aimPoint)) c.aimYaw = yawOf(aimPoint.x - me.pos.x, aimPoint.z - me.pos.z)
  } else if (input.aimStick.active) {
    c.aimYaw = me.turretYaw + angleDiff(me.turretYaw, yawOf(input.aimStick.x, input.aimStick.y)) * Math.min(1, dt * 18)
  } else if (input.touch && Math.hypot(input.moveX, input.moveZ) > 0.2) {
    // Little thumbs: with only the drive stick held, squirt paint ahead automatically.
    c.aimYaw = me.turretYaw + angleDiff(me.turretYaw, me.heading) * Math.min(1, dt * 4)
    c.fire = true
  }
  return c
}

// --- Camera ------------------------------------------------------------------------------

const camPos = new THREE.Vector3(0, 40, 40)
const camTarget = new THREE.Vector3()
let menuAngle = 0

function updateCamera(dt) {
  if (game.phase === 'menu' || game.phase === 'loading') {
    menuAngle += dt * 0.08
    camera.position.set(Math.sin(menuAngle) * 58, 34, Math.cos(menuAngle) * 58)
    camera.lookAt(0, 0, 0)
    return
  }
  const me = game.me
  if (me) {
    const look = me.alive ? 4 : 0
    camTarget.lerp(new THREE.Vector3(me.pos.x - Math.sin(me.turretYaw) * look, 0, me.pos.z - Math.cos(me.turretYaw) * look), Math.min(1, dt * 5))
  }
  const portrait = innerHeight > innerWidth
  const height = portrait ? 40 : 30
  const back = portrait ? 18 : 19
  const want = new THREE.Vector3(camTarget.x, height, camTarget.z + back)
  camPos.lerp(want, Math.min(1, dt * 6))
  camera.position.copy(camPos)
  const s = shake.amount * shake.amount
  camera.position.x += (Math.random() - 0.5) * s * 1.6
  camera.position.y += (Math.random() - 0.5) * s * 1.2
  camera.position.z += (Math.random() - 0.5) * s * 1.6
  camera.lookAt(camTarget.x, 0, camTarget.z)
  sun.position.set(camTarget.x - 30, 60, camTarget.z + 25)
  sun.target.position.set(camTarget.x, 0, camTarget.z)
}

let crossTimer = null
function crosshairHit() {
  const c = $('crosshair')
  c.classList.add('hit')
  clearTimeout(crossTimer)
  crossTimer = setTimeout(() => c.classList.remove('hit'), 120)
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
  renderer.render(scene, camera)
  input.boost = input.mega = false
  input.pick = 0
}

function battleStep(dt, n) {
  const m = game.match
  const me = game.me
  const live = n >= m.startAt && !m.over

  // Countdown.
  if (!live && !m.over) {
    const c = Math.ceil((m.startAt - n) / 1000)
    if (c !== m.countdown && c > 0) {
      m.countdown = c
      hud.banner(String(c), c === 3 ? 'Get ready…' : '', 800)
      sound.countdown()
    }
  } else if (m.countdown > 0) {
    m.countdown = 0
    hud.banner('GO! 🎨', 'Paint the floor your colour!', 1400)
    sound.countdown(true)
    announce('Go! Paint the floor!')
  }

  // Our tank and (on the host) the bots.
  if (me?.alive && live) control(me, playerControls(me, dt), dt)
  else if (me) me.vel.x = me.vel.z = 0
  if (isHost() && live) {
    for (const t of game.tanks.values()) {
      if (!t.bot || !t.alive) continue
      const brain = game.brains.get(t.id) ?? game.brains.set(t.id, newBrain()).get(t.id)
      control(t, botControls(t, brain, tankList(), game.pads, game.opts.difficulty, dt), dt)
    }
  }
  for (const t of game.tanks.values()) if (!t.local) t.follow(dt)

  // Blobs: the host's copy decides where paint lands.
  updateShells(dt, tankList(), {
    tank: (s, t) => {
      if (!isHost()) return
      const by = game.tanks.get(s.owner)
      if (s.mega) bigSplash(s.x, s.z, s.splat, by)
      else splashTank(t, by, s.sid)
    },
    barrel: (s, i) => isHost() && hostBucket(i, game.tanks.get(s.owner)),
    land: (s) => {
      if (!isHost()) return
      const by = game.tanks.get(s.owner)
      if (s.mega) bigSplash(s.x, s.z, s.splat, by)
      else hostPaint(s.x, s.z, s.splat, by)
    },
  }, hearing)

  if (isHost() && live) hostStep(dt, n)
  if (isHost() && n - game.lastPaintSend > 100) flushPaint()

  // Upgrade cards.
  if (me) {
    if (input.pick && game.offer) pickUpgrade(game.offer[input.pick - 1])
    if (pendingPoints(me) > 0 && !game.offer) game.offer = offerFor(me)
    if (pendingPoints(me) <= 0) game.offer = null
    hud.showUpgrades(game.offer, me.upgrades, pendingPoints(me), pickUpgrade)
  }

  // Network: our tank, and the host's bots.
  if (n - game.lastNet > 50) {
    game.lastNet = n
    if (me?.alive) sendFast({ t: 'p', i: me.id, x: r2(me.pos.x), z: r2(me.pos.z), h: r2(me.heading), y: r2(me.turretYaw), vx: r2(me.vel.x), vz: r2(me.vel.z), b: me.boosting ? 1 : 0 })
    if (isHost()) {
      const a = tankList().filter((t) => t.bot && t.alive).map((t) => [t.id, r2(t.pos.x), r2(t.pos.z), r2(t.heading), r2(t.turretYaw), r2(t.vel.x), r2(t.vel.z), t.boosting ? 1 : 0])
      if (a.length) sendFast({ t: 'pb', a })
    }
  }
  if (isHost() && ((game.statsDirty && n - game.lastStats > 150) || n - game.lastStats > 1000)) sendStats()

  // Visuals.
  dustT += dt
  const sorted = hud.board(tankList(), me)
  const leader = cellsOf(sorted[0]?.slot) > 0 ? sorted[0] : null
  for (const t of game.tanks.values()) {
    t.render(dt, t === leader)
    if (!t.alive) continue
    const speed = Math.hypot(t.vel.x, t.vel.z)
    if (t.boosting) boostTrail(t.pos.x + Math.sin(t.heading) * 1.4, t.pos.z + Math.cos(t.heading) * 1.4, t.color)
    else if (speed > 3 && dustT > 0.08) dust(t.pos.x + Math.sin(t.heading) * 1.2, t.pos.z + Math.cos(t.heading) * 1.2, Math.min(1, speed / 10))
  }
  if (dustT > 0.08) dustT = 0
  for (const p of game.pads) {
    if (!p.kind) continue
    p.sprite.position.y = 1.6 + Math.sin(n / 300 + p.i) * 0.25
    p.glow.position.y = p.sprite.position.y
    p.glow.scale.setScalar(1 + Math.sin(n / 200 + p.i) * 0.12)
  }

  // HUD.
  hud.timer(m.over ? 0 : Math.min(m.endsAt - n, m.endsAt - m.startAt))
  if (!game.announcedTime && m.endsAt - n < 30000 && live) {
    game.announcedTime = true
    hud.subBanner('⏱️ 30 SECONDS LEFT!', 2000)
    announce('Thirty seconds!')
  }
  if (me) hud.bars(me, cellsOf(sorted[0]?.slot ?? 0), n)
  hud.minimap(tankList(), me, game.pads)
  const ch = $('crosshair')
  const showCross = input.mouse.active && !input.touch && me?.alive
  ch.style.display = showCross ? 'block' : 'none'
  if (showCross) ch.style.transform = `translate(${((input.mouse.x + 1) / 2) * innerWidth}px, ${((1 - input.mouse.y) / 2) * innerHeight}px)`
}

function hostStep(dt, n) {
  // Wheels leave a paint trail; zooming as a Roller (or with the big brush) paints a wide stripe.
  const trail = n - game.lastTrail > 120
  if (trail) game.lastTrail = n
  for (const t of game.tanks.values()) {
    if (!t.alive) {
      if (n >= t.respawnAt && t.respawnAt) {
        t.respawnAt = 0
        const spot = pickSpawn(t)
        broadcast({ t: 'sp', i: t.id, x: spot.x, z: spot.z, h: yawOf(-spot.x, -spot.z) })
        game.statsDirty = true
      }
      continue
    }
    if (trail && Math.hypot(t.vel.x, t.vel.z) > 1) {
      const wide = n < t.rollerUntil || (t.stats.roller && t.boosting)
      hostPaint(t.pos.x, t.pos.z, wide ? Math.max(2.4, t.stats.trail * 2) : t.stats.trail, t)
    }
    for (const p of game.pads) {
      if (!p.kind || Math.hypot(p.x - t.pos.x, p.z - t.pos.z) > TANK_RADIUS + 1) continue
      if (p.kind === 'star') addXp(t, XP.star + 5 * t.level)
      broadcast({ t: 'pk', i: p.i, by: t.id, k: p.kind })
      game.statsDirty = true
    }
  }
  for (const p of game.pads) if (!p.kind && n >= p.respawnAt) broadcast({ t: 'pu', i: p.i, k: randomPickup() })
  if (n >= game.match.endsAt) endMatch()
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
  for (const c of COLORS) {
    const b = document.createElement('button')
    b.style.background = c
    b.classList.toggle('on', c === game.myColor)
    b.addEventListener('click', () => {
      game.myColor = c
      sound.click()
      renderMenu()
      hello()
    })
    $('colors').appendChild(b)
  }
  const host = isHost()
  show('host-options', host)
  show('go', host)
  show('waiting-host', !host)
  renderLobby()
}

function renderLobby() {
  const box = $('lobby')
  if (!game.room || game.room.solo) {
    box.innerHTML = ''
    return
  }
  const chips = [[game.selfId, { name: game.myName, color: game.myColor }], ...game.humans]
  box.innerHTML = `<span class="label">Room ${hud.esc(game.room.code ?? '')}</span>` + chips.map(([id, h]) => `<span class="chip" style="border-color:${h.color}">${id === game.hostId ? '👑 ' : ''}${hud.esc(h.name)}${id === game.selfId ? ' (you)' : ''}</span>`).join('')
}

function setupMenu() {
  $('reroll').addEventListener('click', () => {
    unlockAudio()
    game.myName = randomName()
    sound.click()
    renderMenu()
    hello()
  })
  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button')
      if (!b) return
      unlockAudio()
      sound.click()
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
      const key = seg.dataset.opt
      game.opts[key] = key === 'difficulty' ? b.dataset.v : Number(b.dataset.v)
    })
  }
  $('go').addEventListener('click', () => {
    unlockAudio()
    if (!isHost()) return
    hostStartMatch()
  })
  $('again').addEventListener('click', () => {
    unlockAudio()
    if (isHost()) hostStartMatch()
  })
  $('music').addEventListener('click', () => {
    $('music').classList.toggle('off', !toggleMusic())
  })
  onKey('KeyM', () => $('music').classList.toggle('off', !toggleMusic()))
  // iOS Safari only unlocks audio from certain gestures, and the sticks cancel clicks.
  for (const ev of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown']) addEventListener(ev, unlockAudio, { capture: true, passive: true })
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
  for (const t of demoTanks) t.dispose()
  demoTanks.length = 0
  show('loading', false)
  game.phase = 'menu'
  renderMenu()
  show('menu')
  if (params.has('autostart')) hostStartMatch()
  if (params.has('debug')) window.__tank = { game, hud, input, camera, addXp, setLevel, step: () => frame(), renderer }
}
const demoTanks = []

boot().catch((e) => {
  console.error(e)
  $('loading-text').textContent = '😕 Something went wrong. Reload to try again.'
})
