/** Synthesised sound: nothing to load, nothing to license. Starts on the first touch. */

export type Sfx = 'swoosh' | 'bump' | 'win' | 'star' | 'tap' | 'hint' | 'hammer' | 'lose'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

export function unlockAudio(): void {
  if (ctx) { void ctx.resume(); return }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.45
  master.connect(ctx.destination)
}

export function setMuted(v: boolean): void { muted = v; if (master) master.gain.value = v ? 0 : 0.45 }

function tone(f: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0): void {
  if (!ctx || !master) return
  const t0 = ctx.currentTime + delay
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t0)
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t0 + dur)
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  o.connect(g).connect(master)
  o.start(t0); o.stop(t0 + dur + 0.02)
}

/** Each exit climbs a little in pitch, so a run of good taps sounds like a scale. */
let streak = 0
export function play(s: Sfx): void {
  if (!ctx || muted) return
  switch (s) {
    case 'swoosh': { const f = 440 * Math.pow(2, Math.min(12, streak++) / 12); tone(f, 0.18, 'triangle', 0.22, 1.8); tone(f * 1.5, 0.12, 'sine', 0.1, 1.5, 0.03); break }
    case 'bump': streak = 0; tone(140, 0.22, 'square', 0.2, 0.6); tone(90, 0.3, 'sine', 0.25, 0.7); break
    case 'win': streak = 0; [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, 1, i * 0.08)); break
    case 'star': tone(1175, 0.25, 'sine', 0.2, 1.02); tone(1568, 0.3, 'sine', 0.12, 1, 0.05); break
    case 'tap': tone(880, 0.05, 'sine', 0.12); break
    case 'hint': [784, 988].forEach((f, i) => tone(f, 0.16, 'sine', 0.16, 1, i * 0.06)); break
    case 'hammer': tone(180, 0.25, 'square', 0.22, 0.5); tone(1200, 0.08, 'triangle', 0.1); break
    case 'lose': streak = 0; [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, 0.9, i * 0.14)); break
  }
}
export const resetStreak = (): void => { streak = 0 }
