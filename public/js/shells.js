// Paint blobs: every device flies every blob for the visuals; the host's copy decides where paint lands.
import * as THREE from 'three'
import { scene, shellObstacle } from './world.js'
import { TANK_RADIUS } from './config.js'
import { splash, sparks, shellTrail } from './fx.js'
import { sound } from './audio.js'

const blobGeo = new THREE.SphereGeometry(0.32, 14, 10).scale(1, 1, 1.35)
const shineGeo = new THREE.SphereGeometry(0.1, 8, 6)
const balloonGeo = new THREE.SphereGeometry(0.75, 18, 14).scale(1, 1.15, 1)

export const shells = new Map()

/**
 * opts: { sid, owner, x, z, dx, dz, speed, range, splat, bounces, mega, color }
 */
export function spawnShell(o) {
  if (shells.has(o.sid)) return
  const group = new THREE.Group()
  const blob = new THREE.Mesh(o.mega ? balloonGeo : blobGeo, new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.2 }))
  const shine = new THREE.Mesh(shineGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  shine.position.set(-0.12, 0.14, 0.05).multiplyScalar(o.mega ? 2.4 : 1)
  shine.scale.setScalar(o.mega ? 2 : 1)
  blob.castShadow = true
  group.add(blob, shine)
  group.position.set(o.x, 1.1, o.z)
  group.rotation.y = Math.atan2(-o.dx, -o.dz)
  scene.add(group)
  shells.set(o.sid, { ...o, px: o.x, pz: o.z, life: o.range / o.speed, t: 0, mesh: group, trail: 0, r: o.mega ? 0.5 : 0.25 })
}

export function removeShell(sid, fx = true) {
  const s = shells.get(sid)
  if (!s) return null
  shells.delete(sid)
  scene.remove(s.mesh)
  s.mesh.traverse((m) => m.material?.dispose())
  if (fx) splash(s.x, s.z, s.mega ? 2.5 : 0.8, s.color)
  return s
}

export function clearShells() {
  for (const sid of [...shells.keys()]) removeShell(sid, false)
}

/**
 * Moves every blob. Calls hooks.tank(blob, tank) when it splats a tank, hooks.barrel(blob, index)
 * when it hits a paint bucket, and hooks.land(blob) when it splats on a wall or the floor.
 * hearing(x, z) returns 0..1 volume for sounds.
 */
export function updateShells(dt, tanks, hooks, hearing) {
  for (const s of [...shells.values()]) {
    s.t += dt
    s.px = s.x
    s.pz = s.z
    // Sub-step fast shells so they can't skip through thin walls.
    const steps = Math.ceil((s.speed * dt) / 0.6)
    const h = dt / steps
    let done = false
    for (let i = 0; i < steps && !done; i++) {
      const ox = s.x
      const oz = s.z
      s.x += s.dx * s.speed * h
      s.z += s.dz * s.speed * h
      const hit = shellObstacle(s.x, s.z, ox, oz, s.r)
      if (hit) {
        if (hit.barrel !== undefined) {
          hooks.barrel?.(s, hit.barrel)
          removeShell(s.sid)
          done = true
          break
        }
        if (s.bounces > 0 && !s.mega) {
          s.bounces--
          const dot = s.dx * hit.nx + s.dz * hit.nz
          s.dx -= 2 * dot * hit.nx
          s.dz -= 2 * dot * hit.nz
          s.x = ox
          s.z = oz
          s.owner2 = true // a bounced shell can hit its own tank
          sparks(s.x, s.z, s.color, 4)
          sound.bounce(hearing(s.x, s.z))
          s.mesh.rotation.y = Math.atan2(-s.dx, -s.dz)
          continue
        }
        hooks.land?.(s)
        removeShell(s.sid)
        sound.splat(hearing(s.x, s.z) * 0.6)
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
    }
    if (done) continue
    if (s.t > s.life) {
      hooks.land?.(s)
      removeShell(s.sid)
      sound.splat(hearing(s.x, s.z) * 0.5)
      continue
    }
    // A little lob: up, then down onto the floor at the end of its range.
    const k = s.t / s.life
    s.mesh.position.set(s.x, 1.1 + 2.4 * k * (1 - k) - 0.8 * k * k, s.z)
    s.trail += dt
    if (s.trail > 0.04) {
      s.trail = 0
      shellTrail(s.x, s.mesh.position.y, s.z, s.color, s.mega)
    }
    if (s.mega) s.mesh.rotation.z = Math.sin(s.t * 12) * 0.3
  }
}
