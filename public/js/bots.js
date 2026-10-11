// Computer tanks, run by the host. They roam to bare floor, squirt paint, now and then splash a
// nearby tank, grab pickups and pick upgrades.
import { BOT_LEVELS, ARENA } from './config.js'
import { lineOfSight, pushOut, freeSpot } from './world.js'
import { yawOf, angleDiff } from './tank.js'
import { bareSpot } from './parts.js'
import { balls, BALL_R } from './balls.js'

const PRIORITY = ['big', 'reload', 'wide', 'multi', 'speed', 'velocity', 'ricochet']

export function botPickUpgrade(options, difficulty) {
  const smart = BOT_LEVELS[difficulty].upgradeSmart
  if (Math.random() < smart) return options.slice().sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))[0]
  return options[Math.floor(Math.random() * options.length)]
}

export function newBrain() {
  return { target: null, think: 0, wander: null, wanderT: 0, sweep: Math.random() * Math.PI * 2 }
}

/**
 * Decides one bot's controls for this frame. Painting together, bots never aim at tanks and head
 * for bare floor in the parts that aren't finished.
 */
export function botControls(bot, brain, tanks, pickups, difficulty, dt, together = false) {
  const cfg = BOT_LEVELS[difficulty]
  const out = { mx: 0, mz: 0, aimYaw: bot.turretYaw, fire: false, boost: false, mega: false }
  const me = bot.pos
  const now = performance.now()

  brain.think -= dt
  if (brain.think <= 0) {
    brain.think = cfg.reaction * (0.7 + Math.random() * 0.6)
    // Sometimes pick a nearby tank to splash; most of the time just paint.
    brain.target = null
    if (!together && Math.random() < cfg.chase) {
      let bd = 16
      for (const t of tanks) {
        if (t === bot || !t.alive) continue
        const d = Math.hypot(t.pos.x - me.x, t.pos.z - me.z)
        if (d < bd && lineOfSight(me.x, me.z, t.pos.x, t.pos.z)) ((bd = d), (brain.target = t))
      }
    }
  }

  // Where to go: a close pickup, else a far-off spot (which is usually still bare floor).
  let goal = null
  for (const p of pickups) {
    if (!p.kind) continue
    const d = Math.hypot(p.x - me.x, p.z - me.z)
    if (d < 14 && (!goal || d < goal.d)) goal = { x: p.x, z: p.z, d }
  }
  brain.wanderT -= dt
  if (!brain.wander || brain.wanderT <= 0 || Math.hypot(brain.wander.x - me.x, brain.wander.z - me.z) < 4) {
    brain.wander = together ? bareSpot() : freeSpot()
    brain.wanderT = 5 + Math.random() * 4
  }
  goal ??= brain.wander
  let mx = goal.x - me.x
  let mz = goal.z - me.z

  // Steer around obstacles by probing ahead.
  const l = Math.hypot(mx, mz)
  if (l > 0.01) {
    mx /= l
    mz /= l
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const c = Math.cos(turn)
      const s = Math.sin(turn)
      const tx = mx * c - mz * s
      const tz = mx * s + mz * c
      const probe = { x: me.x + tx * 3, z: me.z + tz * 3 }
      // Robots steer round the beach balls and leave them for the children.
      const ball = balls.some((b) => Math.hypot(b.x - probe.x, b.z - probe.z) < BALL_R + 1.3)
      if (!pushOut(probe, 1.3) && !ball) {
        mx = tx
        mz = tz
        break
      }
    }
  }
  out.mx = mx * cfg.speed
  out.mz = mz * cfg.speed
  if (Math.random() < dt * 0.15) out.boost = true

  // Aim: at the chosen tank, or sweep the nozzle across the floor ahead.
  const target = brain.target?.alive ? brain.target : null
  let want
  if (target) {
    const dist = Math.hypot(target.pos.x - me.x, target.pos.z - me.z)
    const lead = dist / bot.stats.shellSpeed
    want = yawOf(target.pos.x + target.vel.x * lead - me.x, target.pos.z + target.vel.z * lead - me.z) + (Math.random() - 0.5) * 2 * cfg.aimError
  } else {
    brain.sweep += dt * 1.6
    want = yawOf(mx, mz) + Math.sin(brain.sweep) * 0.9
  }
  const turn = 5 * dt
  out.aimYaw = bot.turretYaw + Math.max(-turn, Math.min(turn, angleDiff(bot.turretYaw, want)))
  out.fire = Math.random() < cfg.fireChance
  // Balloons go toward open floor near the middle, where they paint the most.
  if (bot.stats.mega && now > bot.megaReadyAt && Math.hypot(me.x, me.z) < ARENA * 0.8 && Math.random() < dt * 0.5) out.mega = true
  return out
}

