// Tread marks: each track presses its pattern into the sand (and through wet paint) as a tank drives, and the
// marks slowly fade. They are only for looks and never count as paint, so each device draws its own.
import * as THREE from 'three'
import { scene } from './world.js'
import { ARENA } from './config.js'

const SIZE = 1024
const K = SIZE / (ARENA * 2) // canvas pixels per metre
const canvas = document.createElement('canvas')
canvas.width = canvas.height = SIZE
const g = canvas.getContext('2d')
const tex = new THREE.CanvasTexture(canvas)
tex.colorSpace = THREE.SRGBColorSpace
tex.generateMipmaps = false
tex.minFilter = THREE.LinearFilter
// Between the paint (offset -2) and the chalk lines (-4), so marks show in paint and chalk stays on top.
const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
  new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
)
mesh.rotation.x = -Math.PI / 2
mesh.position.y = 0.035
mesh.receiveShadow = true
mesh.renderOrder = 1
scene.add(mesh)

const GAP = 0.32 // metres between tread bars
const last = new Map() // tank id -> [left, right] track points where the last bars were pressed
let dirty = false
let lastUpload = 0
let lastFade = 0

/** Where a tank's two tracks touch the ground. */
function trackPoints(t) {
  const half = 0.62 + t.tier * 0.1 // the bigger tiers have wider hulls
  const cx = Math.cos(t.heading)
  const sx = -Math.sin(t.heading)
  // The hull's right is (cos h, -sin h) for a model that faces -Z.
  return [
    { x: t.pos.x - cx * half, z: t.pos.z - sx * half },
    { x: t.pos.x + cx * half, z: t.pos.z + sx * half },
  ]
}

function bar(p, heading, tier) {
  g.save()
  g.translate((p.x + ARENA) * K, (p.z + ARENA) * K)
  g.rotate(-heading)
  const w = (0.4 + tier * 0.04) * K
  g.fillRect(-w / 2, -0.07 * K, w, 0.14 * K)
  g.restore()
}

/** Presses tread bars wherever a track has rolled far enough since its last bar. */
export function updateTreads(tanks, now) {
  g.fillStyle = 'rgba(58, 40, 22, 0.28)'
  for (const t of tanks) {
    if (!t.alive) {
      last.delete(t.id)
      continue
    }
    const pts = trackPoints(t)
    const prev = last.get(t.id)
    if (!prev) {
      last.set(t.id, pts)
      continue
    }
    for (let i = 0; i < 2; i++) {
      const d = Math.hypot(pts[i].x - prev[i].x, pts[i].z - prev[i].z)
      if (d > 4) prev[i] = pts[i] // placed somewhere new: no streak across the floor
      else if (d >= GAP) {
        // Fill the stretch rolled this frame, one bar every GAP metres.
        const n = Math.floor(d / GAP)
        for (let k = 1; k <= n; k++) {
          const f = (k * GAP) / d
          bar({ x: prev[i].x + (pts[i].x - prev[i].x) * f, z: prev[i].z + (pts[i].z - prev[i].z) * f }, t.heading, t.tier)
        }
        const f = (n * GAP) / d
        prev[i] = { x: prev[i].x + (pts[i].x - prev[i].x) * f, z: prev[i].z + (pts[i].z - prev[i].z) * f }
        dirty = true
      }
    }
  }
  // Fade in steps every couple of seconds (a step is too small to notice); marks are gone after about 30 s.
  if (now - lastFade > 2000) {
    lastFade = now
    g.save()
    g.globalCompositeOperation = 'destination-out'
    g.fillStyle = 'rgba(0, 0, 0, 0.14)'
    g.fillRect(0, 0, SIZE, SIZE)
    g.restore()
    dirty = true
  }
  // Uploaded four times a second: the marks appear behind the tank, where a moment's wait doesn't show.
  if (dirty && now - lastUpload > 250) {
    lastUpload = now
    dirty = false
    tex.needsUpdate = true
  }
}

export function clearTreads() {
  g.clearRect(0, 0, SIZE, SIZE)
  last.clear()
  tex.needsUpdate = true
}
