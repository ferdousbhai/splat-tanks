// The HUD: banners, news feed, paint leaderboard, paint/XP bars, upgrade cards, minimap, fraction strip, results.
import { ARENA, UPGRADES, BASE, xpToNext, MAX_LEVEL, tierFor, PICKUPS } from './config.js'
import { colliders, barrels } from './world.js'
import { canvas as paintCanvas, cellsOf, byPaint, paintVersion, CELLS } from './paint.js'
import { layout, chalkLines, fractionWords, partsName } from './parts.js'

/** Share of the arena floor in a tank's colour, as a whole percentage. */
const pct = (t) => Math.round((cellsOf(t.slot) / CELLS) * 100)

const els = {}
export const $ = (id) => (els[id] ??= document.getElementById(id))
// Per-frame HUD values: only touch the DOM when one actually changes.
const shown = new WeakMap()
/** Returns true when the value changed. */
function put(el, prop, v) {
  const last = shown.get(el) ?? shown.set(el, {}).get(el)
  if (last[prop] === v) return false
  last[prop] = v
  if (prop === 'text') el.textContent = v
  else if (prop === 'html') el.innerHTML = v
  else el.style[prop] = v
  return true
}
const cssPct = (v) => `${Math.round(v * 1000) / 10}%`
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

let bannerTimer = null
let subTimer = null
export function banner(text, sub = '', ms = 1600) {
  const b = $('banner')
  b.textContent = text
  b.classList.remove('show')
  void b.offsetWidth
  b.classList.add('show')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => b.classList.remove('show'), ms)
  if (sub) subBanner(sub, ms)
}
export function subBanner(text, ms = 2000) {
  const s = $('subbanner')
  s.textContent = text
  s.classList.add('show')
  clearTimeout(subTimer)
  subTimer = setTimeout(() => s.classList.remove('show'), ms)
}

let toastTimer = null
export function toast(text, ms = 2500) {
  const t = $('toast')
  t.textContent = text
  t.classList.remove('hidden')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms)
}

/** Leaving a round: nothing left over from it stays on screen. */
export function clearBanners() {
  clearTimeout(bannerTimer)
  clearTimeout(subTimer)
  $('banner').classList.remove('show')
  $('subbanner').classList.remove('show')
}

export function feed(html) {
  const box = $('feed')
  const row = document.createElement('div')
  row.className = 'news'
  row.innerHTML = html
  box.prepend(row)
  while (box.children.length > 4) box.lastChild.remove()
  setTimeout(() => row.remove(), 6000)
}
export const tag = (t) => `<b style="color:${esc(t.color)}">${esc(t.name)}</b>`

let boardKey = ''
export function board(tanks, me) {
  const sorted = [...tanks].sort(byPaint)
  let rows = sorted.slice(0, 6)
  if (me && !rows.includes(me)) rows = [...rows.slice(0, 5), me]
  const key = rows.map((t) => `${t.id}${pct(t)}${t.level}`).join('|')
  if (key === boardKey) return sorted
  boardKey = key
  $('board').innerHTML = rows
    .map((t) => `<div class="brow${t === me ? ' me' : ''}" style="border-color:${esc(t.color)}"><span class="sw" style="background:${esc(t.color)}"></span><span class="n">${t.bot ? '🤖 ' : ''}${esc(t.name)}</span><span class="l">Lv${esc(t.level)}</span><span class="k">${pct(t)}%</span></div>`)
    .join('')
  return sorted
}

/** best: the most cells any tank has painted, so the bar is full when you lead. */
export function bars(me, best, now) {
  put($('paintfill'), 'width', cssPct(best ? cellsOf(me.slot) / best : 0))
  put($('paintfill'), 'background', me.color)
  put($('painttext'), 'text', `🎨 ${pct(me)}%`)
  put($('xpfill'), 'width', cssPct(me.level >= MAX_LEVEL ? 1 : Math.min(1, me.xp / xpToNext(me.level))))
  const lvl = $('lvl')
  if (put(lvl, 'text', String(me.level))) {
    lvl.classList.remove('bump')
    void lvl.offsetWidth
    lvl.classList.add('bump')
  }
  put($('tiername'), 'text', `${tierFor(me.level).name}${me.level >= MAX_LEVEL ? ' · MAX' : ''}`)
  cooldown($('ab-boost'), me.boostReadyAt, BASE.boostCooldown * 1000, now, true)
  cooldown($('ab-mega'), me.megaReadyAt, BASE.megaCooldown * 1000, now, me.stats.mega)
  put($('btn-mega'), 'opacity', String(me.stats.mega ? (now >= me.megaReadyAt ? 1 : 0.4) : 0.15))
  put($('btn-boost'), 'opacity', String(now >= me.boostReadyAt ? 1 : 0.4))
  const buffs = []
  if (now < me.rapidUntil) buffs.push(`💦 ${Math.ceil((me.rapidUntil - now) / 1000)}`)
  if (now < me.rollerUntil) buffs.push(`🖌️ ${Math.ceil((me.rollerUntil - now) / 1000)}`)
  put($('buffs'), 'html', buffs.map((b) => `<span class="buff">${b}</span>`).join(''))
}
function cooldown(el, readyAt, total, now, unlocked) {
  el.classList.toggle('locked', !unlocked)
  const left = Math.max(0, readyAt - now)
  put(el.querySelector('i'), 'height', cssPct(left / total))
  el.classList.toggle('ready', unlocked && left === 0)
}

export function timer(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000))
  const t = $('timer')
  put(t, 'text', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
}

/**
 * Paint together: one box per part, laid out like the floor (a 2 x 2 square for square quarters,
 * else a row), each filling up as it's painted. mine: the part the player is in.
 */
export function fraction(progress, mine) {
  const box = $('fraction')
  const key = `${layout.n}|${layout.grid}`
  if (box.dataset.key !== key) {
    box.dataset.key = key
    box.classList.toggle('grid', layout.grid)
    box.innerHTML = progress.map(() => `<span class="part"><i></i><b><sup>1</sup><sub>${layout.n}</sub></b></span>`).join('')
  }
  const done = layout.done.filter(Boolean).length
  progress.forEach((v, p) => {
    const part = box.children[p]
    part.classList.toggle('done', layout.done[p])
    part.classList.toggle('mine', p === mine)
    put(part.firstChild, 'height', cssPct(Math.min(1, v)))
  })
  put($('fraction-words'), 'text', `${done ? fractionWords(done, layout.n) : `${layout.n} ${partsName(layout.n)}`} ${done ? 'painted' : 'to paint'}`)
}

/** Shows the three upgrade cards; onPick(key) when one is chosen. */
export function showUpgrades(offer, upgrades, pending, onPick) {
  const box = $('upgrades')
  if (!offer) {
    box.classList.add('hidden')
    box.dataset.key = ''
    return
  }
  const key = offer.join() + pending
  if (box.dataset.key === key) return
  box.dataset.key = key
  box.classList.remove('hidden')
  $('up-count').textContent = pending > 1 ? `(${pending} left)` : ''
  const cards = $('up-cards')
  cards.innerHTML = ''
  offer.forEach((k, i) => {
    const u = UPGRADES[k]
    const b = document.createElement('button')
    b.className = 'card'
    b.innerHTML = `<span class="key">${i + 1}</span><span class="ic">${u.icon}</span><span class="nm">${u.name}</span><span class="tx">${u.text}</span><span class="pips">${Array.from({ length: u.max }, (_, j) => `<i class="${j < upgrades[k] ? 'on' : ''}"></i>`).join('')}</span>`
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      e.preventDefault()
      onPick(k)
    })
    cards.appendChild(b)
  })
}

// --- Minimap -----------------------------------------------------------------------------

let mapBg = null
let mapCtx = null
const mapLayer = document.createElement('canvas') // the arena and its paint, redrawn only when the paint changes
let layerVersion = -1
export function resetMinimap() {
  mapBg = null
}
export function minimap(tanks, me, pads) {
  const c = $('minimap')
  const g = (mapCtx ??= c.getContext('2d'))
  const S = c.width
  const k = S / (ARENA * 2 + 4)
  const X = (x) => (x + ARENA + 2) * k
  if (!mapBg) {
    layerVersion = -1
    mapBg = document.createElement('canvas')
    mapBg.width = mapBg.height = mapLayer.width = mapLayer.height = S
    const b = mapBg.getContext('2d')
    b.fillStyle = 'rgba(201,166,107,0.35)'
    b.fillRect(X(-ARENA), X(-ARENA), ARENA * 2 * k, ARENA * 2 * k)
    b.strokeStyle = 'rgba(255,255,255,0.55)'
    b.lineWidth = 2
    b.strokeRect(X(-ARENA), X(-ARENA), ARENA * 2 * k, ARENA * 2 * k)
    b.fillStyle = 'rgba(255,255,255,0.55)'
    for (const box of colliders.boxes) b.fillRect(X(box.x - box.hx), X(box.z - box.hz), box.hx * 2 * k, box.hz * 2 * k)
    for (const ci of colliders.circles) {
      if (ci.barrel !== undefined) continue
      b.beginPath()
      b.arc(X(ci.x), X(ci.z), Math.max(1.2, ci.r * k), 0, Math.PI * 2)
      b.fill()
    }
  }
  if (layerVersion !== paintVersion) {
    layerVersion = paintVersion
    const l = mapLayer.getContext('2d')
    l.clearRect(0, 0, S, S)
    l.drawImage(mapBg, 0, 0)
    l.globalAlpha = 0.85
    l.drawImage(paintCanvas, X(-ARENA), X(-ARENA), ARENA * 2 * k, ARENA * 2 * k)
    l.globalAlpha = 1
    chalkLines(l, X)
  }
  g.clearRect(0, 0, S, S)
  g.drawImage(mapLayer, 0, 0)
  g.fillStyle = '#ffffff'
  for (const b of barrels) if (b.alive) g.fillRect(X(b.x) - 1.5, X(b.z) - 1.5, 3, 3)
  for (const p of pads) {
    if (!p.kind) continue
    g.fillStyle = PICKUPS[p.kind].color
    g.beginPath()
    g.arc(X(p.x), X(p.z), 3, 0, Math.PI * 2)
    g.fill()
  }
  for (const t of tanks) {
    if (!t.alive) continue
    g.fillStyle = t.color
    g.strokeStyle = t === me ? '#fff' : 'rgba(0,0,0,0.6)'
    g.lineWidth = t === me ? 2 : 1
    g.save()
    g.translate(X(t.pos.x), X(t.pos.z))
    g.rotate(-t.heading)
    g.beginPath()
    const r = t === me ? 6 : 4.5
    g.moveTo(0, -r)
    g.lineTo(r * 0.8, r * 0.8)
    g.lineTo(-r * 0.8, r * 0.8)
    g.closePath()
    g.fill()
    g.stroke()
    g.restore()
  }
}

/** The finished floor as a picture, chalk lines and all. */
function floorPicture() {
  const c = document.createElement('canvas')
  c.width = c.height = 240
  const g = c.getContext('2d')
  const X = (x) => ((x + ARENA) / (ARENA * 2)) * c.width
  g.fillStyle = '#c9a66b'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(paintCanvas, 0, 0, c.width, c.height)
  chalkLines(g, X)
  c.className = 'floor-pic'
  c.setAttribute('role', 'img')
  c.setAttribute('aria-label', 'The floor we painted')
  return c
}

/** The end screen. Together: the floor we painted and who painted it, with no ranking. */
export function results(sorted, me, total, together) {
  $('results').classList.toggle('together', together)
  if (together) {
    const n = layout.n
    $('end-sub').innerHTML = `${esc(fractionWords(n, n).replace(/^\w/, (c) => c.toUpperCase()))} make <b>one whole</b> floor!`
    const who = document.createElement('div')
    who.className = 'painters'
    who.innerHTML = sorted.map((t) => `<span class="chip${t === me ? ' me' : ''}" style="border-color:${esc(t.color)}"><span class="sw" style="background:${esc(t.color)}"></span>${t.bot ? '🤖 ' : ''}${esc(t.name)}</span>`).join('')
    $('results').replaceChildren(floorPicture(), who)
    return
  }
  $('end-sub').innerHTML = `Together you painted <b>${total}%</b> of the floor!`
  const medal = ['🥇', '🥈', '🥉']
  $('results').innerHTML = sorted
    .map((t, i) => `<div class="rrow${t === me ? ' me' : ''}" style="border-color:${esc(t.color)}"><span class="pos">${medal[i] ?? '🌟'}</span><span class="sw" style="background:${esc(t.color)}"></span><span>${t.bot ? '🤖 ' : ''}${esc(t.name)}</span><span>🎨 ${pct(t)}%</span><span>Lv ${esc(t.level)}</span></div>`)
    .join('')
  $('results').querySelector('.rrow.me')?.scrollIntoView({ block: 'nearest' })
}

