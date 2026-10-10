// Keyboard + mouse, and twin-stick touch controls. Movement is screen-relative (up = -z), or relative to
// where you look in the driver's seat view.

export const input = {
  moveX: 0,
  moveZ: 0,
  mouse: { x: 0, y: 0, active: false }, // NDC
  mouseUsed: false, // the mouse has been moved or pressed over the game this round (cleared at each start)
  look: { dx: 0, dy: 0 }, // mouse movement while the pointer is locked (driver's seat view), read and cleared by the game
  firing: false,
  aimStick: { x: 0, y: 0, active: false },
  boost: false, // edge-triggered, cleared by the game
  mega: false,
  pick: 0, // 1..3 when an upgrade key was pressed
  touch: false,
}

const keys = new Set()
const handlers = {}
export const onKey = (key, fn) => (handlers[key] = fn)

/**
 * Driving alone paints: on touch, or on keys until the mouse is used in a round (a young child, or someone
 * playing with the keyboard only). Driving then squirts paint ahead; in the driver's seat left and right turn
 * the view. Once the mouse is used it keeps the aim for the round, even resting.
 */
export const handsFree = () => input.touch || !input.mouseUsed
/** The mouse is aiming (and its crosshair shows) in the sky view. */
export const mouseAims = () => input.mouse.active && !handsFree()

function updateMoveFromKeys() {
  let x = 0
  let z = 0
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1
  const l = Math.hypot(x, z) || 1
  input.moveX = x / l
  input.moveZ = z / l
}

addEventListener('keydown', (e) => {
  if (e.repeat) return
  keys.add(e.code)
  if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.boost = true
  if (e.code === 'KeyE' || e.code === 'KeyQ') input.mega = true
  const digit = /^Digit([1-3])$/.exec(e.code)
  if (digit) input.pick = Number(digit[1])
  handlers[e.code]?.()
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
  updateMoveFromKeys()
})
addEventListener('keyup', (e) => {
  keys.delete(e.code)
  updateMoveFromKeys()
})
addEventListener('blur', () => {
  keys.clear()
  input.firing = false
  updateMoveFromKeys()
})

/**
 * Mouse aiming and squirting. On touch-capable laptops and iPads with a mouse, the touch sticks' zones lie over
 * the lower screen, so the mouse is heard there too, not only on the canvas.
 */
export const mouseSurfaces = (canvas) => [canvas, ...document.querySelectorAll('.stick')]

export function bindMouse(canvas) {
  const surfaces = mouseSurfaces(canvas)
  const on = (type, fn) => surfaces.forEach((el) => el.addEventListener(type, fn))
  on('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    input.touch = false // an iPad trackpad or mouse takes over aiming
    input.mouseUsed = true
    if (document.pointerLockElement === canvas) {
      input.look.dx += e.movementX
      input.look.dy += e.movementY
      return
    }
    input.mouse.x = (e.clientX / innerWidth) * 2 - 1
    input.mouse.y = -(e.clientY / innerHeight) * 2 + 1
    input.mouse.active = true
  })
  on('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return
    input.mouse.active = true
    input.mouseUsed = true
    if (e.button === 0) input.firing = true
    if (e.button === 2) input.mega = true
  })
  // The left button's state, not the button named by the event: with both buttons down, letting go of the left
  // one arrives as a move, and the last release names the right one.
  const leftUp = (e) => {
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) input.firing = false
  }
  addEventListener('pointerup', leftUp)
  addEventListener('pointermove', leftUp)
  on('contextmenu', (e) => e.preventDefault())
}

/** A virtual joystick in `zone`; the knob follows the finger from wherever it lands. */
function stick(zone, onChange) {
  const base = zone.querySelector('.stick-base')
  const knob = zone.querySelector('.stick-knob')
  let id = null
  let cx = 0
  let cy = 0
  const R = 56
  const place = (x, y) => {
    base.style.left = `${x}px`
    base.style.top = `${y}px`
  }
  // At rest the base sits in the middle of its zone (style.css), even while the HUD is hidden.
  const rest = () => {
    base.style.left = base.style.top = ''
    knob.style.transform = 'translate(-50%, -50%)'
    zone.classList.remove('held')
  }
  zone.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault()
      if (id !== null) return
      const t = e.changedTouches[0]
      id = t.identifier
      const r = zone.getBoundingClientRect()
      cx = t.clientX
      cy = t.clientY
      place(cx - r.left, cy - r.top)
      zone.classList.add('held')
      onChange(0, 0, true)
    },
    { passive: false },
  )
  zone.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault()
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue
        let dx = t.clientX - cx
        let dy = t.clientY - cy
        const l = Math.hypot(dx, dy)
        if (l > R) {
          dx = (dx / l) * R
          dy = (dy / l) * R
        }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
        onChange(dx / R, dy / R, true)
      }
    },
    { passive: false },
  )
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue
      id = null
      rest()
      onChange(0, 0, false)
    }
  }
  zone.addEventListener('touchend', end)
  zone.addEventListener('touchcancel', end)
}

export function bindTouch() {
  stick(document.getElementById('move-stick'), (x, y) => {
    input.touch = true
    const l = Math.hypot(x, y)
    const k = l < 0.15 ? 0 : Math.min(1, l) / l
    input.moveX = x * k
    input.moveZ = y * k
  })
  stick(document.getElementById('aim-stick'), (x, y, held) => {
    input.touch = true
    input.mouse.active = false
    const l = Math.hypot(x, y)
    if (l > 0.2) {
      input.aimStick.x = x / l
      input.aimStick.y = y / l
    }
    input.aimStick.active = held && l > 0.2
    input.firing = held && l > 0.45
  })
  const tap = (el, fn) =>
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault()
        input.touch = true
        fn()
      },
      { passive: false },
    )
  tap(document.getElementById('btn-boost'), () => (input.boost = true))
  tap(document.getElementById('btn-mega'), () => (input.mega = true))
}
