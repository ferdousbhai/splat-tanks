// Beach balls: big, light balls that roll when a tank nudges one or a blob hits it, bounce off walls and each
// other, and leave a paint stripe in the colour of whoever touched them last. The host rolls them and sends
// where they are; every other device glides its balls after the host's.
import * as THREE from 'three'
import { scene, pushOut, BALLS } from './world.js'
import { TANK_RADIUS, r2 } from './config.js'
import { glideTo } from './tank.js'

export const BALL_R = 1.15
const RAINBOW = ['#ff3b3b', '#ffd60a', '#2f8cff', '#22c55e']
const TOP = 16 // m/s
const KICK = 1.15 // a tank sends a ball off this many times its own speed
const WHITE = '#fbfbf6'
const geo = new THREE.SphereGeometry(BALL_R, 32, 20)

/** { x, z, vx, vz, by, color, mesh, mat, canvas, target, seen: {vx, vz}, trailAt } (trailAt: see main.js trailTo) */
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
  return { x: 0, z: 0, vx: 0, vz: 0, by: null, color: null, mesh, mat, canvas, target: null, seen: { vx: 0, vz: 0 }, trailAt: null }
}

/** Puts every ball back on its spot, still and in rainbow colours, for a new round. */
export function resetBalls() {
  while (balls.length < BALLS.length) balls.push(makeBall())
  BALLS.forEach(([x, z], i) => {
    const b = balls[i]
    Object.assign(b, { x, z, vx: 0, vz: 0, target: null, trailAt: null })
    b.seen.vx = b.seen.vz = 0
    setOwner(b, null, null)
    b.mesh.position.set(x, BALL_R, z)
  })
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
}

/** Host: a balloon or bucket bursting at (x, z) sends the balls within `radius` rolling away. Returns them. */
export function burstBalls(x, z, radius) {
  const hit = []
  for (const b of balls) {
    const d = Math.hypot(b.x - x, b.z - z)
    if (d >= radius + BALL_R) continue
    if (d > 1e-6) pushBall(b, b.x - x, b.z - z, 7 * (1 - d / (radius + BALL_R)) + 2, 12)
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

/** The ball a blob of radius r at (x, z), y high, has hit, if any. */
export function ballHit(x, z, r, y = 0) {
  if (y - r > BALL_R * 2) return null
  for (const b of balls) if ((x - b.x) ** 2 + (z - b.z) ** 2 < (BALL_R + r) ** 2) return b
  return null
}

/** Keeps a tank this device drives out of the balls; the host's step then rolls the ball away from it. */
export function blockTank(pos) {
  for (const b of balls) {
    const dx = pos.x - b.x
    const dz = pos.z - b.z
    const d = Math.hypot(dx, dz)
    const min = BALL_R + TANK_RADIUS
    if (d < min && d > 0.001) {
      pos.x = b.x + (dx / d) * min
      pos.z = b.z + (dz / d) * min
    }
  }
}

/**
 * Host: rolls the balls. A tank driving into a ball sends it off a little faster than the tank (a tank is
 * far heavier), about 8–10 m from a full-speed bump; balls slow down as they roll, bounce off walls and props, and knock each other on.
 * Returns each ball a tank pushed this step, with that tank, so the host can give it the tank's colour.
 */
export function stepBalls(dt, tanks) {
  const pos = { x: 0, z: 0 }
  for (const b of balls) {
    // Rolling slows a ball gently, then brings it to a stop.
    const s = Math.hypot(b.vx, b.vz)
    if (s > 0) {
      const k = Math.max(0, s - 0.5 * dt) * Math.exp(-dt) / s
      b.vx *= k
      b.vz *= k
    }
    b.x += b.vx * dt
    b.z += b.vz * dt
    pos.x = b.x
    pos.z = b.z
    if (pushOut(pos, BALL_R)) {
      let nx = pos.x - b.x
      let nz = pos.z - b.z
      const l = Math.hypot(nx, nz)
      if (l > 1e-6) {
        nx /= l
        nz /= l
        const vn = b.vx * nx + b.vz * nz
        if (vn < 0) {
          b.vx -= 1.6 * vn * nx
          b.vz -= 1.6 * vn * nz
        }
      }
      b.x = pos.x
      b.z = pos.z
    }
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
      const min = BALL_R + TANK_RADIUS
      // A little reach, since a tank another device drives is blocked by the ball where that device sees it.
      if (d >= min + 0.25 || d < 1e-6) continue
      const nx = dx / d
      const nz = dz / d
      const vt = t.vel.x * nx + t.vel.z * nz
      let vb = b.vx * nx + b.vz * nz
      if (d < min) {
        // Out of the tank, but at most 0.6 m a step: a friend's tank is placed a little ahead of where it was
        // last heard of, and a big jump could carry the ball through a thin wall.
        const out = Math.min(min - d, 0.6)
        b.x += nx * out
        b.z += nz * out
        // A ball rolling into a tank bounces off it (a tank is far heavier).
        if (vb < vt) {
          b.vx -= 1.5 * (vb - vt) * nx
          b.vz -= 1.5 * (vb - vt) * nz
          vb = b.vx * nx + b.vz * nz
        }
      }
      if (vt > 0.3 && vt * KICK > vb) {
        b.vx += nx * (vt * KICK - vb)
        b.vz += nz * (vt * KICK - vb)
        // A tank brushing past sideways rolls the ball along a little too.
        const side = (t.vel.x * -nz + t.vel.z * nx) * 0.3
        b.vx += -nz * side
        b.vz += nx * side
        cap(b)
        knocked.push({ b, t })
      }
    }
  }
  // A tank may have pressed a ball into a wall: back out, the way the ball came.
  for (const b of balls) {
    pos.x = b.x
    pos.z = b.z
    if (pushOut(pos, BALL_R)) {
      b.x = pos.x
      b.z = pos.z
    }
  }
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
    if (jump) Object.assign(b, { x, z, vx, vz })
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
    if (!host && b.target) {
      glideTo(b, b.target, dt, 6, 12)
      // Carried on by its speed, a ball the host has just bounced off a wall would show inside it for a moment.
      pushOut(b, BALL_R)
      b.vx = b.target.vx
      b.vz = b.target.vz
    }
    const dx = b.x - b.mesh.position.x
    const dz = b.z - b.mesh.position.z
    const d = Math.hypot(dx, dz)
    if (d > 1e-4 && d < 6) {
      // Rolling along (dx, dz) turns the ball about the axis up × direction.
      spin.setFromAxisAngle(axis.set(dz / d, 0, -dx / d), d / BALL_R)
      b.mesh.quaternion.premultiply(spin)
    }
    b.mesh.position.set(b.x, BALL_R, b.z)
    const jolt = Math.hypot(b.vx - b.seen.vx, b.vz - b.seen.vz)
    if (jolt > 2.5) onBump?.(b, Math.min(1, jolt / 10))
    b.seen.vx = b.vx
    b.seen.vz = b.vz
  }
}
