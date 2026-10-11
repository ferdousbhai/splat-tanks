// A tank: its numbers (level, upgrades) and its Blender model, tinted in the player's colour.
import * as THREE from 'three'
import { scene, models } from './world.js'
import { BASE, emptyLoadout, statsFor, tierFor } from './config.js'
import { emojiTexture, still } from './fx.js'

/**
 * seat: in the driver's seat, labels keep one size on screen instead of filling it up close.
 * seatTank: the id of the tank the seat is in, whose own blobs keep out of the aim ring (shells.js), else null.
 * levels: the splat match labels show "Lv n Tier"; painting together shows just the tier.
 */
export const view = { seat: false, seatTank: null, levels: true }

/** Seconds a child's tank backs up with the stick held behind before it turns round (drive's backUp). */
const BACK_FOR = 0.6
/** Metres a squirt pulls the barrels back (main.js showReach allows for it). */
export const RECOIL_KICK = 0.45

/** Yaw (three.js rotation.y) that faces direction (dx, dz); models face -Z. */
export const yawOf = (dx, dz) => Math.atan2(-dx, -dz)
export const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
export const angleDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Glides point p ({ x, z }) toward a network state t ({ x, z, vx, vz, t }), carried on a little by its speed for
 * the time since it was sent. Jumps there when it is more than `snap` metres off.
 */
export function glideTo(p, t, dt, snap, rate) {
  const lead = Math.min(0.15, (performance.now() - t.t) / 1000)
  const gx = t.x + t.vx * lead
  const gz = t.z + t.vz * lead
  if (Math.hypot(gx - p.x, gz - p.z) > snap) {
    p.x = gx
    p.z = gz
  } else {
    const k = Math.min(1, dt * rate)
    p.x += (gx - p.x) * k
    p.z += (gz - p.z) * k
  }
}

function fallbackTank(tier) {
  const root = new THREE.Group()
  const s = 0.9 + tier * 0.1
  const tint = new THREE.MeshStandardMaterial({ color: '#fff', name: 'tint' })
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
    this.vel = { x: 0, z: 0 } // how the tank is moving, as shown and sent (main.js control takes out what a wall stops)
    this.trackVel = { x: 0, z: 0 } // the speed its tracks are pushing with (drive)
    this.heading = 0
    this.turretYaw = 0
    this.boostUntil = 0
    this.boostReadyAt = 0
    this.megaReadyAt = 0
    this.nextFireAt = 0
    this.shotDue = this.megaDue = false // a squirt or balloon waiting for the reload and for the turret to reach the aim
    this.dueAim = 0 // the aim it waits for (main.js squirt)
    this.dueSpot = { x: 0, z: 0 } // the storage dueAt points at, so nothing is made each frame
    this.dueAt = null // the mouse's floor point it waits for (this.dueSpot), or null
    this.hosing = false // squirting has been held since the last squirt, so the next goes on time from wherever the nozzle points (main.js squirt)
    this.target = null // remote: last network state
    this.flash = 0
    this.recoil = 0
    this.yawRate = 0 // how fast the hull is turning (radians a second)
    this.backFor = 0 // how long the stick has pointed behind (drive)
    this.trailAt = null // host: where this tank's paint trail was last laid (trailTo)
    this.sway = { pitch: 0, pv: 0, roll: 0, rv: 0, fwd: 0, yaw: 0, kick: 0 } // the suspension, rocking on its springs
    this.tier = 0
    this.firstPerson = false // seen from inside: the hull and turret are hidden, the barrels stay

    this.root = new THREE.Group()
    this.root.visible = false
    scene.add(this.root)
    this.body = new THREE.Group() // rocks on the suspension (suspend)
    this.root.add(this.body)
    this.baseColor = new THREE.Color(color)
    this.tintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 })

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }))
    this.label.renderOrder = 10
    this.label.scale.set(4.4, 1.1, 1)
    this.crown = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('👑'), depthTest: false, transparent: true }))
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
    const tier = (this.tier = this.stats.tier)
    if (this.model) this.body.remove(this.model)
    const src = models.tanks[tier] ?? fallbackTank(tier)
    this.model = src.clone(true)
    this.model.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      const swap = (m) => {
        if (m.name !== 'tint') return m
        // Keep the model's painted-metal bumps and wear under the team colour.
        if (m.normalMap && !this.tintMat.normalMap) {
          Object.assign(this.tintMat, { normalMap: m.normalMap, roughnessMap: m.roughnessMap, roughness: 1 })
          this.tintMat.needsUpdate = true
        }
        return this.tintMat
      }
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material)
    })
    this.body.add(this.model)
    // Every model (and fallbackTank) has a turret and at least one muzzle.
    const find = (name) => this.model.getObjectByName(name)
    this.turret = find('turret')
    this.turretBase = this.turret.rotation.y
    this.barrels = ['barrel', 'barrel_L', 'barrel_R'].map(find).filter(Boolean)
    for (const b of this.barrels) b.userData.rest ??= b.position.clone()
    this.muzzleNodes = ['muzzle', 'muzzle_L', 'muzzle_R'].map(find).filter(Boolean)
    this.setFirstPerson(this.firstPerson)
    // Bigger tiers sit a little taller in the label.
    this.labelHeight = 3 + tier * 0.35
  }

  /** Puts the hull and turret on layer 1, which the camera doesn't draw, so the view from inside is clear. */
  setFirstPerson(on) {
    this.firstPerson = on
    const keep = new Set()
    for (const b of this.barrels) b.traverse((o) => keep.add(o))
    this.model.traverse((o) => o.isMesh && !keep.has(o) && o.layers.set(on ? 1 : 0))
  }

  refreshLabel() {
    const tier = tierFor(this.level).name
    const sub = view.levels ? `Lv ${this.level} ${tier}` : tier
    const key = `${this.name}|${sub}`
    if (key === this.labelKey) return
    this.labelKey = key
    this.label.material.map?.dispose()
    this.label.material.map = labelTexture(this.name, sub, this.color)
    this.label.material.needsUpdate = true
  }

  /** World positions of the muzzles. */
  muzzles() {
    this.pose() // this frame's place and aim: render() comes later in the frame (getWorldPosition updates the chain)
    return this.muzzleNodes.map((m) => m.getWorldPosition(new THREE.Vector3()))
  }

  /**
   * Steers toward a move direction (twin-stick style) like a tracked vehicle: the hull swings round at a turn
   * rate that eases in and out (quicker turning on the spot than at full speed), the tank speeds up and slows
   * down with some weight, and the tracks grip, so sideways sliding dies away quickly. backUp: how long a stick
   * held behind backs up before the tank turns round and drives that way. A moment for a child (BACK_FOR); for as
   * long as it's held in the driver's seat (Infinity), which steers its own hull; not at all for a robot (0), whose
   * steering round an obstacle can flip between ahead and behind, and would rock it in place.
   */
  drive(mx, mz, dt, backUp = BACK_FOR) {
    const len = Math.hypot(mx, mz)
    const f = dirOf(this.heading)
    const fwd = this.trackVel.x * f.x + this.trackVel.z * f.z
    const top = this.stats.speed * BASE.boostSpeed
    let speed = 0
    let yawWant = 0
    if (len > 0.1) {
      const want = yawOf(mx, mz)
      const diff = angleDiff(this.heading, want)
      // Reverse instead of doing a U-turn when the stick points behind, for backUp seconds (see above).
      const behind = Math.abs(diff) > 2.2
      this.backFor = behind ? this.backFor + dt : 0
      const back = behind && this.backFor < backUp
      let align = 1
      // Backing up for a moment goes straight back along the hull: steering its rear onto the stick first, only
      // to turn round straight after, would be a wasted three-point turn. (The seat steers it along the view.)
      const seat = backUp === Infinity
      if (!back || seat) {
        const d = angleDiff(this.heading, back ? want + Math.PI : want)
        const rate = 6.5 - 2.5 * Math.min(1, Math.abs(fwd) / this.stats.speed)
        yawWant = Math.max(-rate, Math.min(rate, d * 9))
        align = Math.max(0.25, Math.cos(d))
      }
      speed = this.stats.speed * Math.min(1, len) * align * (back ? -0.75 : 1)
    }
    else this.backFor = 0
    this.yawRate += (yawWant - this.yawRate) * Math.min(1, dt * 14)
    this.heading += this.yawRate * dt
    if (this.boosting) speed = top * (speed < 0 ? -1 : 1)
    const g = dirOf(this.heading)
    const side = this.trackVel.x * -g.z + this.trackVel.z * g.x
    // Tracks brake harder than they pull away; a zoom kicks in quickly.
    const pulling = speed * fwd >= 0 && Math.abs(speed) > Math.abs(fwd)
    const k = Math.min(1, dt * (this.boosting ? 10 : pulling ? 4.5 : 6))
    const nf = Math.max(-top, Math.min(top, fwd + (speed - fwd) * k))
    const ns = side * Math.max(0, 1 - dt * 12)
    this.trackVel.x = this.vel.x = g.x * nf - g.z * ns
    this.trackVel.z = this.vel.z = g.z * nf + g.x * ns
  }

  /** Stands still: no speed shown, sent, or pushed by the tracks. */
  stop() {
    this.vel.x = this.vel.z = this.trackVel.x = this.trackVel.z = 0
  }

  place(x, z, heading = 0) {
    this.pos.x = x
    this.pos.z = z
    this.stop()
    this.yawRate = 0
    this.heading = heading
    this.sway.yaw = heading
    this.sway.fwd = 0
    this.turretYaw = heading
    this.target = { x, z, h: heading, ty: heading, vx: 0, vz: 0, t: performance.now() }
  }

  /** Smoothly follows the latest network state of a tank another device controls. */
  follow(dt) {
    const t = this.target
    if (!t) return
    glideTo(this.pos, t, dt, 8, 14)
    const k = Math.min(1, dt * 14)
    this.vel.x = t.vx
    this.vel.z = t.vz
    this.heading += angleDiff(this.heading, t.h) * k
    this.turretYaw += angleDiff(this.turretYaw, t.ty) * Math.min(1, dt * 20)
  }

  /** Puts the model where the tank is, facing its heading, with the turret on its aim. */
  pose() {
    this.root.position.set(this.pos.x, 0, this.pos.z)
    this.root.rotation.y = this.heading
    this.turret.rotation.y = this.turretBase + angleDiff(this.heading, this.turretYaw)
  }

  /**
   * The hull rocks on its springs: it dips back as it pulls away and noses down as it stops, leans out of a
   * turn and rocks back when it squirts. Worked out from how the tank moves, so tanks driven on other devices
   * rock the same way. Damped so it settles after one small rock.
   */
  suspend(dt) {
    const w = this.sway
    if (dt <= 0) return
    const f = dirOf(this.heading)
    const fwd = this.vel.x * f.x + this.vel.z * f.z
    const turn = angleDiff(w.yaw, this.heading) / dt
    w.yaw = this.heading
    // From the smoothed speed (a tank another device drives changes speed in steps, 20 times a second); the
    // gap to it, times its rate, is the acceleration whatever the frame rate.
    const rate = 10
    const accel = (fwd - w.fwd) * rate
    w.fwd += (fwd - w.fwd) * Math.min(1, dt * rate)
    if (this.recoil > w.kick) w.pv += 0.9 // just squirted
    w.kick = this.recoil
    if (still.matches) {
      w.pitch = w.roll = w.pv = w.rv = 0
      this.body.rotation.x = 0
      return
    }
    const pitchGoal = Math.max(-0.07, Math.min(0.07, accel * 0.004))
    const rollGoal = Math.max(-0.08, Math.min(0.08, -fwd * turn * 0.004))
    w.pv += ((pitchGoal - w.pitch) * 90 - w.pv * 11) * dt
    w.rv += ((rollGoal - w.roll) * 90 - w.rv * 11) * dt
    w.pitch += w.pv * dt
    w.roll += w.rv * dt
    this.body.rotation.x = w.pitch
  }

  render(dt, leader) {
    const now = performance.now()
    this.root.visible = this.alive
    this.pose()
    this.suspend(dt)
    this.recoil = Math.max(0, this.recoil - dt * 5)
    for (const b of this.barrels) {
      b.position.copy(b.userData.rest)
      b.position.z += this.recoil * RECOIL_KICK
    }
    this.flash = Math.max(0, this.flash - dt * 6)
    this.tintMat.emissive.setRGB(this.flash * 0.5, this.flash * 0.5, this.flash * 0.5)
    // A splash turns the tank the splasher's colour, and it wears off over a couple of seconds.
    this.paintT = Math.max(0, this.paintT - dt * 0.5)
    this.tintMat.color.copy(this.baseColor).lerp(this.paintColor, Math.min(1, this.paintT * 1.4) * 0.75)
    // A happy wobble after a splash, on top of the lean.
    this.body.rotation.z = this.sway.roll + (still.matches ? 0 : Math.sin(now / 45) * this.flash * 0.12)

    const show = this.alive && !this.firstPerson
    if (this.label.material.sizeAttenuation === view.seat) {
      // sizeAttenuation is compiled into the shader, so the material must rebuild for the change to show.
      for (const s of [this.label, this.crown]) {
        s.material.sizeAttenuation = !view.seat
        s.material.needsUpdate = true
      }
      this.label.scale.set(...(view.seat ? [0.22, 0.055, 1] : [4.4, 1.1, 1]))
      this.crown.scale.setScalar(view.seat ? 0.07 : 1.4)
    }
    const y = this.labelHeight
    this.label.visible = show
    this.crown.visible = show && leader
    this.label.position.set(this.pos.x, y + 0.9, this.pos.z)
    this.crown.position.set(this.pos.x, y + 2.1 + (still.matches ? 0 : Math.sin(now / 600) * 0.12), this.pos.z)
  }

  dispose() {
    scene.remove(this.root, this.label, this.crown)
    this.label.material.map?.dispose()
    this.label.material.dispose()
    this.crown.material.dispose()
    this.tintMat.dispose()
  }
}

