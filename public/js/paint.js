// The painted floor: a grid of 1 m cells that decides the score, and a canvas texture that shows it.
//
// The host decides every splat and sends them in order, so every device applies the same splats
// to the same grid and agrees on the score without sending it.
import * as THREE from 'three'
import { scene } from './world.js'
import { ARENA } from './config.js'

export const N = ARENA * 2 // cells per side
export const CELLS = N * N
const grid = new Uint8Array(CELLS) // 0 = bare floor, otherwise the painter's slot
const counts = new Uint32Array(256)
const colors = new Map() // slot -> colour, kept after a player leaves so their paint stays

const SIZE = 512
const K = SIZE / N // canvas pixels per metre
export const canvas = document.createElement('canvas')
canvas.width = canvas.height = SIZE
const g = canvas.getContext('2d')
const tex = new THREE.CanvasTexture(canvas)
tex.colorSpace = THREE.SRGBColorSpace
// Re-uploaded ~10 times a second, so skip rebuilding mipmaps each time.
tex.generateMipmaps = false
tex.minFilter = THREE.LinearFilter
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(N, N),
  new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.y = 0.03
floor.receiveShadow = true
scene.add(floor)
let dirty = false

export function setSlotColor(slot, color) {
  colors.set(slot, color)
}

/** Paints a round splat. Returns how many cells became this slot's colour. */
export function paint(x, z, r, slot) {
  const color = colors.get(slot) ?? '#ffffff'
  let gained = 0
  const x0 = Math.max(0, Math.floor(x + ARENA - r))
  const x1 = Math.min(N - 1, Math.floor(x + ARENA + r))
  const z0 = Math.max(0, Math.floor(z + ARENA - r))
  const z1 = Math.min(N - 1, Math.floor(z + ARENA + r))
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const dx = cx + 0.5 - ARENA - x
      const dz = cz + 0.5 - ARENA - z
      if (dx * dx + dz * dz > r * r) continue
      const i = cz * N + cx
      const old = grid[i]
      if (old === slot) continue
      if (old) counts[old]--
      grid[i] = slot
      counts[slot]++
      gained++
    }
  }
  // The picture: a blob with a few drops around it. Drops are only for looks.
  g.fillStyle = color
  g.beginPath()
  g.arc((x + ARENA) * K, (z + ARENA) * K, r * K, 0, Math.PI * 2)
  g.fill()
  if (r > 1.2) {
    const drops = Math.round(r * 2)
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * Math.PI * 2
      const d = r * (0.9 + Math.random() * 0.45)
      g.beginPath()
      g.arc((x + Math.cos(a) * d + ARENA) * K, (z + Math.sin(a) * d + ARENA) * K, r * K * (0.1 + Math.random() * 0.14), 0, Math.PI * 2)
      g.fill()
    }
  }
  dirty = true
  return gained
}

/** The slot that painted cell i (0 = bare floor). Cell i is column i % N, row floor(i / N), 1 m each. */
export const slotAt = (i) => grid[i]

/** One cell drawn as a round dab, so whole cells look painted rather than tiled. */
function dab(i) {
  g.beginPath()
  g.arc(((i % N) + 0.5) * K, (Math.floor(i / N) + 0.5) * K, K * 0.75, 0, Math.PI * 2)
  g.fill()
}

/** Fills the given bare cells with one slot's paint. */
export function fillCells(cells, slot) {
  g.fillStyle = colors.get(slot) ?? '#ffffff'
  for (const i of cells) {
    if (grid[i]) continue
    grid[i] = slot
    counts[slot]++
    dab(i)
    dirty = true
  }
}

export const cellsOf = (slot) => counts[slot]
/** Most paint first, then highest level: the leaderboard and the final medals. */
export const byPaint = (a, b) => cellsOf(b.slot) - cellsOf(a.slot) || b.level - a.level
export const painted = () => counts.reduce((a, b) => a + b, 0)

export function resetPaint() {
  grid.fill(0)
  counts.fill(0)
  colors.clear()
  g.clearRect(0, 0, SIZE, SIZE)
  dirty = true
}

/** The grid for a player joining mid-game: run-length pairs [slot, run, slot, run, ...]. */
export function encodePaint() {
  const out = []
  let v = grid[0]
  let run = 0
  for (let i = 0; i < CELLS; i++) {
    if (grid[i] === v) run++
    else {
      out.push(v, run)
      v = grid[i]
      run = 1
    }
  }
  out.push(v, run)
  return { g: out, c: [...colors] }
}

export function decodePaint(data) {
  resetPaint()
  for (const [slot, color] of data.c) colors.set(slot, color)
  let i = 0
  for (let k = 0; k < data.g.length; k += 2) {
    const v = data.g[k]
    const end = Math.min(CELLS, i + data.g[k + 1])
    if (v) {
      g.fillStyle = colors.get(v) ?? '#ffffff'
      for (; i < end; i++) {
        grid[i] = v
        counts[v]++
        dab(i)
      }
    }
    i = end
  }
  dirty = true
}

let lastUpload = 0
/** Bumped each time the picture is uploaded, so the minimap and the part progress know when to measure again. */
export let paintVersion = 0
/** Uploads the canvas to the GPU at most ~10 times a second. */
export function updatePaint(now) {
  if (!dirty || now - lastUpload < 90) return
  lastUpload = now
  dirty = false
  tex.needsUpdate = true
  paintVersion++
}
