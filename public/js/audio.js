// All sound is synthesised with Web Audio: no files to load, and it starts on the first tap or key.
// Soft sines and triangles at a steady pace: nothing shrill, nothing that hurries.
import { createVoice } from './speech.js'

let ctx = null
let master, sfx, musicBus
let noiseBuf = null
let musicOn = true
let musicTimer = null
let speechOpen = false

/**
 * Sound and speech wait for a gesture (iOS drops every spoken line until one is spoken inside a tap, and Chrome
 * too on a page not yet touched): call on each input event. The first one that counts as a gesture (a finger
 * lifting, a click, a key or a mouse press; not a finger landing) speaks a silent word to open speech, and returns
 * true, so the caller can repeat a line that went unheard before it.
 */
export function unlockAudio(e) {
  const gesture = ['touchend', 'click', 'keydown'].includes(e?.type) || (e?.type === 'pointerdown' && e.pointerType === 'mouse')
  const opening = !speechOpen && gesture
  if (opening && 'speechSynthesis' in window) {
    const hush = new SpeechSynthesisUtterance(' ')
    hush.volume = 0
    speechSynthesis.speak(hush)
  }
  speechOpen ||= gesture
  startSound()
  return opening
}

function startSound() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return
  }
  try {
    ctx = new AudioContext()
  } catch {
    return
  }
  master = ctx.createGain()
  master.gain.value = 0.8
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 6
  master.connect(comp).connect(ctx.destination)
  sfx = ctx.createGain()
  sfx.connect(master)
  musicBus = ctx.createGain()
  musicBus.gain.value = 0.1
  musicBus.connect(master)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  if (musicOn) startMusic()
}

const now = () => ctx.currentTime

function env(gainNode, t, attack, peak, decay) {
  gainNode.gain.setValueAtTime(0.0001, t)
  gainNode.gain.exponentialRampToValueAtTime(peak, t + attack)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function noise(t, dur, { freq = 1000, q = 1, type = 'lowpass', peak = 0.5, attack = 0.005, sweepTo = null } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
  f.Q.value = q
  const g = ctx.createGain()
  env(g, t, attack, peak, dur)
  src.connect(f).connect(g).connect(sfx)
  src.start(t, Math.random())
  src.stop(t + attack + dur + 0.05)
}

function tone(t, dur, { freq = 440, to = null, type = 'sine', peak = 0.3, attack = 0.005, out = sfx } = {}) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = ctx.createGain()
  env(g, t, attack, peak, dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + attack + dur + 0.05)
}

/**
 * Sounds are spaced out so many blobs make a soft patter rather than a stream: other tanks' squirts, splats and
 * bounces at most one every 150 ms; the player's own landings (a Titan's spray lands six at once) one every
 * 120 ms. The player's own squirt always plays, so every press is heard.
 */
const last = {}
function spaced(name, mine) {
  if (mine && name === 'shoot') return true
  const key = mine ? `${name}:mine` : name
  const t = ctx.currentTime
  if (t - (last[key] ?? -1) < (mine ? 0.12 : 0.15)) return false
  last[key] = t
  return true
}

/** vol: 0..1 by distance from the listener; mine: the player's own sound. */
export const sound = {
  /** A squirt: a quick rising bloop. */
  shoot(vol = 1, big = false, mine = false) {
    if (!ctx || vol < 0.03 || !spaced('shoot', mine)) return
    const t = now()
    tone(t, big ? 0.3 : 0.12, { freq: big ? 220 : 380, to: big ? 520 : 760, type: 'sine', peak: 0.22 * vol })
    noise(t, 0.06, { freq: 1800, type: 'bandpass', q: 3, peak: 0.05 * vol })
  },
  /** A big splosh: a bucket or a balloon bursting. */
  splosh(vol = 1) {
    if (!ctx || vol < 0.03) return
    const t = now()
    noise(t, 0.45, { freq: 1100, sweepTo: 200, peak: 0.35 * vol, q: 1.5 })
    tone(t, 0.25, { freq: 300, to: 90, type: 'sine', peak: 0.25 * vol })
    ;[523, 784].forEach((f, i) => tone(t + 0.12 + i * 0.07, 0.15, { freq: f, type: 'triangle', peak: 0.12 * vol }))
  },
  /** A blob landing. */
  splat(vol = 1, mine = false) {
    if (!ctx || vol < 0.03 || !spaced('splat', mine)) return
    const t = now()
    noise(t, 0.12, { freq: 900 + Math.random() * 500, sweepTo: 250, type: 'bandpass', q: 1.2, peak: 0.35 * vol })
    tone(t, 0.08, { freq: 200, to: 120, type: 'sine', peak: 0.2 * vol })
  },
  /** You got splashed: a silly boing. */
  boing() {
    if (!ctx) return
    tone(now(), 0.3, { freq: 180, to: 420, type: 'sine', peak: 0.12 })
  },
  /** A beach ball knocked along: a soft, hollow bonk. */
  thump(vol = 1, mine = false) {
    if (!ctx || vol < 0.05 || !spaced('thump', mine)) return
    const t = now()
    tone(t, 0.16, { freq: 210, to: 130, type: 'sine', peak: 0.22 * vol })
    tone(t, 0.1, { freq: 420, to: 300, type: 'triangle', peak: 0.05 * vol })
  },
  bounce(vol = 1, mine = false) {
    if (!ctx || vol < 0.05 || !spaced('bounce', mine)) return
    tone(now(), 0.08, { freq: 900, to: 1400, type: 'triangle', peak: 0.12 * vol })
  },
  boost() {
    if (!ctx) return
    const t = now()
    noise(t, 0.4, { freq: 600, sweepTo: 2500, type: 'bandpass', q: 2, peak: 0.25 })
    tone(t, 0.35, { freq: 260, to: 700, type: 'triangle', peak: 0.12 })
  },
  pickup() {
    if (!ctx) return
    const t = now()
    ;[660, 880, 1320].forEach((f, i) => tone(t + i * 0.06, 0.15, { freq: f, type: 'triangle', peak: 0.16 }))
  },
  /** One step up: two soft notes. */
  levelUp() {
    if (!ctx) return
    const t = now()
    ;[523, 784].forEach((f, i) => tone(t + i * 0.12, 0.3, { freq: f, type: 'sine', peak: 0.1 }))
  },
  evolve() {
    if (!ctx) return
    const t = now()
    tone(t, 0.8, { freq: 200, to: 600, type: 'sine', peak: 0.12 })
    ;[392, 523, 659, 784].forEach((f, i) => tone(t + 0.3 + i * 0.14, 0.5, { freq: f, type: 'triangle', peak: 0.1 }))
  },
  cheer() {
    if (!ctx) return
    const t = now()
    // One soft chord, not a fanfare.
    ;[523, 659, 784].forEach((f, i) => tone(t + i * 0.05, 1.2, { freq: f, type: 'sine', peak: 0.09, attack: 0.08 }))
  },
  click() {
    if (!ctx) return
    tone(now(), 0.05, { freq: 900, type: 'triangle', peak: 0.12 })
  },
  countdown(final = false) {
    if (!ctx) return
    tone(now(), final ? 0.5 : 0.25, { freq: final ? 784 : 523, type: 'sine', peak: 0.12 })
  },
}

// --- Engine ------------------------------------------------------------------------------

let engine = null // { filters, g, lfo, level }, made on first use
/**
 * Your own tank's engine: a soft purr (low rumbling noise with a quick soft wobble, not a tone, so it never fights the
 * music's bass) that grows a little with speed (level 0..1) and dies away when it stops. Only your own, and at full
 * speed about 5 dB under the music as it sounds (A-weighted, on an iPad's speakers or a laptop's), so it stays in the
 * background.
 */
export function engineHum(level) {
  if (level < 0.01) level = 0 // a tank easing to a stop never quite gets there
  if (!ctx || ctx.state !== 'running' || (level === 0 && !engine?.level)) return
  if (!engine) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    // Two lowpass filters, so the noise above the rumble (a hiss, and all a small speaker would play) is cut away.
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    const f2 = ctx.createBiquadFilter()
    f2.type = 'lowpass'
    // The purr: loudness wobbling softly, nine to twelve times a second, quicker with speed.
    const wob = ctx.createGain()
    wob.gain.value = 0.6
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 9
    const amount = ctx.createGain()
    amount.gain.value = 0.4
    lfo.connect(amount).connect(wob.gain)
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(f2).connect(wob).connect(g).connect(sfx)
    src.start()
    lfo.start()
    engine = { filters: [f, f2], g, lfo, level: 0 }
  }
  engine.level = level
  const t = ctx.currentTime
  engine.g.gain.setTargetAtTime(0.1 * level, t, 0.15)
  for (const f of engine.filters) f.frequency.setTargetAtTime(120 + 70 * level, t, 0.2)
  engine.lfo.frequency.setTargetAtTime(9 + 3 * level, t, 0.2)
}

// The game stops drawing (and so stops calling engineHum) in a hidden tab or as the page goes, but sound plays on:
// hush the purr then.
const hushEngine = () => engineHum(0)
addEventListener('pagehide', hushEngine)
document.addEventListener('visibilitychange', () => document.hidden && hushEngine())

// --- Announcer: uses the browser's speech voice when it has one ------------------------

// Lines wait their turn instead of cutting each other off.
export const voice = createVoice({ rate: 0.9, pitch: 1.1 })

// --- Music: an easy 96 bpm loop in C major, built from the same synths --------------------

const BPM = 96
const STEP = 60 / BPM / 4
const BASS = [0, null, 7, null, 12, null, 7, null, 0, null, 7, null, 12, 7, 4, 2]
const ROOTS = [65.4, 98, 110, 87.3] // C2, G2, A2, F2 (Hz)
const MELODY = [12, 16, 19, 16, 14, 12, 7, 9] // played on the last bar of four
let step = 0
let nextTime = 0

function scheduleMusic() {
  while (nextTime < ctx.currentTime + 0.2) {
    const s = step % 16
    const bar = Math.floor(step / 16) % 4
    const t = nextTime
    if (s % 8 === 0) tone(t, 0.2, { freq: 100, to: 55, type: 'sine', peak: 0.35, out: musicBus })
    if (BASS[s] !== null) tone(t, STEP * 1.6, { freq: ROOTS[bar] * Math.pow(2, BASS[s] / 12), type: 'triangle', peak: 0.3, out: musicBus })
    if (bar === 3 && s % 2 === 0) tone(t, STEP * 1.8, { freq: 261.6 * Math.pow(2, MELODY[s / 2] / 12), type: 'triangle', peak: 0.08, out: musicBus })
    step++
    nextTime += STEP
  }
}

function startMusic() {
  if (!ctx || musicTimer) return
  nextTime = ctx.currentTime + 0.1
  musicTimer = setInterval(scheduleMusic, 50)
}

function stopMusic() {
  clearInterval(musicTimer)
  musicTimer = null
}

export function toggleMusic() {
  musicOn = !musicOn
  if (musicOn) startMusic()
  else stopMusic()
  return musicOn
}

/** Lowers the music during menus and raises it while playing. */
export function musicIntensity(battle) {
  if (!musicBus) return
  musicBus.gain.setTargetAtTime(battle ? 0.16 : 0.1, ctx.currentTime, 0.5)
}
