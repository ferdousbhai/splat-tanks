// The arena: renderer, lights, ground, Blender props laid out from a shared seed, and collisions.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ARENA, rng } from './config.js'

export const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('view'), antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

export const scene = new THREE.Scene()
scene.background = new THREE.Color('#8fd3ff')
scene.fog = new THREE.Fog('#8fd3ff', 70, 150)

export const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 300)

const hemi = new THREE.HemisphereLight('#dff4ff', '#6b5a3a', 1.6)
scene.add(hemi)
export const sun = new THREE.DirectionalLight('#fff3dc', 2.6)
sun.position.set(-30, 60, 25)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
const sc = sun.shadow.camera
sc.left = sc.bottom = -ARENA - 6
sc.right = sc.top = ARENA + 6
sc.near = 10
sc.far = 160
sun.shadow.bias = -0.0005
sun.shadow.normalBias = 0.04
scene.add(sun)
scene.add(sun.target)

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  // Show more of the arena on portrait phones.
  camera.fov = camera.aspect < 1 ? 62 : 45
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

// --- Ground -----------------------------------------------------------------------------

function groundTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#c9a66b'
  g.fillRect(0, 0, 512, 512)
  const r = rng(7)
  for (let i = 0; i < 2600; i++) {
    const v = Math.floor(r() * 40 - 20)
    g.fillStyle = `rgba(${120 + v},${95 + v},${55 + v},${0.08 + r() * 0.12})`
    const s = 2 + r() * 10
    g.fillRect(r() * 512, r() * 512, s, s)
  }
  g.strokeStyle = 'rgba(80,60,30,0.18)'
  g.lineWidth = 3
  g.strokeRect(0, 0, 512, 512)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

const groundTex = groundTexture()
groundTex.repeat.set(ARENA / 4, ARENA / 4)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const outside = new THREE.Mesh(new THREE.RingGeometry(ARENA * 1.2, 260, 4, 1), new THREE.MeshStandardMaterial({ color: '#6fae4c', roughness: 1 }))
outside.rotation.x = -Math.PI / 2
outside.rotation.z = Math.PI / 4
outside.position.y = -0.02
scene.add(outside)
const verge = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2.6, ARENA * 2.6), new THREE.MeshStandardMaterial({ color: '#7cb954', roughness: 1 }))
verge.rotation.x = -Math.PI / 2
verge.position.y = -0.03
verge.receiveShadow = true
scene.add(verge)

// Painted target in the middle of the arena.
{
  const mat = new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.35 })
  for (const [a, b] of [[6.2, 6.8], [12, 12.4]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(a, b, 48), mat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02
    scene.add(ring)
  }
}

// --- Models -----------------------------------------------------------------------------

const loader = new GLTFLoader()
export const models = { tanks: {}, props: {} }

async function loadGlb(url) {
  try {
    return await loader.loadAsync(url)
  } catch (e) {
    console.warn('Could not load', url, e)
    return null
  }
}

export async function loadModels(onProgress) {
  const [tanks, arena] = await Promise.all([loadGlb('./models/tanks.glb').finally(() => onProgress?.(0.5)), loadGlb('./models/arena.glb').finally(() => onProgress?.(1))])
  const take = (gltf, name, into, key) => {
    const node = gltf?.scene.getObjectByName(name)
    if (!node) return
    node.position.set(0, 0, 0)
    node.traverse(prepMesh)
    into[key] = node
  }
  for (const t of [1, 2, 3, 4]) take(tanks, `tank_${t}`, models.tanks, t)
  for (const name of ['crate', 'wall', 'rock', 'barrel', 'tree', 'tower', 'tires', 'pad']) take(arena, name, models.props, name)
}

function prepMesh(o) {
  if (!o.isMesh) return
  o.castShadow = true
  o.receiveShadow = true
}

// Simple stand-ins when a model is missing, so the game always runs.
const fallbackMats = {
  crate: new THREE.MeshStandardMaterial({ color: '#b07a3f' }),
  wall: new THREE.MeshStandardMaterial({ color: '#9aa0a6' }),
  rock: new THREE.MeshStandardMaterial({ color: '#7d7a73', flatShading: true }),
  barrel: new THREE.MeshStandardMaterial({ color: '#ff6ec7' }),
  tree: new THREE.MeshStandardMaterial({ color: '#2d8a4e', flatShading: true }),
  tower: new THREE.MeshStandardMaterial({ color: '#8d8478' }),
  tires: new THREE.MeshStandardMaterial({ color: '#222' }),
  pad: new THREE.MeshStandardMaterial({ color: '#4cc9f0', emissive: '#4cc9f0', emissiveIntensity: 0.6 }),
}
function fallbackProp(name) {
  const geo = {
    crate: () => new THREE.BoxGeometry(2, 2, 2).translate(0, 1, 0),
    wall: () => new THREE.BoxGeometry(4, 1.6, 1).translate(0, 0.8, 0),
    rock: () => new THREE.IcosahedronGeometry(1.5, 0).scale(1, 0.75, 1).translate(0, 0.9, 0),
    barrel: () => new THREE.CylinderGeometry(0.6, 0.6, 1.3, 12).translate(0, 0.65, 0),
    tree: () => new THREE.ConeGeometry(1.4, 4, 7).translate(0, 3, 0),
    tower: () => new THREE.BoxGeometry(4, 5, 4).translate(0, 2.5, 0),
    tires: () => new THREE.CylinderGeometry(0.8, 0.8, 1.2, 12).translate(0, 0.6, 0),
    pad: () => new THREE.CylinderGeometry(1.2, 1.2, 0.1, 24).translate(0, 0.05, 0),
  }[name]()
  const m = new THREE.Mesh(geo, fallbackMats[name])
  m.castShadow = m.receiveShadow = true
  const g = new THREE.Group()
  g.add(m)
  return g
}

/** A prop's source model, or a simple stand-in when it didn't load. */
const propSource = (name) => (models.props[name] ??= fallbackProp(name))
const prop = (name) => propSource(name).clone()

// --- Layout -----------------------------------------------------------------------------

export const SPAWNS = [
  [38, 0], [-38, 0], [0, 38], [0, -38], [34, 34], [-34, 34], [34, -34], [-34, -34],
]
export const PADS = [
  [9, 9], [-9, 9], [9, -9], [-9, -9], [26, 0], [-26, 0], [0, 26], [0, -26], [30, 28], [-30, -28],
]

/** Static colliders: boxes {x,z,hx,hz} and circles {x,z,r}. Paint buckets are circles with `barrel` set. */
export const colliders = { boxes: [], circles: [] }
export const barrels = [] // paint buckets: { x, z, alive, mesh }

let arenaGroup = null

export function buildArena(seed) {
  if (arenaGroup) {
    scene.remove(arenaGroup)
    arenaGroup.traverse((o) => o.isMesh && o.geometry.dispose())
  }
  arenaGroup = new THREE.Group()
  colliders.boxes.length = 0
  colliders.circles.length = 0
  barrels.length = 0

  const r = rng(seed)
  const placed = [] // { name, x, z, rot }
  const blocked = [] // circles to keep clear: { x, z, r }
  const fits = (x, z, rad) =>
    Math.abs(x) < ARENA - rad - 3 &&
    Math.abs(z) < ARENA - rad - 3 &&
    blocked.every((b) => Math.hypot(b.x - x, b.z - z) > b.r + rad)
  for (const [x, z] of SPAWNS) blocked.push({ x, z, r: 6 })
  for (const [x, z] of PADS) blocked.push({ x, z, r: 3 })
  blocked.push({ x: 0, z: 0, r: 5 })

  // Center landmark.
  placed.push({ name: 'tower', x: 0, z: 0, rot: 0 })

  // Build one quadrant and mirror it into all four, so every spawn is fair.
  const quad = []
  const tryPlace = (name, rad, extra = {}) => {
    for (let i = 0; i < 40; i++) {
      const x = 6 + r() * (ARENA - 9)
      const z = 6 + r() * (ARENA - 9)
      const mirrored = [[x, z], [-x, z], [x, -z], [-x, -z]]
      if (mirrored.every(([mx, mz]) => fits(mx, mz, rad))) {
        for (const [mx, mz] of mirrored) blocked.push({ x: mx, z: mz, r: rad + 2.6 })
        quad.push({ name, x, z, rot: extra.rot ?? Math.floor(r() * 4) * (Math.PI / 2), ...extra })
        return
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    // L-shaped cover from two or three wall blocks.
    const horiz = r() < 0.5
    tryPlace('wallset', 6, { rot: horiz ? 0 : Math.PI / 2, len: 2 + Math.floor(r() * 2), hook: r() < 0.6 })
  }
  for (let i = 0; i < 2; i++) tryPlace('crates', 2.6, { count: 2 + Math.floor(r() * 3) })
  for (let i = 0; i < 2; i++) tryPlace('rock', 1.8)
  for (let i = 0; i < 2; i++) tryPlace('tree', 1.2)
  for (let i = 0; i < 3; i++) tryPlace('barrel', 0.8)
  tryPlace('tires', 1)
  tryPlace('tree', 1.2)

  for (const q of quad) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = q.x * sx
      const z = q.z * sz
      if (q.name === 'wallset') {
        const dirX = q.rot === 0 ? 1 : 0
        const dirZ = q.rot === 0 ? 0 : 1
        for (let k = 0; k < q.len; k++) {
          const off = (k - (q.len - 1) / 2) * 4
          placed.push({ name: 'wall', x: x + dirX * off, z: z + dirZ * off, rot: q.rot })
        }
        if (q.hook) {
          // A return block at the end nearest the middle, making an L of cover.
          const sxn = Math.sign(x) || 1
          const szn = Math.sign(z) || 1
          if (dirX) placed.push({ name: 'wall', x: x - sxn * (q.len * 2 - 0.5), z: z - szn * 2.5, rot: Math.PI / 2 })
          else placed.push({ name: 'wall', x: x - sxn * 2.5, z: z - szn * (q.len * 2 - 0.5), rot: 0 })
        }
      } else if (q.name === 'crates') {
        for (let k = 0; k < q.count; k++) {
          const cx = x + (k % 2) * 2.05 * Math.sign(x)
          const cz = z + Math.floor(k / 2) * 2.05 * Math.sign(z)
          placed.push({ name: 'crate', x: cx, z: cz, rot: 0 })
        }
      } else {
        placed.push({ name: q.name, x, z, rot: q.rot })
      }
    }
  }

  // Border walls: just for looks, since movement and blobs are clamped to the arena.
  const n = Math.ceil((ARENA * 2) / 4)
  for (let i = 0; i < n; i++) {
    const p = -ARENA + 2 + i * 4
    placed.push({ name: 'wall', x: p, z: -ARENA - 0.5, rot: 0, edge: true })
    placed.push({ name: 'wall', x: p, z: ARENA + 0.5, rot: Math.PI, edge: true })
    placed.push({ name: 'wall', x: -ARENA - 0.5, z: p, rot: Math.PI / 2, edge: true })
    placed.push({ name: 'wall', x: ARENA + 0.5, z: p, rot: -Math.PI / 2, edge: true })
  }
  // Scenery outside the arena.
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2
    const d = ARENA + 4 + r() * 22
    const x = Math.cos(a) * d * 1.15
    const z = Math.sin(a) * d * 1.15
    if (Math.max(Math.abs(x), Math.abs(z)) < ARENA + 3) continue
    placed.push({ name: r() < 0.75 ? 'tree' : 'rock', x, z, rot: r() * Math.PI * 2, decor: true, scale: 0.8 + r() * 0.7 })
  }

  // Colliders and meshes.
  const statics = []
  for (const p of placed) {
    if (p.name === 'barrel') {
      const mesh = prop('barrel')
      mesh.position.set(p.x, 0, p.z)
      mesh.rotation.y = p.rot
      arenaGroup.add(mesh)
      const b = { x: p.x, z: p.z, r: 0.7, alive: true, mesh, barrel: barrels.length }
      barrels.push(b)
      colliders.circles.push(b)
      continue
    }
    statics.push(p)
    // Scenery is out of reach, and the border walls sit outside the ARENA clamp in pushOut/shellObstacle.
    if (p.decor || p.edge) continue
    const swap = Math.abs(Math.sin(p.rot)) > 0.5
    if (p.name === 'wall') colliders.boxes.push({ x: p.x, z: p.z, hx: swap ? 0.55 : 2.05, hz: swap ? 2.05 : 0.55 })
    else if (p.name === 'crate') colliders.boxes.push({ x: p.x, z: p.z, hx: 1.02, hz: 1.02 })
    else if (p.name === 'tower') colliders.boxes.push({ x: p.x, z: p.z, hx: 2.1, hz: 2.1 })
    else if (p.name === 'rock') colliders.circles.push({ x: p.x, z: p.z, r: 1.45 })
    else if (p.name === 'tree') colliders.circles.push({ x: p.x, z: p.z, r: 0.7 })
    else if (p.name === 'tires') colliders.circles.push({ x: p.x, z: p.z, r: 0.85 })
  }
  arenaGroup.add(bake(statics))

  for (const [x, z] of PADS) {
    const pad = prop('pad')
    pad.position.set(x, 0.01, z)
    arenaGroup.add(pad)
  }
  scene.add(arenaGroup)
}

/** Merges every static prop into one mesh per material: hundreds of props, a handful of draw calls. */
function bake(list) {
  const byMat = new Map()
  const tmp = new THREE.Object3D()
  for (const p of list) {
    const src = propSource(p.name)
    tmp.position.set(p.x, 0, p.z)
    tmp.rotation.set(0, p.rot, 0)
    tmp.scale.setScalar(p.scale ?? 1)
    tmp.updateMatrixWorld(true)
    src.updateMatrixWorld(true)
    src.traverse((o) => {
      if (!o.isMesh) return
      const m = new THREE.Matrix4().multiplyMatrices(tmp.matrixWorld, o.matrixWorld)
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
      if (!g.attributes.normal) g.computeVertexNormals()
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      g.applyMatrix4(m)
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      if (mats.length > 1 && g.groups.length) {
        for (const grp of g.groups) {
          const part = g.clone()
          part.clearGroups()
          // Keep only this group's triangles.
          for (const name of Object.keys(part.attributes)) {
            const a = part.attributes[name]
            part.setAttribute(name, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize))
          }
          add(byMat, mats[grp.materialIndex], part)
        }
      } else add(byMat, mats[0], g)
    })
  }
  const group = new THREE.Group()
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false)
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, mat)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}
function add(map, mat, g) {
  if (!map.has(mat)) map.set(mat, [])
  map.get(mat).push(g)
}

// --- Collision helpers ------------------------------------------------------------------

/** Pushes a circle out of walls and props. Returns true if it touched something. */
export function pushOut(pos, rad) {
  let hit = false
  const lim = ARENA - rad
  if (pos.x > lim) ((pos.x = lim), (hit = true))
  if (pos.x < -lim) ((pos.x = -lim), (hit = true))
  if (pos.z > lim) ((pos.z = lim), (hit = true))
  if (pos.z < -lim) ((pos.z = -lim), (hit = true))
  for (const b of colliders.boxes) {
    const cx = Math.max(b.x - b.hx, Math.min(pos.x, b.x + b.hx))
    const cz = Math.max(b.z - b.hz, Math.min(pos.z, b.z + b.hz))
    let dx = pos.x - cx
    let dz = pos.z - cz
    const d2 = dx * dx + dz * dz
    if (d2 >= rad * rad) continue
    hit = true
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2)
      pos.x = cx + (dx / d) * rad
      pos.z = cz + (dz / d) * rad
    } else {
      // Centre inside the box: leave by the nearest side.
      const px = b.hx - Math.abs(pos.x - b.x)
      const pz = b.hz - Math.abs(pos.z - b.z)
      if (px < pz) pos.x = b.x + Math.sign(pos.x - b.x || 1) * (b.hx + rad)
      else pos.z = b.z + Math.sign(pos.z - b.z || 1) * (b.hz + rad)
    }
  }
  for (const c of colliders.circles) {
    if (c.barrel !== undefined && !c.alive) continue
    const dx = pos.x - c.x
    const dz = pos.z - c.z
    const min = rad + c.r
    const d2 = dx * dx + dz * dz
    if (d2 >= min * min) continue
    hit = true
    const d = Math.sqrt(d2) || 0.001
    pos.x = c.x + (dx / d) * min
    pos.z = c.z + (dz / d) * min
  }
  return hit
}

/**
 * Where a moving paint blob hits something this step: { nx, nz, barrel } or null.
 * `px,pz` is the previous position, used to tell which side of a box was hit.
 */
export function shellObstacle(x, z, px, pz, rad) {
  if (Math.abs(x) > ARENA - rad) return { nx: -Math.sign(x), nz: 0 }
  if (Math.abs(z) > ARENA - rad) return { nx: 0, nz: -Math.sign(z) }
  for (const b of colliders.boxes) {
    if (Math.abs(x - b.x) > b.hx + rad || Math.abs(z - b.z) > b.hz + rad) continue
    const wasOutX = Math.abs(px - b.x) > b.hx + rad - 1e-3
    const wasOutZ = Math.abs(pz - b.z) > b.hz + rad - 1e-3
    if (wasOutX && !wasOutZ) return { nx: Math.sign(px - b.x), nz: 0 }
    if (wasOutZ && !wasOutX) return { nx: 0, nz: Math.sign(pz - b.z) }
    const ox = b.hx + rad - Math.abs(x - b.x)
    const oz = b.hz + rad - Math.abs(z - b.z)
    return ox < oz ? { nx: Math.sign(x - b.x || 1), nz: 0 } : { nx: 0, nz: Math.sign(z - b.z || 1) }
  }
  for (const c of colliders.circles) {
    if (c.barrel !== undefined && !c.alive) continue
    const dx = x - c.x
    const dz = z - c.z
    const d = Math.hypot(dx, dz)
    if (d > c.r + rad) continue
    return { nx: dx / (d || 1), nz: dz / (d || 1), barrel: c.barrel }
  }
  return null
}

/** True if nothing solid is between two points (for bots). */
export function lineOfSight(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az)
  const steps = Math.ceil(d / 0.8)
  let px = ax
  let pz = az
  for (let i = 1; i < steps; i++) {
    const x = ax + ((bx - ax) * i) / steps
    const z = az + ((bz - az) * i) / steps
    const hit = shellObstacle(x, z, px, pz, 0.25)
    if (hit && hit.barrel === undefined) return false
    px = x
    pz = z
  }
  return true
}

export function freeSpot() {
  for (let i = 0; i < 60; i++) {
    const p = { x: (Math.random() * 2 - 1) * (ARENA - 4), z: (Math.random() * 2 - 1) * (ARENA - 4) }
    const q = { ...p }
    if (!pushOut(q, 2.2)) return p
  }
  return { x: 0, z: 12 }
}
