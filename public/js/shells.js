// Paint blobs: every device flies every blob for the visuals; the host's copy decides where paint lands.
import * as THREE from 'three'
import { scene, shellObstacle } from './world.js'
import { TANK_RADIUS } from './config.js'
import { splash, sparks, shellTrail, nearCamera } from './fx.js'
import { sound } from './audio.js'
import { yawOf, view } from './tank.js'
import { ballHit } from './balls.js'

const blobGeo = new THREE.SphereGeometry(0.32, 14, 10).scale(1, 1, 1.35)
const shineGeo = new THREE.SphereGeometry(0.1, 8, 6)
const balloonGeo = new THREE.SphereGeometry(0.75, 18, 14).scale(1, 1.15, 1)
const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const blobMats = new Map() // one material per paint colour, shared by every blob
const ghostMats = new Map() // see-through, for your own blobs seen from the driver's seat
const blobMat = (color) => blobMats.get(color) ?? blobMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.2 })).get(color)
const ghostMat = (color) => ghostMats.get(color) ?? ghostMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.2, transparent: true, opacity: 0.45, depthWrite: false })).get(color)

const shells = new Map()

/**
 * opts: { sid, owner, x, z, dx, dz, speed, range, splat, bounces, mega, color, bot }
 */
export function spawnShell(o) {
  if (shells.has(o.sid)) return
  const group = new THREE.Group()
  // Your own, seen from the driver's seat, are see-through with no shine or shadow (hideNear).
  const ghost = o.owner === view.seatTank
  const blob = new THREE.Mesh(o.mega ? balloonGeo : blobGeo, (ghost ? ghostMat : blobMat)(o.color))
  group.add(blob)
  if (!ghost) {
    const shine = new THREE.Mesh(shineGeo, shineMat)
    shine.position.set(-0.12, 0.14, 0.05).multiplyScalar(o.mega ? 2.4 : 1)
    shine.scale.setScalar(o.mega ? 2 : 1)
    blob.castShadow = true
    group.add(shine)
  }
  group.position.set(o.x, NOZZLE_Y, o.z)
  group.rotation.order = 'YXZ' // turn to the heading, then tip along the arc
  group.rotation.y = yawOf(o.dx, o.dz)
  scene.add(group)
  // A real lob: the farther it is thrown, the higher it flies, and it comes down on the floor at its range.
  const s = { ...o, life: o.range / o.speed, t: 0, mesh: group, blob, trail: 0, r: o.mega ? 0.5 : 0.25, apex: 0.4 + o.range * 0.06 }
  hideNear(s)
  shells.set(o.sid, s)
}

/** How high blobs leave the nozzle, and land (the floor's paint); main.js aims the mouse at LAND_Y. */
const NOZZLE_Y = 1.1
export const LAND_Y = 0.25

/** A blob's height at fraction k of its flight: a parabola from the nozzle down to the floor, `apex` above the line. */
const arcY = (apex, k) => NOZZLE_Y - (NOZZLE_Y - LAND_Y) * k + 4 * apex * k * (1 - k)

/**
 * A blob leaving the nozzle right by the driver's seat camera would fill the view, so it shows once clear. Your
 * own, which climb through the middle of the view on their way out, show from 6 m and see-through.
 */
function hideNear(s) {
  const p = s.mesh.position
  s.mesh.visible = !nearCamera(p.x, p.y, p.z, s.owner === view.seatTank ? 6 : s.mega ? 3 : 1.5)
}

/** Hides blobs by the camera once it has moved into the driver's seat. */
export function hideNearCamera() {
  for (const s of shells.values()) hideNear(s)
}

/** ground: the height of what it splashes on (the top of a prop it came down onto; else the floor). */
export function removeShell(sid, fx = true, ground = 0) {
  const s = shells.get(sid)
  if (!s) return
  shells.delete(sid)
  scene.remove(s.mesh)
  if (fx) splash(s.x, s.z, s.mega ? 2.5 : 0.8, s.color, ground)
}

export function clearShells() {
  for (const sid of shells.keys()) removeShell(sid, false)
}

/**
 * Moves every blob. Calls hooks.tank(blob, tank) when it splats a tank, hooks.barrel(blob, index)
 * when it hits a paint bucket, hooks.ball(blob, ball) when it hits a beach ball, and hooks.land(blob) when it
 * splats on a wall or the floor.
 * hearing(x, z, owner) returns { vol: 0..1, mine } for sounds.
 */
export function updateShells(dt, tanks, hooks, hearing) {
  for (const s of shells.values()) {
    // Flies only the time it has left, so it comes down exactly at its range whatever the frame rate.
    const t0 = s.t
    const fly = Math.min(dt, Math.max(0, s.life - t0))
    s.t += dt
    // Sub-step fast shells so they can't skip through thin walls.
    const steps = Math.max(1, Math.ceil((s.speed * fly) / 0.6))
    const h = fly / steps
    let done = false
    for (let i = 0; i < steps && !done; i++) {
      const ox = s.x
      const oz = s.z
      s.x += s.dx * s.speed * h
      s.z += s.dz * s.speed * h
      // A lob flies over props lower than it, such as a wall it clears in the middle of its flight. Tanks and balls
      // are hit at any height, like paint buckets: a squirt along the ground (a stick, the keys, the driver's
      // seat, a robot) always flies its whole range, and would otherwise sail over a tank 4.5–15 m away.
      const y = arcY(s.apex, Math.min(1, (t0 + h * (i + 1)) / s.life))
      const hit = shellObstacle(s.x, s.z, ox, oz, s.r, y)
      if (hit) {
        if (hit.barrel !== undefined) {
          hooks.barrel?.(s, hit.barrel)
          removeShell(s.sid)
          done = true
          break
        }
        const dot = s.dx * hit.nx + s.dz * hit.nz
        // Bounces off a side it is flying into; one landing on top of something (a zero normal) just splats there.
        if (s.bounces > 0 && !s.mega && dot < 0) {
          s.bounces--
          s.dx -= 2 * dot * hit.nx
          s.dz -= 2 * dot * hit.nz
          s.x = ox
          s.z = oz
          s.owner2 = true // a bounced shell can hit its own tank
          sparks(s.x, s.z, s.color, 4)
          const ear = hearing(s.x, s.z, s.owner)
          sound.bounce(ear.vol, ear.mine)
          s.mesh.rotation.y = yawOf(s.dx, s.dz)
          continue
        }
        hooks.land?.(s)
        removeShell(s.sid, true, hit.ground)
        const ear = hearing(s.x, s.z, s.owner)
        sound.splat(ear.vol * 0.6, ear.mine)
        done = true
        break
      }
      for (const t of tanks) {
        if (!t.alive || (t.id === s.owner && !s.owner2)) continue
        const dx = t.pos.x - s.x
        const dz = t.pos.z - s.z
        if (dx * dx + dz * dz < (TANK_RADIUS + s.r) ** 2) {
          hooks.tank?.(s, t)
          removeShell(s.sid)
          done = true
          break
        }
      }
      // A robot's blob flies past the beach balls: they are left for the children.
      const ball = !done && !s.bot && ballHit(s.x, s.z, s.r)
      if (ball) {
        hooks.ball?.(s, ball)
        removeShell(s.sid)
        const ear = hearing(s.x, s.z, s.owner)
        sound.splat(ear.vol * 0.6, ear.mine)
        done = true
      }
    }
    if (done) continue
    if (s.t > s.life) {
      hooks.land?.(s)
      removeShell(s.sid)
      const ear = hearing(s.x, s.z, s.owner)
      sound.splat(ear.vol * 0.5, ear.mine)
      continue
    }
    // Up from the nozzle and down onto the floor at the end of its range, tipped along its path and
    // stretched a little by its speed, like a real drop of paint.
    const k = s.t / s.life
    s.mesh.position.set(s.x, arcY(s.apex, k), s.z)
    const climb = (LAND_Y - NOZZLE_Y + 4 * s.apex * (1 - 2 * k)) / s.range // the slope of arcY over the ground
    s.mesh.rotation.x = Math.atan(climb)
    if (!s.mega) s.blob.scale.set(0.9, 0.9, 1 + Math.min(0.35, Math.abs(climb) * 0.4))
    hideNear(s)
    s.trail += dt
    if (s.trail > 0.04 && s.mesh.visible) {
      s.trail = 0
      shellTrail(s.x, s.mesh.position.y, s.z, s.color, s.mega)
    }
    if (s.mega) s.mesh.rotation.z = Math.sin(s.t * 12) * 0.3
  }
}
