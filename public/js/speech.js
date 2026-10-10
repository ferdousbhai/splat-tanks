// Copied from bitgames examples/_studio/originals/speech.js, the voice every original game shares.
// One calm voice per game: spoken words wait their turn instead of cutting each other off.
// say() queues by default; sayNow() (or { interrupt: true }) clears what is waiting first.
// onend runs when the words finish (or a fallback timer, for browsers that never fire end),
// but not for words cut short by hush().
/** "red, yellow and blue": one list style for everything the games say. */
export const listWords = new Intl.ListFormat('en-GB', { type: 'conjunction' })

export function createVoice({ muted = false, rate = 0.85, pitch = 1.05 } = {}) {
  const canSpeak = 'speechSynthesis' in window
  let pending = 0
  let gen = 0

  function hush() {
    gen++
    pending = 0
    if (canSpeak) speechSynthesis.cancel()
  }

  function say(text, { interrupt = false, onend } = {}) {
    if (interrupt) hush()
    if (!text || muted || !canSpeak) {
      onend?.()
      return
    }
    const myGen = gen
    const words = new SpeechSynthesisUtterance(text)
    words.lang = 'en-US'
    words.rate = rate
    words.pitch = pitch
    pending++
    let ended = false
    // Some browsers never fire onend (no voices installed): never wait longer than the words need.
    const fallback = setTimeout(finish, (2 + pending * 1.5 + text.length * 0.09) * 1000)
    function finish() {
      if (ended) return
      ended = true
      clearTimeout(fallback)
      // Words cut short by hush() belong to a scene that was left: their onend no longer applies
      if (myGen !== gen) return
      pending = Math.max(0, pending - 1)
      onend?.()
    }
    words.onend = words.onerror = finish
    speechSynthesis.speak(words)
  }

  addEventListener('pagehide', hush)
  document.addEventListener('visibilitychange', () => { if (document.hidden) hush() })

  return {
    say,
    /** Tap feedback: says this now, dropping anything still waiting. */
    sayNow: (text, options) => say(text, { ...options, interrupt: true }),
    hush,
    /** The game's sound switch: muting also stops words already playing. */
    setMuted(on) {
      muted = on
      if (on) hush()
    },
    get speaking() { return pending > 0 },
  }
}
