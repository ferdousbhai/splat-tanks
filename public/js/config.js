// Tuning for Splat Tanks. Everything that decides how the game feels lives here.

export const ARENA = 46 // half-size of the square arena (metres)
export const TANK_RADIUS = 1.35
export const MAX_LEVEL = 15
export const MATCH = {
  minutes: [2, 3, 5],
}

// Tiers grow your tank at these levels. Each one has its own Blender model.
export const TIERS = [
  { tier: 1, name: 'Squirter', level: 1, splat: 1, speed: 1.08, reload: 1 },
  { tier: 2, name: 'Splasher', level: 4, splat: 1.12, speed: 1.04, reload: 0.95, perk: '🎈 Paint balloons! (E / right-click)' },
  { tier: 3, name: 'Roller', level: 8, splat: 1.24, speed: 1.0, reload: 0.95, perk: '🖌️ Zoom paints a giant stripe!' },
  { tier: 4, name: 'Titan', level: 12, splat: 1.36, speed: 0.98, reload: 0.9, perk: '🌈 Two paint squirters!' },
]

export const tierFor = (level) => TIERS.filter((t) => level >= t.level).pop()

export const BASE = {
  splat: 2.1, // radius of a blob's splat on the floor (metres)
  reload: 0.5, // seconds between squirts
  speed: 9.5,
  shellSpeed: 26,
  range: 22,
  trail: 0.9, // radius of the paint trail behind a moving tank
  boostCooldown: 4,
  boostTime: 0.55,
  boostSpeed: 2.3,
  megaCooldown: 6,
  megaSplat: 6,
}

// Upgrade cards offered on every level up (pick 1 of 3).
export const UPGRADES = {
  big: { icon: '🎨', name: 'Big Splats', text: 'Bigger paint splats', max: 5 },
  reload: { icon: '⚡', name: 'Quick Squirt', text: 'Squirt faster', max: 5 },
  speed: { icon: '🛞', name: 'Zoomy Wheels', text: 'Drive faster', max: 4 },
  velocity: { icon: '🎯', name: 'Long Squirt', text: 'Paint flies farther', max: 4 },
  multi: { icon: '🌈', name: 'Spray', text: '+1 blob per squirt', max: 2 },
  ricochet: { icon: '🏀', name: 'Bouncy Blobs', text: 'Blobs bounce off walls', max: 3 },
  wide: { icon: '🖌️', name: 'Wide Wheels', text: 'Wider paint trail', max: 4 },
}

export const emptyLoadout = () => Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0]))

/** Everything a tank's numbers come from: its level (tier) and the upgrades picked. */
export function statsFor(level, u) {
  const t = tierFor(level)
  return {
    tier: t.tier,
    splat: BASE.splat * t.splat * (1 + 0.15 * u.big),
    reload: BASE.reload * t.reload * Math.pow(0.88, u.reload),
    speed: BASE.speed * t.speed * (1 + 0.09 * u.speed),
    shellSpeed: BASE.shellSpeed * (1 + 0.15 * u.velocity),
    range: BASE.range * (1 + 0.2 * u.velocity),
    shells: 1 + u.multi,
    bounces: u.ricochet,
    trail: BASE.trail * (1 + 0.3 * u.wide),
    twin: t.tier >= 4,
    mega: t.tier >= 2,
    roller: t.tier >= 3,
  }
}

/** XP needed to go from `level` to the next one. */
export const xpToNext = (level) => 60 + 28 * (level - 1)

export const XP = {
  perCell: 0.12, // each square metre of floor turned your colour
  splat: 12, // splashing another tank
  bucket: 20,
  star: 45,
}

export const PICKUPS = {
  star: { icon: '⭐', color: '#ffd60a', text: '+XP' },
  rapid: { icon: '💦', color: '#4cc9f0', text: 'SUPER SQUIRT!', seconds: 7 },
  roller: { icon: '🖌️', color: '#ff6ec7', text: 'BIG BRUSH!', seconds: 7 },
  mega: { icon: '🎈', color: '#c77dff', text: 'BALLOON READY!' },
}

export const COLORS = ['#ff3b3b', '#2f8cff', '#22c55e', '#ffb703', '#b14cff', '#ff6ec7', '#00d1c1', '#ff7a1a']

const ADJ = ['Happy', 'Bouncy', 'Sparkly', 'Zippy', 'Giggly', 'Sunny', 'Fuzzy', 'Silly', 'Jolly', 'Bubbly', 'Wiggly', 'Cosmic', 'Rainbow', 'Speedy', 'Snuggly', 'Twinkly', 'Dizzy', 'Puffy']
const NOUN = ['Panda', 'Bunny', 'Puppy', 'Kitten', 'Duckling', 'Penguin', 'Otter', 'Koala', 'Llama', 'Turtle', 'Hippo', 'Dino', 'Unicorn', 'Potato', 'Taco', 'Muffin', 'Pickle', 'Owl']
export const randomName = (rnd = Math.random) => `${ADJ[Math.floor(rnd() * ADJ.length)]} ${NOUN[Math.floor(rnd() * NOUN.length)]}`

// chase: how often a bot squirts at a nearby tank instead of painting the floor.
export const BOT_LEVELS = {
  easy: { aimError: 0.22, reaction: 0.8, fireChance: 0.4, chase: 0.15, speed: 0.7, upgradeSmart: 0.3 },
  normal: { aimError: 0.1, reaction: 0.5, fireChance: 0.7, chase: 0.3, speed: 0.85, upgradeSmart: 0.6 },
  hard: { aimError: 0.05, reaction: 0.3, fireChance: 0.9, chase: 0.4, speed: 1, upgradeSmart: 0.9 },
}

/** Deterministic random numbers, so every device builds the same arena from a seed. */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
