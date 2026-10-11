// Beach balls: big, light balls that roll when a tank nudges one or a blob hits it, bounce off walls and each
// other, and leave a paint stripe in the colour of whoever touched them last. The host rolls them and sends
// where they are; every other device glides its balls after the host's.
import * as THREE from 'three'
import { scene, pushOut, BALLS } from './world.js'
import { ARENA, TANK_RADIUS, r2 } from './config.js'
import { glideTo } from './tank.js'

export const BALL_R = 1.15
const RAINBOW = ['#ff3b3b', '#ffd60a', '#2f8cff', '#22c55e']
const TOP = 16 // m/s
const KICK = 1.15 // a tank sends a ball off this many times its own speed
const WHITE = '#fbfbf6'
const PROBE = 0.3 // metres a pushed ball is tried along the push, to see what's in its way (tryRoll)
const STUCK = 0.3 // getting less than this share of PROBE along a push, it is stuck: it rests and the tank stops
const CRAWL = 0.5 // m/s: slower than this along a wall, a pushed ball just rests
const STILL = 0.05 // m/s: slower than this, a ball has come to rest
const EDGE = 4 // metres by the outer wall where a ball rolls back into play, as if the floor rose there
const RISE = 2.5 // m/s² it rolls back with: beats rolling's slowing up to about 2 m/s, a brisk walk
const LEFT_FOR = 500 // ms after a tank was last by it before a still ball against a wall or prop rolls off it
const ROLL_OFF = 2 // m/s it rolls off with, which carries it about a metre clear
const SNAP = 6 // metres: further off than this, a friend's ball jumps to the host's spot instead of rolling there
const TOUCH = 0.05 // metres: this close to a wall or prop, a ball is touching it
const REACH = BALL_R + TANK_RADIUS // centre to centre, a tank touching a ball
const geo = new THREE.SphereGeometry(BALL_R, 32, 20)

/** { x, z, vx, vz, by, color, mesh, mat, canvas, target, seen: {vx, vz, d}, trailAt, touchedAt, rolledOff } (trailAt: see main.js trailTo; touchedAt: when a tank was last within reach of it, host's clock; rolledOff: it has rolled off a wall since it was last pushed) */
export const balls = []

/** Beach ball gores round the middle, in one colour and white (or the rainbow before anyone has touched it). */
function drawBall(b, colors) {
  const g = b.canvas.getContext('2d')
  const W = b.canvas.width
  const H = b.canvas.height
  const n = 8
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? WHITE : colors[(i / 2) % colors.length]
    g.fillRect((i * W) / n, 0, W / n + 1, H)
  }
  // White caps at the poles, as on a real beach ball.
  g.fillStyle = WHITE
  g.fillRect(0, 0, W, H * 0.1)
  g.fillRect(0, H * 0.9, W, H * 0.1)
  b.mat.map.needsUpdate = true
}

function makeBall() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.3, metalness: 0 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  scene.add(mesh)
  return { x: 0, z: 0, vx: 0, vz: 0, by: null, color: null, mesh, mat, canvas, target: null, seen: { vx: 0, vz: 0, d: 0 }, trailAt: null, touchedAt: 0, rolledOff: false }
}

/** Puts every ball back on its spot, still and in rainbow colours, for a new round. */
export function resetBalls() {
  while (balls.length < BALLS.length) balls.push(makeBall())
  BALLS.forEach(([x, z], i) => {
    const b = balls[i]
    placeBall(b, x, z)
    Object.assign(b, { target: null, trailAt: null, touchedAt: 0, rolledOff: false })
    setOwner(b, null, null)
  })
}

/** Puts a ball somewhere outright, mesh and all, as if it had been rolling like that all along: no spin or bonk. */
function placeBall(b, x, z, vx = 0, vz = 0) {
  Object.assign(b, { x, z, vx, vz })
  b.mesh.position.set(x, BALL_R, z)
  Object.assign(b.seen, { vx, vz, d: 0 })
}

/** The tank that touched the ball last: its stripes and the paint it leaves take that tank's colour. */
export function setOwner(b, id, color) {
  b.by = id
  if (color === b.color && b.color !== null) return
  b.color = color
  drawBall(b, color ? [color] : RAINBOW)
}

/** A shove of `power` m/s along (dx, dz), but never past `upTo` m/s that way. */
function pushBall(b, dx, dz, power, upTo = TOP) {
  const l = Math.hypot(dx, dz) || 1
  const nx = dx / l
  const nz = dz / l
  const add = Math.max(0, Math.min(power, upTo - (b.vx * nx + b.vz * nz)))
  b.vx += nx * add
  b.vz += nz * add
  cap(b)
}

/** Host: a blob knocks a ball along (dx, dz): a nudge each, never past a gentle roll. */
export function squirtBall(b, dx, dz) {
  pushBall(b, dx, dz, 2.5, 8)
  b.rolledOff = false // knocked somewhere new, it may roll off a wall there
}

/** Host: a balloon or bucket bursting at (x, z) sends the balls within `radius` rolling away. Returns them. */
export function burstBalls(x, z, radius) {
  const hit = []
  for (const b of balls) {
    const d = Math.hypot(b.x - x, b.z - z)
    if (d >= radius + BALL_R) continue
    if (d > 1e-6) pushBall(b, b.x - x, b.z - z, 7 * (1 - d / (radius + BALL_R)) + 2, 12)
    b.rolledOff = false
    hit.push(b)
  }
  return hit
}

function cap(b) {
  const s = Math.hypot(b.vx, b.vz)
  if (s > TOP) {
    b.vx *= TOP / s
    b.vz *= TOP / s
  }
}

/** The ball a blob of radius r at (x, z) has hit, if any. */
export function ballHit(x, z, r) {
  for (const b of balls) if ((x - b.x) ** 2 + (z - b.z) ** 2 < (BALL_R + r) ** 2) return b
  return null
}

/**
 * Keeps a tank this device drives out of the balls; the host's step then rolls the ball away from it. Returns true
 * if a ball it was kept out of can hardly move on (blocked: a wall, corner, narrow gap or stuck ball beyond it), so for
 * now that ball stops the tank like a wall.
 */
export function blockTank(p) {
  let held = false
  for (const b of balls) {
    const dx = p.x - b.x
    const dz = p.z - b.z
    const d = Math.hypot(dx, dz)
    if (d < REACH && d > 0.001) {
      p.x = b.x + (dx / d) * REACH
      p.z = b.z + (dz / d) * REACH
      held ||= blocked(b, -dx / d, -dz / d)
    }
  }
  return held
}

const pos = { x: 0, z: 0 } // scratch
const from = { x: 0, z: 0 } // scratch: where tryRoll starts
const away = { x: 0, z: 0 } // scratch: awayFrom's answer
const fit = { x: 0, z: 0 } // scratch: tryRoll's check that the ball fits where it ends

/**
 * Pushes a ball-sized point (radius r) clear of walls and props. pushOut leaves each in turn, so in a gap between
 * two, leaving one can put it into the other: a few passes settle it. Returns true if it touched any.
 */
function settle(p, r = BALL_R) {
  let hit = false
  for (let i = 0; i < 4 && pushOut(p, r); i++) hit = true
  return hit
}

/**
 * If a ball (taken as radius r) overlaps a wall or prop, the way out of it: a unit direction (in `away`), with the
 * settled spot in `pos`. Otherwise null.
 */
function awayFrom(b, r = BALL_R) {
  pos.x = b.x
  pos.z = b.z
  if (!settle(pos, r)) return null
  const ox = pos.x - b.x
  const oz = pos.z - b.z
  const l = Math.hypot(ox, oz)
  if (l < 1e-6) return null
  away.x = ox / l
  away.z = oz / l
  return away
}

/** Moves a ball out of walls and props, bouncing off what it was rolling into. Returns true if it touched one. */
function offWalls(b) {
  const n = awayFrom(b)
  if (!n) return false
  const vn = b.vx * n.x + b.vz * n.z
  if (vn < 0) {
    b.vx -= 1.6 * vn * n.x
    b.vz -= 1.6 * vn * n.z
  }
  b.x = pos.x
  b.z = pos.z
  return true
}

/**
 * Tries moving a ball PROBE along (dx, dz) (a unit direction) among the walls and props, as it would roll, from where
 * it sits clear of them: returns how far it got along (dx, dz), and leaves the start in `from` and the end in `pos`
 * (both the start when it is stuck: another ball stops it, or nowhere it ends does a ball fit). Asking the walls this
 * way, rather than which way they face, also catches a corner and a gap narrower than the ball.
 */
function tryRoll(b, dx, dz, chain = balls.length) {
  // Another ball just ahead that is stuck itself (a chain of balls pushed into a wall) stops this one too, as far
  // along the chain as there are balls. Asked first, so this ball's own answer is what the scratch holds after.
  let stopped = false
  if (chain > 0) {
    for (const o of balls) {
      const ox = o.x - b.x
      const oz = o.z - b.z
      // (Ahead and in its path: not behind it, and not off to the side where the push would pass it by.)
      if (o === b || ox * ox + oz * oz > (BALL_R * 2 + PROBE) ** 2 || ox * dx + oz * dz <= 0) continue
      if (Math.abs(ox * dz - oz * dx) >= BALL_R * 2) continue
      if (tryRoll(o, dx, dz, chain - 1) < PROBE * STUCK) {
        stopped = true
        break
      }
    }
  }
  from.x = b.x
  from.z = b.z
  settle(from)
  pos.x = from.x
  pos.z = from.z
  if (stopped) return 0
  pos.x += dx * PROBE
  pos.z += dz * PROBE
  settle(pos)
  // Nowhere there that a ball fits (a V between a wall and a rock narrower than the ball, which a slide along the
  // wall would otherwise get into): it is stuck.
  fit.x = pos.x
  fit.z = pos.z
  // (More than a centimetre: a settled ball can still be nudged by a hair.)
  if (pushOut(fit, BALL_R) && Math.hypot(fit.x - pos.x, fit.z - pos.z) > 0.01) {
    pos.x = from.x
    pos.z = from.z
    return 0
  }
  return (pos.x - from.x) * dx + (pos.z - from.z) * dz
}

/** True if a ball pushed along (dx, dz) is stuck: a wall, a corner, a narrow gap or a stuck ball is in its way. */
const blocked = (b, dx, dz) => tryRoll(b, dx, dz) < PROBE * STUCK

/**
 * Host: rolls the balls. A tank driving into a ball sends it off a little faster than the tank (a tank is
 * far heavier), about 8–10 m from a full-speed bump; balls slow down as they roll, bounce off walls and props,
 * and knock each other on.
 * Returns each ball a tank pushed this step, with that tank, so the host can give it the tank's colour.
 */
export function stepBalls(dt, tanks) {
  const now = performance.now()
  for (const b of balls) {
    // Rolling slows a ball gently, then brings it to a stop.
    const s = Math.hypot(b.vx, b.vz)
    if (s > 0) {
      const k = Math.max(0, s - 0.5 * dt) * Math.exp(-dt) / s
      b.vx *= k
      b.vz *= k
    }
    if (Math.abs(b.x) > ARENA - EDGE) b.vx -= Math.sign(b.x) * RISE * dt
    if (Math.abs(b.z) > ARENA - EDGE) b.vz -= Math.sign(b.z) * RISE * dt
    // Left still against a wall or prop (or in a corner or a gap) once tanks have gone, a ball rolls gently off it
    // about a metre, so none is stuck for good where a tank can't push it out; once each time tanks leave it, so
    // between two props it doesn't roll to and fro. (Only a ball really touching one: the way out of a near miss
    // between two props can point back at either.)
    if (!b.rolledOff && s < STILL && now - b.touchedAt > LEFT_FOR) {
      const n = awayFrom(b, BALL_R + TOUCH)
      if (n) {
        b.vx = n.x * ROLL_OFF
        b.vz = n.z * ROLL_OFF
        b.rolledOff = true
      }
    }
    b.x += b.vx * dt
    b.z += b.vz * dt
    offWalls(b)
  }
  // Ball against ball: equal weights, so they trade the speed along the line between them.
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i]
      const c = balls[j]
      const dx = c.x - a.x
      const dz = c.z - a.z
      const d = Math.hypot(dx, dz)
      if (d >= BALL_R * 2 || d < 1e-6) continue
      const nx = dx / d
      const nz = dz / d
      const push = (BALL_R * 2 - d) / 2
      a.x -= nx * push
      a.z -= nz * push
      c.x += nx * push
      c.z += nz * push
      const rel = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz
      if (rel > 0) {
        const j2 = rel * 0.95
        a.vx -= j2 * nx
        a.vz -= j2 * nz
        c.vx += j2 * nx
        c.vz += j2 * nz
        // A rainbow ball knocked by a coloured one takes its colour.
        if (c.by === null && a.by !== null) setOwner(c, a.by, a.color)
        else if (a.by === null && c.by !== null) setOwner(a, c.by, c.color)
      }
    }
  }
  const knocked = []
  for (const t of tanks) {
    if (!t.alive) continue
    for (const b of balls) {
      const dx = b.x - t.pos.x
      const dz = b.z - t.pos.z
      const d = Math.hypot(dx, dz)
      // A little reach, since a tank another device drives is blocked by the ball where that device sees it.
      if (d >= REACH + 0.25 || d < 1e-6) continue
      const nx = dx / d
      const nz = dz / d
      b.touchedAt = now // a tank by it: it doesn't roll off a wall meanwhile
      // A tank this device drives pushes with its tracks (it shows no speed into a ball held against a wall); a
      // friend's tank with the speed it was sent.
      const push = t.local ? t.trackVel : t.vel
      const vt = push.x * nx + push.z * nz
      const shown = t.vel.x * nx + t.vel.z * nz
      let vb = b.vx * nx + b.vz * nz
      if (d < REACH) {
        // Out of the tank, but at most 0.6 m a step: a friend's tank is placed a little ahead of where it was
        // last heard of, and a big jump could carry the ball through a thin wall.
        const out = Math.min(REACH - d, 0.6)
        b.x += nx * out
        b.z += nz * out
        // A ball rolling into a tank bounces off it (a tank is far heavier).
        if (vb < shown) {
          b.vx -= 1.5 * (vb - shown) * nx
          b.vz -= 1.5 * (vb - shown) * nz
          vb = b.vx * nx + b.vz * nz
        }
      }
      const kick = vt * KICK
      const pushing = vt > 0.3 // a real push, not the ball resting against (or rolling up to) a parked tank
      // Pushed again, it may roll off a wall again once left.
      if (pushing) b.rolledOff = false
      if (pushing && kick > vb) {
        b.vx += nx * (kick - vb)
        b.vz += nz * (kick - vb)
        // A tank brushing past sideways rolls the ball along a little too.
        const side = (push.x * -nz + push.z * nx) * 0.3
        b.vx += -nz * side
        b.vz += nx * side
        // Stuck (pushed straight into a wall or prop, into a corner, a gap narrower than itself or a stuck ball), it
        // rests there, held, until the tank backs off or comes from the side; the tank stops against it meanwhile,
        // by the same test along the same line (blockTank). Otherwise, with something in its way, it can only roll
        // on the way it is free to (along the wall), and no faster than the push sends it; a crawl just rests.
        const sp = Math.hypot(b.vx, b.vz)
        if (blocked(b, nx, nz)) b.vx = b.vz = 0
        else if (sp > 1e-6 && tryRoll(b, b.vx / sp, b.vz / sp) < PROBE - 1e-3) {
          const free = Math.hypot(pos.x - from.x, pos.z - from.z)
          const k = free < 1e-6 ? 0 : Math.min(kick, (sp * free) / PROBE) / free
          b.vx = (pos.x - from.x) * k
          b.vz = (pos.z - from.z) * k
          if (Math.hypot(b.vx, b.vz) < CRAWL) b.vx = b.vz = 0
        }
        cap(b)
        knocked.push({ b, t })
      }
    }
  }
  // A tank may have pressed a ball into a wall or prop: move it back out.
  for (const b of balls) offWalls(b)
  return knocked
}

/** The host's balls on the wire: [x, z, vx, vz, toucher id or 0] each. */
export const ballState = () => balls.map((b) => [r2(b.x), r2(b.z), r2(b.vx), r2(b.vz), b.by ?? 0])
export const ballsMoving = () => balls.some((b) => b.vx * b.vx + b.vz * b.vz > 0.01)

/**
 * Another device: the host's latest word on where each ball is. colorOf(id) gives a toucher's colour. jump: put
 * the balls straight there (joining a round) instead of gliding.
 */
export function takeBallState(a, colorOf, jump = false) {
  a.forEach(([x, z, vx, vz, by], i) => {
    const b = balls[i]
    if (!b) return
    b.target = { x, z, vx, vz, t: performance.now() }
    if (jump) placeBall(b, x, z, vx, vz)
    if ((by || null) !== b.by) setOwner(b, by || null, by ? colorOf(by) : null)
  })
}

const axis = new THREE.Vector3()
const spin = new THREE.Quaternion()

/**
 * Moves the meshes: on other devices the balls first glide after the host's. Each ball turns as far as it
 * rolled, so it really rolls. onBump(ball, strength) is called when a ball's speed changes sharply.
 */
export function renderBalls(dt, host, onBump) {
  for (const b of balls) {
    let jumped = false
    if (!host && b.target) {
      jumped = glideTo(b, b.target, dt, SNAP, 12)
      // Carried on by its speed, a ball the host has just bounced off a wall would show inside it for a moment.
      settle(b)
      b.vx = b.target.vx
      b.vz = b.target.vz
    }
    const dx = b.x - b.mesh.position.x
    const dz = b.z - b.mesh.position.z
    const d = Math.hypot(dx, dz)
    if (d > 1e-4 && !jumped) {
      // Rolling along (dx, dz) turns the ball about the axis up × direction.
      spin.setFromAxisAngle(axis.set(dz / d, 0, -dx / d), d / BALL_R)
      b.mesh.quaternion.premultiply(spin)
    }
    b.mesh.position.set(b.x, BALL_R, b.z)
    // Only a ball that really moves bonks (faster than 0.6 m/s): one held against a wall doesn't drum. And only a
    // real knock: a tank topping up a ball it is already pushing along changes its speed a little for how fast it
    // is going, four times a second, which would make a steady drum while dribbling.
    const jolt = Math.hypot(b.vx - b.seen.vx, b.vz - b.seen.vz)
    const fast = Math.max(Math.hypot(b.vx, b.vz), Math.hypot(b.seen.vx, b.seen.vz))
    // (Moving this frame or the last: the frame a ball reaches a wall, it may only cover the last bit to it. Not the
    // frame a ball jumps SNAP or more to where the host says it is: it didn't roll there.)
    if (!jumped && jolt > Math.max(2.5, 0.4 * fast) && Math.max(d, b.seen.d) > 0.6 * dt) onBump?.(b, Math.min(1, jolt / 10))
    b.seen.d = jumped ? 0 : d
    b.seen.vx = b.vx
    b.seen.vz = b.vz
  }
}
