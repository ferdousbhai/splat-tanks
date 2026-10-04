// All sound is synthesised with Web Audio: no files to load, and it starts on the first tap or key.

let ctx = null
let master, sfx, musicBus
let noiseBuf = null
let musicOn = true
let musicTimer = null

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
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
  musicBus.gain.value = 0.22
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

function noise(t, dur, { freq = 1000, q = 1, type = 'lowpass', peak = 0.5, attack = 0.005, sweepTo = null, out = sfx } = {}) {
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
  src.connect(f).connect(g).connect(out)
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

/** vol: 0..1 by distance from the listener. */
export const sound = {
  /** A squirt: a quick rising bloop. */
  shoot(vol = 1, big = false) {
    if (!ctx || vol < 0.03) return
    const t = now()
    tone(t, big ? 0.3 : 0.12, { freq: big ? 220 : 380, to: big ? 520 : 900, type: 'sine', peak: 0.35 * vol })
    noise(t, 0.06, { freq: 2500, type: 'bandpass', q: 3, peak: 0.12 * vol })
  },
  /** A big splosh: a bucket or a balloon bursting. */
  splosh(vol = 1) {
    if (!ctx || vol < 0.03) return
    const t = now()
    noise(t, 0.45, { freq: 1400, sweepTo: 200, peak: 0.6 * vol, q: 1.5 })
    tone(t, 0.25, { freq: 300, to: 90, type: 'sine', peak: 0.4 * vol })
    ;[523, 784].forEach((f, i) => tone(t + 0.12 + i * 0.07, 0.15, { freq: f, type: 'triangle', peak: 0.12 * vol }))
  },
  /** A blob landing. */
  splat(vol = 1) {
    if (!ctx || vol < 0.03) return
    const t = now()
    noise(t, 0.12, { freq: 900 + Math.random() * 500, sweepTo: 250, type: 'bandpass', q: 1.2, peak: 0.35 * vol })
    tone(t, 0.08, { freq: 200, to: 120, type: 'sine', peak: 0.2 * vol })
  },
  /** Your blob splashed another tank. */
  hitMarker() {
    if (!ctx) return
    const t = now()
    tone(t, 0.08, { freq: 1046, type: 'triangle', peak: 0.12 })
    tone(t + 0.06, 0.1, { freq: 1568, type: 'triangle', peak: 0.1 })
  },
  /** You got splashed: a silly boing. */
  boing() {
    if (!ctx) return
    tone(now(), 0.3, { freq: 180, to: 520, type: 'sine', peak: 0.25 })
  },
  bounce(vol = 1) {
    if (!ctx || vol < 0.05) return
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
  levelUp() {
    if (!ctx) return
    const t = now()
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.07, 0.25, { freq: f, type: 'triangle', peak: 0.16 }))
  },
  evolve() {
    if (!ctx) return
    const t = now()
    tone(t, 0.8, { freq: 200, to: 800, type: 'sine', peak: 0.2 })
    ;[392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + 0.3 + i * 0.09, 0.4, { freq: f, type: 'triangle', peak: 0.16 }))
  },
  cheer() {
    if (!ctx) return
    const t = now()
    ;[523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.12, 0.3, { freq: f, type: 'triangle', peak: 0.18 }))
  },
  click() {
    if (!ctx) return
    tone(now(), 0.05, { freq: 900, type: 'triangle', peak: 0.12 })
  },
  countdown(final = false) {
    if (!ctx) return
    tone(now(), final ? 0.5 : 0.2, { freq: final ? 1046 : 523, type: 'triangle', peak: 0.25 })
  },
}

// --- Announcer: uses the browser's speech voice when it has one ------------------------

export function announce(text) {
  try {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1
    u.pitch = 1.3
    u.volume = 0.9
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch {
    /* no voice in this browser; the banner is enough */
  }
}

// --- Music: a bouncy 120 bpm loop in C major, built from the same synths ----------------

const BPM = 120
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
    if (s % 4 === 0) tone(t, 0.18, { freq: 110, to: 50, type: 'sine', peak: 0.6, out: musicBus })
    if (s % 8 === 4) noise(t, 0.08, { freq: 3000, type: 'bandpass', q: 1.5, peak: 0.25, out: musicBus })
    if (s % 2 === 1) noise(t, 0.03, { freq: 9000, type: 'highpass', peak: 0.1, out: musicBus })
    if (BASS[s] !== null) tone(t, STEP * 1.4, { freq: ROOTS[bar] * Math.pow(2, BASS[s] / 12), type: 'triangle', peak: 0.35, out: musicBus })
    if (bar === 3 && s % 2 === 0) tone(t, STEP * 1.6, { freq: 261.6 * Math.pow(2, MELODY[s / 2] / 12), type: 'square', peak: 0.05, out: musicBus })
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
  musicBus.gain.setTargetAtTime(battle ? 0.22 : 0.12, ctx.currentTime, 0.5)
}
