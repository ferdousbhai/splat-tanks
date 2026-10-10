// Paint together: chalk lines cut the floor into equal parts (halves, thirds or quarters) and everyone
// paints them together. When a part is nearly all painted, its gaps fill in and the game names the
// fraction. Every device keeps the same paint grid (paint.js), so every device measures the same
// progress; only the host decides when a part is finished.
import * as THREE from 'three'
import { scene, solidAt, freeSpot, colliders } from './world.js'
import { ARENA } from './config.js'
import { N, CELLS, slotAt, fillCells } from './paint.js'

/** A part is finished when this share of its open floor is painted; the rest then fills in. */
export const DONE = 0.85

const NAMES = { 2: ['half', 'halves'], 3: ['third', 'thirds'], 4: ['quarter', 'quarters'] }
const NUMBERS = ['no', 'one', 'two', 'three', 'four']
/** "one quarter", "three quarters", "two halves" */
export const fractionWords = (k, n) => `${NUMBERS[k]} ${NAMES[n][k === 1 ? 0 : 1]}`
export const cap = (s) => s[0].toUpperCase() + s.slice(1)
/** The menu pill and opening banner: "Paint both halves!", "Paint all four quarters!" */
export const goalWords = (n) => `Paint ${n === 2 ? 'both' : `all ${NUMBERS[n]}`} ${NAMES[n][1]}!`

const partOf = new Uint8Array(CELLS)
const open = new Uint8Array(CELLS) // 1 where a tank can reach the floor: not under a wall, crate, rock or tree
/**
 * n: how many parts; grid: quarters as four squares (else strips); cuts: the columns where strips begin;
 * done: finished parts.
 * focus: the unfinished part nearest to done, where the robots help, so parts finish one after another.
 */
export const layout = { n: 0, grid: false, cuts: [], done: [], cells: [], open: [], focus: 0 }

const cellX = (i) => (i % N) + 0.5 - ARENA
const cellZ = (i) => Math.floor(i / N) + 0.5 - ARENA

/** The grid cell under a point on the floor. */
function cellAt(x, z) {
  const cx = Math.min(N - 1, Math.max(0, Math.floor(x + ARENA)))
  const cz = Math.min(N - 1, Math.max(0, Math.floor(z + ARENA)))
  return cz * N + cx
}

/** Which part a point on the floor is in. */
export const partAt = (x, z) => partOf[cellAt(x, z)]

/** Cuts the floor into n equal parts, after the arena for this match is built. */
export function setupParts(n, grid, done = []) {
  layout.n = n
  layout.grid = n === 4 && grid
  // Strips are cut on whole 1 m cells, so paint never crosses the chalk. 92 cells make halves and quarters
  // exact; thirds are 31, 30 and 31 m, as equal as the grid allows.
  layout.cuts = Array.from({ length: n - 1 }, (_, k) => Math.round(((k + 1) * N) / n))
  layout.done = Array.from({ length: n }, (_, p) => !!done[p])
  layout.cells = Array.from({ length: n }, () => [])
  layout.open = Array(n).fill(0)
  for (let i = 0; i < CELLS; i++) {
    const cx = i % N
    const cz = Math.floor(i / N)
    const p = layout.grid ? (cz < N / 2 ? 0 : 2) + (cx < N / 2 ? 0 : 1) : layout.cuts.filter((c) => cx >= c).length
    partOf[i] = p
    layout.cells[p].push(i)
    open[i] = solidAt(cellX(i), cellZ(i)) ? 0 : 1
    layout.open[p] += open[i]
  }
  drawChalk()
}

/** Removes the chalk (the splat match has no parts). */
export function clearParts() {
  layout.n = 0
  drawChalk()
}

/** Share of each part's open floor that is painted, 0..1. Cheap enough to run a few times a second. */
export function partProgress() {
  const got = Array(layout.n).fill(0)
  for (let i = 0; i < CELLS; i++) if (open[i] && slotAt(i)) got[partOf[i]]++
  const progress = got.map((c, p) => (layout.done[p] ? 1 : c / Math.max(1, layout.open[p])))
  let best = -1
  progress.forEach((v, p) => {
    if (!layout.done[p] && (best < 0 || v > progress[best])) best = p
  })
  layout.focus = Math.max(0, best)
  return progress
}

/** A part is finished: its bare gaps fill with the paint most of it already wears. */
export function finishPart(p) {
  if (!layout.n || layout.done[p]) return
  layout.done[p] = true
  const tally = new Map()
  for (const i of layout.cells[p]) {
    const s = slotAt(i)
    if (s) tally.set(s, (tally.get(s) ?? 0) + 1)
  }
  const most = [...tally].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
  if (most) fillCells(layout.cells[p], most)
  drawLabel(p)
}

export const partsDone = () => layout.done.filter(Boolean).length

/** How a round starts: "The floor is cut into four equal parts. Each part is one quarter. …" */
export const introWords = (n) => `The floor is cut into ${NUMBERS[n]} equal parts. Each part is one ${NAMES[n][0]}. Let's paint ${n === 2 ? 'both' : 'them all'} together!`

/** The k-th part is finished: what the banner shows. */
export const doneTitle = (k, n) => `${cap(fractionWords(k, n))} painted!`
/** The one equivalence a round teaches, shown and said when the second quarter is finished. */
export const halfWords = (k, n) => (n === 4 && k === 2 ? 'Two quarters make one half!' : '')
/** Under the fraction strip: "one quarter painted · three to go". */
export function stripWords(k, n) {
  if (!k) return `${fractionWords(n, n)} to paint`
  if (k >= n) return `${fractionWords(n, n)} make one whole`
  return `${fractionWords(k, n)} painted · ${NUMBERS[n - k]} to go`
}

/** What the game says when the k-th part is finished. */
export function doneWords(k, n) {
  if (k >= n) return `${cap(fractionWords(n, n))} make one whole! We painted the whole floor together!`
  return [doneTitle(k, n), halfWords(k, n), `${cap(fractionWords(n - k, n))} to go.`].filter(Boolean).join(' ')
}

/** A robot's next place to paint: bare floor in the focus part, else in any part that isn't finished. */
export function bareSpot() {
  let fallback = null
  for (let k = 0; k < 60; k++) {
    const s = freeSpot()
    const p = partAt(s.x, s.z)
    if (layout.done[p]) continue
    const bare = !slotAt(cellAt(s.x, s.z))
    if (bare && p === layout.focus) return s
    if (bare || !fallback) fallback = s
  }
  return fallback ?? freeSpot()
}

/** The chalk lines between parts, for the minimap and the results picture. X maps metres to pixels. */
export function chalkLines(g, X) {
  if (!layout.n) return
  g.save()
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 2
  g.setLineDash([5, 4])
  g.beginPath()
  for (const [x0, z0, x1, z1] of lines()) {
    g.moveTo(X(x0), X(z0))
    g.lineTo(X(x1), X(z1))
  }
  g.stroke()
  g.restore()
}

function lines() {
  if (layout.grid) return [[0, -ARENA, 0, ARENA], [-ARENA, 0, ARENA, 0]]
  return layout.cuts.map((c) => [c - ARENA, -ARENA, c - ARENA, ARENA])
}

// --- Chalk on the floor -------------------------------------------------------------------

// The paint floor (paint.js) is pulled toward the camera with a polygon offset; chalk is pulled further, so it
// always shows on top of the paint while tanks still hide it.
const onPaint = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }
const chalkMat = new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: 0.8, ...onPaint })
const dashGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const labelGeo = new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2)
const DASH = 1.8
const GAP = 1
let chalk = null
const labels = []

function drawChalk() {
  if (chalk) {
    scene.remove(chalk)
    chalk.dispose()
    chalk = null
  }
  for (const l of labels.splice(0)) {
    scene.remove(l)
    l.material.map.dispose()
    l.material.dispose()
  }
  if (!layout.n) return
  const segs = lines()
  const per = Math.floor((2 * ARENA) / (DASH + GAP))
  chalk = new THREE.InstancedMesh(dashGeo, chalkMat, segs.length * per)
  const m = new THREE.Matrix4()
  let k = 0
  for (const [x0, z0, x1, z1] of segs) {
    const along = x0 === x1 ? 'z' : 'x'
    for (let d = 0; d < per; d++) {
      const t = -ARENA + GAP / 2 + d * (DASH + GAP) + DASH / 2
      const x = along === 'x' ? t : x0
      const z = along === 'z' ? t : z0
      m.makeScale(along === 'x' ? DASH : 0.35, 1, along === 'z' ? DASH : 0.35).setPosition(x, 0.05, z)
      chalk.setMatrixAt(k++, m)
    }
  }
  chalk.renderOrder = 2
  scene.add(chalk)
  for (let p = 0; p < layout.n; p++) {
    let sx = 0
    let sz = 0
    for (const i of layout.cells[p]) ((sx += cellX(i)), (sz += cellZ(i)))
    const [x, z] = labelSpot(p, sx / layout.cells[p].length, sz / layout.cells[p].length)
    const mesh = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial(onPaint))
    mesh.position.set(x, 0.06, z)
    mesh.renderOrder = 3
    scene.add(mesh)
    labels[p] = mesh
    drawLabel(p)
  }
}

/**
 * Where a part's chalk label goes: the nearest spot to the part's middle where the whole 7 m label (and a
 * little room around it) lies inside the part with no tower, wall, crate, rock or tree standing on it.
 */
const LABEL_ROOM = 5.5 // half the label (3.5 m) and 2 m around it
function labelSpot(p, x0, z0) {
  const R = LABEL_ROOM
  const clear = (x, z) => {
    if (Math.max(Math.abs(x), Math.abs(z)) > ARENA - R) return false
    for (const [dx, dz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) if (partAt(x + dx, z + dz) !== p) return false
    for (const b of colliders.boxes) if (Math.abs(x - b.x) < R + b.hx && Math.abs(z - b.z) < R + b.hz) return false
    for (const c of colliders.circles) {
      if (c.barrel !== undefined) continue
      const nx = Math.max(x - R, Math.min(c.x, x + R)) // nearest point of the square to the circle
      const nz = Math.max(z - R, Math.min(c.z, z + R))
      if (Math.hypot(c.x - nx, c.z - nz) < c.r) return false
    }
    return true
  }
  for (let r = 0; r <= 24; r += 2) {
    for (let a = 0; a < (r ? 16 : 1); a++) {
      const x = x0 + Math.cos((a / 16) * Math.PI * 2) * r
      const z = z0 + Math.sin((a / 16) * Math.PI * 2) * r
      if (clear(x, z)) return [x, z]
    }
  }
  return [x0, z0]
}

/** The part's fraction in chalk, "1 over n", bolder with a ring once it's painted. */
function drawLabel(p) {
  const mesh = labels[p]
  if (!mesh) return
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const done = layout.done[p]
  g.fillStyle = g.strokeStyle = '#fff'
  g.shadowColor = 'rgba(0,0,0,0.45)'
  g.shadowBlur = 8
  g.font = '900 92px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('1', 128, 70)
  g.fillText(String(layout.n), 128, 192)
  g.lineWidth = 14
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(78, 131)
  g.lineTo(178, 131)
  g.stroke()
  if (done) {
    g.lineWidth = 12
    g.beginPath()
    g.arc(128, 128, 116, 0, Math.PI * 2)
    g.stroke()
  }
  mesh.material.map?.dispose()
  mesh.material.map = new THREE.CanvasTexture(c)
  mesh.material.map.colorSpace = THREE.SRGBColorSpace
  mesh.material.opacity = done ? 0.95 : 0.6
  mesh.material.needsUpdate = true
}
