// The HUD: banners, news feed, paint leaderboard, paint/XP bars, upgrade cards, minimap, results.
import { ARENA, UPGRADES, xpToNext, MAX_LEVEL, tierFor, PICKUPS } from './config.js'
import { colliders, barrels } from './world.js'
import { canvas as paintCanvas, cellsOf, CELLS } from './paint.js'

/** Share of the arena floor in a tank's colour, as a whole percentage. */
export const pct = (t) => Math.round((cellsOf(t.slot) / CELLS) * 100)

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

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

export function toast(text, ms = 2500) {
  const t = $('toast')
  t.textContent = text
  t.classList.remove('hidden')
  setTimeout(() => t.classList.add('hidden'), ms)
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
export const tag = (t) => `<b style="color:${t.color}">${esc(t.name)}</b>`

let boardKey = ''
export function board(tanks, me) {
  const sorted = [...tanks].sort((a, b) => cellsOf(b.slot) - cellsOf(a.slot) || b.level - a.level)
  let rows = sorted.slice(0, 6)
  if (me && !rows.includes(me)) rows = [...rows.slice(0, 5), me]
  const key = rows.map((t) => `${t.id}${pct(t)}${t.level}`).join('|')
  if (key === boardKey) return sorted
  boardKey = key
  $('board').innerHTML = rows
    .map((t) => `<div class="brow${t === me ? ' me' : ''}" style="border-color:${t.color}"><span class="sw" style="background:${t.color}"></span><span class="n">${t.bot ? '🤖 ' : ''}${esc(t.name)}</span><span class="l">Lv${t.level}</span><span class="k">${pct(t)}%</span></div>`)
    .join('')
  return sorted
}

/** best: the most cells any tank has painted, so the bar is full when you lead. */
export function bars(me, best, now) {
  const mine = cellsOf(me.slot)
  $('paintfill').style.width = `${best ? (mine / best) * 100 : 0}%`
  $('paintfill').style.background = me.color
  $('painttext').textContent = `🎨 ${pct(me)}%`
  const need = xpToNext(me.level)
  $('xpfill').style.width = me.level >= MAX_LEVEL ? '100%' : `${Math.min(100, (me.xp / need) * 100)}%`
  const lvl = $('lvl')
  if (lvl.textContent !== String(me.level)) {
    lvl.textContent = me.level
    lvl.classList.remove('bump')
    void lvl.offsetWidth
    lvl.classList.add('bump')
  }
  $('tiername').textContent = `${tierFor(me.level).name}${me.level >= MAX_LEVEL ? ' · MAX' : ''}`
  cooldown($('ab-boost'), me.boostReadyAt, 4000, now, true)
  cooldown($('ab-mega'), me.megaReadyAt, 6000, now, me.stats.mega)
  document.getElementById('btn-mega').style.opacity = me.stats.mega ? (now >= me.megaReadyAt ? 1 : 0.4) : 0.15
  document.getElementById('btn-boost').style.opacity = now >= me.boostReadyAt ? 1 : 0.4
  const buffs = []
  if (now < me.rapidUntil) buffs.push(`💦 ${Math.ceil((me.rapidUntil - now) / 1000)}`)
  if (now < me.rollerUntil) buffs.push(`🖌️ ${Math.ceil((me.rollerUntil - now) / 1000)}`)
  const html = buffs.map((b) => `<span class="buff">${b}</span>`).join('')
  if ($('buffs').innerHTML !== html) $('buffs').innerHTML = html
}
function cooldown(el, readyAt, total, now, unlocked) {
  el.classList.toggle('locked', !unlocked)
  const left = Math.max(0, readyAt - now)
  el.querySelector('i').style.height = `${(left / total) * 100}%`
  el.classList.toggle('ready', unlocked && left === 0)
}

export function timer(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000))
  const t = $('timer')
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  if (t.textContent !== text) t.textContent = text
  t.classList.toggle('urgent', s <= 30)
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
export function resetMinimap() {
  mapBg = null
}
export function minimap(tanks, me, pads) {
  const c = $('minimap')
  const g = c.getContext('2d')
  const S = c.width
  const k = S / (ARENA * 2 + 4)
  const X = (x) => (x + ARENA + 2) * k
  if (!mapBg) {
    mapBg = document.createElement('canvas')
    mapBg.width = mapBg.height = S
    const b = mapBg.getContext('2d')
    b.fillStyle = 'rgba(201,166,107,0.35)'
    b.fillRect(X(-ARENA), X(-ARENA), ARENA * 2 * k, ARENA * 2 * k)
    b.fillStyle = 'rgba(255,255,255,0.55)'
    for (const box of colliders.boxes) b.fillRect(X(box.x - box.hx), X(box.z - box.hz), box.hx * 2 * k, box.hz * 2 * k)
    for (const ci of colliders.circles) {
      if (ci.barrel !== undefined) continue
      b.beginPath()
      b.arc(X(ci.x), X(ci.z), Math.max(1.2, ci.r * k), 0, Math.PI * 2)
      b.fill()
    }
  }
  g.clearRect(0, 0, S, S)
  g.drawImage(mapBg, 0, 0)
  g.globalAlpha = 0.85
  g.drawImage(paintCanvas, X(-ARENA), X(-ARENA), ARENA * 2 * k, ARENA * 2 * k)
  g.globalAlpha = 1
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

/** The end screen: everyone gets a medal; the gold, silver and bronze go to the most paint. */
export function results(sorted, me, total) {
  $('end-title').textContent = '🎉 Great painting!'
  $('end-sub').innerHTML = `Together you painted <b>${total}%</b> of the floor!`
  const medal = ['🥇', '🥈', '🥉']
  $('results').innerHTML = sorted
    .map((t, i) => `<div class="rrow${t === me ? ' me' : ''}" style="border-color:${t.color}"><span class="pos">${medal[i] ?? '🌟'}</span><span class="sw" style="background:${t.color}"></span><span>${t.bot ? '🤖 ' : ''}${esc(t.name)}</span><span>🎨 ${pct(t)}%</span><span>Lv ${t.level}</span></div>`)
    .join('')
}

export { esc }
