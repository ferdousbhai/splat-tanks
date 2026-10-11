// Paint splashes, squirts, sparkles, confetti and floating words. The camera never shakes.
import * as THREE from 'three'
import { scene, camera } from './world.js'

/** Reduced motion: no confetti or ring bursts, and floating words don't grow. Other modules read it too. */
export const still = matchMedia('(prefers-reduced-motion: reduce)')

/**
 * True when something would fill the view from within r metres of the camera, which only happens in the
 * driver's seat (the sky camera is 30 m up). Such effects are left out or kept small and low, and blobs are
 * hidden, so the view never flashes. Big splashes pass a bigger r.
 */
const at = new THREE.Vector3()
export const nearCamera = (x, y, z, r = 6) => camera.position.distanceToSquared(at.set(x, y, z)) < r * r

const particles = []
const cube = new THREE.BoxGeometry(1, 1, 1)
const ball = new THREE.IcosahedronGeometry(1, 1)
const ringGeo = new THREE.RingGeometry(0.8, 1, 32)
ringGeo.rotateX(-Math.PI / 2)

// Every effect mesh lives under one group; spent ones are hidden and pooled rather than removed from the scene.
const fxRoot = new THREE.Group()
scene.add(fxRoot)
const pools = new Map()
function mesh(geo, color, opacity = 1, additive = false) {
  const key = `${geo.uuid}|${color}|${additive}`
  const pool = pools.get(key)
  const m = pool?.length ? pool.pop() : new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }))
  m.userData.key = key
  m.material.opacity = opacity
  m.visible = true
  m.scale.setScalar(1)
  m.rotation.set(0, 0, 0)
  if (!m.parent) fxRoot.add(m)
  return m
}
function release(m) {
  m.visible = false
  if (!pools.has(m.userData.key)) pools.set(m.userData.key, [])
  pools.get(m.userData.key).push(m)
}

function spawn(m, p) {
  particles.push({ m, t: 0, life: 1, vx: 0, vy: 0, vz: 0, g: 0, spin: 0, grow: 0, fade: true, size: 1, base: m.material.opacity, ...p })
}

/** A puff of paint at the nozzle. None right by the camera (the driver's seat): there the blob itself shows. */
export function muzzleFlash(x, y, z, dx, dz, color, big = false) {
  if (nearCamera(x, y, z)) return
  const s = big ? 1.8 : 1
  const f = mesh(ball, color, 0.9)
  f.position.set(x, y, z)
  spawn(f, { life: 0.12, size: 0.45 * s, grow: 3 * s })
  for (let i = 0; i < (big ? 6 : 3); i++) {
    const d = mesh(ball, color)
    d.position.set(x + dx * 0.3, y, z + dz * 0.3)
    const sp = 3 + Math.random() * 3
    spawn(d, { life: 0.4 + Math.random() * 0.2, size: 0.12 * s, vx: dx * sp + (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, vz: dz * sp + (Math.random() - 0.5) * 3, g: 18, fade: false })
  }
}

/** A paint splash: drops of colour fly up and fall. size: 0.8 = blob, 2.5 = balloon, 3 = bucket. y: how high (on top of a prop, a blob splashes up there). */
export function splash(x, z, size = 1, color = '#ff6ec7', y = 0.6) {
  // By the camera (driver's seat): no pop or ring, and a few small drops that stay low. A balloon's or bucket's
  // pop and ring grow several metres wide, so they count as near from further away.
  const near = nearCamera(x, y, z, 6 + 3 * size)
  if (!near) {
    const pop = mesh(ball, color, 0.85)
    pop.position.set(x, y, z)
    spawn(pop, { life: 0.18, size: 0.5 * size, grow: 5 * size })
    const ring = mesh(ringGeo, '#ffffff', 0.7, true)
    ring.position.set(x, y - 0.45, z)
    spawn(ring, { life: 0.3, size: 0.5 * size, grow: 8 * size })
  }
  const n = near ? 3 : Math.round(8 * size)
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = (near ? 1.5 : 2 + Math.random() * 5) * Math.sqrt(size)
    const d = mesh(ball, i % 4 ? color : '#ffffff')
    d.position.set(x, near ? y - 0.3 : y, z)
    spawn(d, { life: 0.6 + Math.random() * 0.5, size: near ? 0.08 : 0.12 + Math.random() * 0.12 * size, vx: Math.cos(a) * sp, vy: near ? 1 + Math.random() : 4 + Math.random() * 5 * Math.sqrt(size), vz: Math.sin(a) * sp, g: 20, fade: false })
  }
}

export function sparks(x, z, color = '#ffd36b', n = 6) {
  if (nearCamera(x, 1, z)) return
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const s = mesh(cube, color, 1, true)
    s.position.set(x, 1, z)
    spawn(s, { life: 0.25 + Math.random() * 0.2, size: 0.12, vx: Math.cos(a) * 8, vy: 2 + Math.random() * 5, vz: Math.sin(a) * 8, g: 18 })
  }
}

export function confetti(x, z, colors) {
  if (still.matches || nearCamera(x, 1.5, z)) return
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = 2 + Math.random() * 6
    const c = mesh(cube, colors[i % colors.length])
    c.position.set(x, 1.5, z)
    spawn(c, { life: 1.4 + Math.random(), size: 0.22, vx: Math.cos(a) * sp, vy: 8 + Math.random() * 8, vz: Math.sin(a) * sp, g: 16, spin: 12, fade: false, bounce: true })
  }
}

export function dust(x, z, strength = 1) {
  const d = mesh(ball, '#d6bd8f', 0.35 * strength)
  d.position.set(x + (Math.random() - 0.5) * 0.8, 0.3, z + (Math.random() - 0.5) * 0.8)
  spawn(d, { life: 0.6, size: 0.3, grow: 1.4, vy: 0.6 })
}

export function boostTrail(x, z, color) {
  const f = mesh(ball, color, 0.7, true)
  f.position.set(x, 0.7, z)
  spawn(f, { life: 0.3, size: 0.5, grow: -1 })
}

export function shellTrail(x, y, z, color, big) {
  const f = mesh(ball, color, 0.6)
  f.position.set(x, y, z)
  spawn(f, { life: big ? 0.3 : 0.16, size: big ? 0.3 : 0.12, grow: -0.4, vy: -1.5 })
}

export function levelBurst(x, z, color) {
  if (still.matches || nearCamera(x, 0.8, z)) return
  for (let i = 0; i < 3; i++) {
    const ring = mesh(ringGeo, i ? color : '#ffffff', 0.9, true)
    ring.position.set(x, 0.2 + i * 0.6, z)
    spawn(ring, { life: 0.6 + i * 0.15, size: 1, grow: 6, vy: 2 })
  }
}

/** Clears effects already around the camera when it moves into the driver's seat (they were spawned seen from the sky). */
export function clearNearCamera() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const { position: p } = particles[i].m
    if (!nearCamera(p.x, p.y, p.z)) continue
    release(particles[i].m)
    particles[i] = particles[particles.length - 1]
    particles.pop()
  }
}

export function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.t += dt
    const k = p.t / p.life
    if (k >= 1) {
      release(p.m)
      particles[i] = particles[particles.length - 1] // swap-remove: the last one was already updated
      particles.pop()
      continue
    }
    p.vy -= p.g * dt
    p.m.position.x += p.vx * dt
    p.m.position.y += p.vy * dt
    p.m.position.z += p.vz * dt
    if (p.bounce && p.m.position.y < 0.1) {
      p.m.position.y = 0.1
      p.vy *= -0.35
      p.vx *= 0.6
      p.vz *= 0.6
    }
    if (p.spin) {
      p.m.rotation.x += p.spin * dt
      p.m.rotation.z += p.spin * 0.7 * dt
    }
    p.m.scale.setScalar(Math.max(0.01, p.size + p.grow * p.t))
    if (p.fade) p.m.material.opacity = p.base * (1 - k)
  }
}

/** A cached emoji sprite texture, optionally on a coloured token (so it still reads where emoji fonts are missing). */
const emojiCache = new Map()
export function emojiTexture(emoji, token = null) {
  const key = `${emoji}|${token}`
  if (emojiCache.has(key)) return emojiCache.get(key)
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (token) {
    g.fillStyle = token
    g.beginPath()
    g.arc(64, 64, 58, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 8
    g.strokeStyle = '#fff'
    g.stroke()
  }
  g.font = token ? '72px serif' : '100px serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(emoji, 64, token ? 70 : 72)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  emojiCache.set(key, t)
  return t
}

// --- Floating words (💦, pickups, upgrades) as DOM elements over the canvas ---------------------

const layer = document.getElementById('floaters')
const floaters = []
const v = new THREE.Vector3()

/** Screen pixels [x, y] of a point already projected by the camera (normalised device coordinates). */
export const toScreen = (v) => [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight]

export function floatText(x, z, text, cls = '') {
  const el = document.createElement('div')
  el.className = `floater ${cls}`
  el.textContent = text
  layer.appendChild(el)
  floaters.push({ el, x: x + (Math.random() - 0.5), z, y: 2.6, t: 0 })
}

export function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]
    f.t += dt
    if (f.t > 1) {
      f.el.remove()
      floaters.splice(i, 1)
      continue
    }
    const [x, y] = toScreen(v.set(f.x, f.y + f.t * 2.2, f.z).project(camera))
    f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${still.matches ? 1 : 1 + Math.max(0, 0.3 - f.t) * 2})`
    f.el.style.opacity = String(1 - Math.max(0, f.t - 0.6) / 0.4)
  }
}
