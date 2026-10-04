// A tank: its numbers (level, upgrades) and its Blender model, tinted in the player's colour.
import * as THREE from 'three'
import { scene, models } from './world.js'
import { BASE, TANK_RADIUS, emptyLoadout, statsFor, tierFor } from './config.js'

/** Yaw (three.js rotation.y) that faces direction (dx, dz); models face -Z. */
export const yawOf = (dx, dz) => Math.atan2(-dx, -dz)
export const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
export const angleDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function fallbackTank(tier) {
  const root = new THREE.Group()
  const s = 0.9 + tier * 0.1
  const tint = new THREE.MeshStandardMaterial({ color: '#fff', name: 'tint' })
  tint.name = 'tint'
  const dark = new THREE.MeshStandardMaterial({ color: '#333' })
  const hull = new THREE.Group()
  hull.name = 'hull'
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7 * s, 0.7, 2.5 * s), tint)
  body.position.y = 0.75
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 2.7 * s), dark)
  tl.position.set(-0.95 * s, 0.4, 0)
  const tr = tl.clone()
  tr.position.x *= -1
  hull.add(body, tl, tr)
  const turret = new THREE.Group()
  turret.name = 'turret'
  turret.position.y = 1.15
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6 * s, 0.7 * s, 0.5, 10), tint))
  const barrels = tier >= 4 ? [['barrel_L', 'muzzle_L', -0.3], ['barrel_R', 'muzzle_R', 0.3]] : [['barrel', 'muzzle', 0]]
  for (const [bn, mn, x] of barrels) {
    const barrel = new THREE.Group()
    barrel.name = bn
    barrel.position.set(x, 0.05, -0.3)
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.6 * s, 8), dark)
    tube.rotation.x = Math.PI / 2
    tube.position.z = -0.8 * s
    barrel.add(tube)
    const muzzle = new THREE.Object3D()
    muzzle.name = mn
    muzzle.position.z = -1.6 * s
    barrel.add(muzzle)
    turret.add(barrel)
  }
  root.add(hull, turret)
  root.traverse((o) => o.isMesh && (o.castShadow = true))
  return root
}

function labelTexture(text, sub, color) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')
  g.font = '800 54px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 10
  g.strokeStyle = 'rgba(0,0,0,0.75)'
  g.strokeText(text, 256, 46)
  g.fillStyle = '#fff'
  g.fillText(text, 256, 46)
  g.font = '800 40px system-ui, sans-serif'
  g.strokeText(sub, 256, 102)
  g.fillStyle = color
  g.fillText(sub, 256, 102)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

let crownTex = null
function crownTexture() {
  if (crownTex) return crownTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.font = '100px serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('👑', 64, 72)
  crownTex = new THREE.CanvasTexture(c)
  return crownTex
}

export class Tank {
  constructor({ id, name, color, slot = 0, bot = false, local = false }) {
    Object.assign(this, { id, name, color, slot, bot, local })
    this.level = 1
    this.xp = 0
    this.upgrades = emptyLoadout()
    this.stats = statsFor(1, this.upgrades)
    this.alive = false
    this.respawnAt = 0
    this.rapidUntil = 0
    this.rollerUntil = 0
    this.paintColor = new THREE.Color(color) // the last colour that splashed this tank
    this.paintT = 0 // 1 right after a splash, wearing off to 0
    this.pos = { x: 0, z: 0 }
    this.vel = { x: 0, z: 0 }
    this.heading = 0
    this.turretYaw = 0
    this.boostUntil = 0
    this.boostReadyAt = 0
    this.megaReadyAt = 0
    this.nextFireAt = 0
    this.target = null // remote: last network state
    this.flash = 0
    this.recoil = 0
    this.tilt = 0
    this.tier = 0

    this.root = new THREE.Group()
    this.root.visible = false
    scene.add(this.root)
    this.body = new THREE.Group() // tilts on acceleration
    this.root.add(this.body)
    this.tintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 })

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }))
    this.label.renderOrder = 10
    this.label.scale.set(4.4, 1.1, 1)
    this.crown = new THREE.Sprite(new THREE.SpriteMaterial({ map: crownTexture(), depthTest: false, transparent: true }))
    this.crown.scale.setScalar(1.4)
    this.crown.renderOrder = 12
    this.crown.visible = false
    scene.add(this.label, this.crown)

    this.setModel()
    this.refreshLabel()
  }

  get boosting() {
    return performance.now() < this.boostUntil
  }

  /** Recompute numbers after a level or upgrade change. */
  recompute() {
    this.stats = statsFor(this.level, this.upgrades)
    if (this.stats.tier !== this.tier) this.setModel()
    this.refreshLabel()
  }

  setModel() {
    const tier = tierFor(this.level).tier
    this.tier = tier
    if (this.model) this.body.remove(this.model)
    const src = models.tanks[tier] ?? fallbackTank(tier)
    this.model = src.clone(true)
    this.model.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      const swap = (m) => (m.name === 'tint' ? this.tintMat : m)
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material)
    })
    this.body.add(this.model)
    this.turret = this.model.getObjectByName('turret') ?? this.model
    this.turretBase = this.turret.rotation.y
    this.barrels = ['barrel', 'barrel_L', 'barrel_R'].map((n) => this.model.getObjectByName(n)).filter(Boolean)
    for (const b of this.barrels) b.userData.rest ??= b.position.clone()
    this.muzzleNodes = ['muzzle', 'muzzle_L', 'muzzle_R'].map((n) => this.model.getObjectByName(n)).filter(Boolean)
    if (!this.muzzleNodes.length) this.muzzleNodes = [this.turret]
    // Bigger tiers sit a little taller in the label.
    this.labelHeight = 3 + tier * 0.35
  }

  refreshLabel() {
    this.label.material.map?.dispose()
    this.label.material.map = labelTexture(this.name, `Lv ${this.level} ${tierFor(this.level).name}`, this.color)
    this.label.material.needsUpdate = true
  }

  /** World positions and directions of the muzzles. */
  muzzles() {
    this.root.updateMatrixWorld(true)
    const d = dirOf(this.turretYaw)
    return this.muzzleNodes.map((m) => {
      const p = new THREE.Vector3()
      m.getWorldPosition(p)
      return { x: p.x, y: p.y, z: p.z, dx: d.x, dz: d.z }
    })
  }

  /** Steers toward a move direction (twin-stick style) and returns the desired velocity. */
  drive(mx, mz, dt) {
    const now = performance.now()
    const len = Math.hypot(mx, mz)
    let speed = 0
    if (len > 0.1) {
      const want = yawOf(mx, mz)
      const diff = angleDiff(this.heading, want)
      // Reverse instead of doing a U-turn when the stick points behind.
      const back = Math.abs(diff) > 2.2
      const goal = back ? want + Math.PI : want
      const d = angleDiff(this.heading, goal)
      const turn = 7 * dt
      this.heading += Math.max(-turn, Math.min(turn, d))
      const align = Math.max(0.25, Math.cos(angleDiff(this.heading, goal)))
      speed = this.stats.speed * Math.min(1, len) * align * (back ? -0.75 : 1)
    }
    if (now < this.boostUntil) speed = this.stats.speed * BASE.boostSpeed * (speed < 0 ? -1 : 1)
    const f = dirOf(this.heading)
    const tx = f.x * speed
    const tz = f.z * speed
    const k = Math.min(1, dt * (now < this.boostUntil ? 10 : 7))
    const ax = (tx - this.vel.x) * k
    const az = (tz - this.vel.z) * k
    this.vel.x += ax
    this.vel.z += az
    this.tilt += ((ax * f.x + az * f.z) * -0.06 - this.tilt) * Math.min(1, dt * 8)
  }

  place(x, z, heading = 0) {
    this.pos.x = x
    this.pos.z = z
    this.vel.x = this.vel.z = 0
    this.heading = heading
    this.turretYaw = heading
    this.target = { x, z, h: heading, ty: heading, vx: 0, vz: 0, t: performance.now() }
  }

  /** Smoothly follows the latest network state of a tank another device controls. */
  follow(dt) {
    const t = this.target
    if (!t) return
    const lead = Math.min(0.15, (performance.now() - t.t) / 1000)
    const gx = t.x + t.vx * lead
    const gz = t.z + t.vz * lead
    const k = Math.min(1, dt * 14)
    if (Math.hypot(gx - this.pos.x, gz - this.pos.z) > 8) {
      this.pos.x = gx
      this.pos.z = gz
    } else {
      this.pos.x += (gx - this.pos.x) * k
      this.pos.z += (gz - this.pos.z) * k
    }
    this.vel.x = t.vx
    this.vel.z = t.vz
    this.heading += angleDiff(this.heading, t.h) * k
    this.turretYaw += angleDiff(this.turretYaw, t.ty) * Math.min(1, dt * 20)
  }

  render(dt, leader) {
    const now = performance.now()
    this.root.visible = this.alive
    this.root.position.set(this.pos.x, 0, this.pos.z)
    this.root.rotation.y = this.heading
    this.turret.rotation.y = this.turretBase + angleDiff(this.heading, this.turretYaw)
    this.body.rotation.x = this.tilt
    this.recoil = Math.max(0, this.recoil - dt * 5)
    for (const b of this.barrels) {
      b.position.copy(b.userData.rest)
      b.position.z += this.recoil * 0.45
    }
    this.flash = Math.max(0, this.flash - dt * 6)
    this.tintMat.emissive.setRGB(this.flash * 0.5, this.flash * 0.5, this.flash * 0.5)
    // A splash turns the tank the splasher's colour, and it wears off over a couple of seconds.
    this.paintT = Math.max(0, this.paintT - dt * 0.5)
    this.tintMat.color.set(this.color).lerp(this.paintColor, Math.min(1, this.paintT * 1.4) * 0.75)
    // A happy wobble after a splash.
    this.body.rotation.z = Math.sin(now / 45) * this.flash * 0.12

    const show = this.alive
    const y = this.labelHeight
    this.label.visible = show
    this.crown.visible = show && leader
    this.label.position.set(this.pos.x, y + 0.9, this.pos.z)
    this.crown.position.set(this.pos.x, y + 2.1 + Math.sin(now / 250) * 0.15, this.pos.z)
  }

  dispose() {
    scene.remove(this.root, this.label, this.crown)
    this.label.material.map?.dispose()
  }
}

export { TANK_RADIUS }
