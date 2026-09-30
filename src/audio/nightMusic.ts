import { create } from 'zustand'

/**
 * Election-night music, synthesized with the Web Audio API (no audio files):
 * a looping newsroom bed (pulsing bass, pads, ticking clock, timpani) plus
 * short brass stings for breaking news and a closing flourish.
 */

const MUTED_KEY = 'sg-election-sim:muted'
const BPM = 104
const STEP = 60 / BPM / 4 // one 16th note
const LOOKAHEAD = 0.15

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)
// i – VI – III – VII in D minor: Dm, Bb, F, C (root, then pad voicing)
const CHORDS: { root: number; pad: number[] }[] = [
  { root: 38, pad: [62, 65, 69] },
  { root: 34, pad: [62, 65, 70] },
  { root: 41, pad: [60, 65, 69] },
  { root: 36, pad: [60, 64, 67] },
]
// a short bell motif, per 16th step of each bar (null = rest)
const MOTIF: (number | null)[] = [74, null, null, 77, null, null, 81, null, 79, null, 77, null, 76, null, null, null]

let ctx: AudioContext | null = null
let master: GainNode
let bed: GainNode
let noise: AudioBuffer
let timer: ReturnType<typeof setInterval> | null = null
let nextTime = 0
let step = 0

function audio() {
  if (ctx) return ctx
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = useMusic.getState().muted ? 0 : 0.5
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)
  bed = ctx.createGain()
  bed.gain.value = 0
  bed.connect(master)
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return ctx
}

function tone(out: AudioNode, t: number, freq: number, dur: number, { type = 'sine' as OscillatorType, vol = 0.2, attack = 0.005, cutoff = 0, glideTo = 0 } = {}) {
  const c = ctx!
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let node: AudioNode = o
  if (cutoff) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    node = o.connect(f)
  }
  node.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function tick(out: AudioNode, t: number, vol: number) {
  const c = ctx!
  const s = c.createBufferSource()
  s.buffer = noise
  const f = c.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 7000
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
  s.connect(f).connect(g).connect(out)
  s.start(t)
  s.stop(t + 0.05)
}

const timpani = (out: AudioNode, t: number, note: number, vol = 0.5) => tone(out, t, midi(note), 1.2, { vol, glideTo: midi(note) * 0.92 })

function brass(out: AudioNode, t: number, notes: number[], dur: number, vol = 0.09) {
  for (const n of notes) {
    tone(out, t, midi(n), dur, { type: 'sawtooth', vol, attack: 0.03, cutoff: 2200 })
    tone(out, t, midi(n) * 1.004, dur, { type: 'sawtooth', vol: vol * 0.6, attack: 0.03, cutoff: 1800 })
  }
}

/** Schedules one 16th step of the looping bed. */
function scheduleStep(t: number, s: number) {
  const bar = Math.floor(s / 16) % 4
  const i = s % 16
  const ch = CHORDS[bar]
  if (i % 2 === 0) tone(bed, t, midi(ch.root), STEP * 1.8, { type: 'sawtooth', vol: i % 4 === 0 ? 0.16 : 0.1, cutoff: 500 })
  if (i === 0) for (const n of ch.pad) tone(bed, t, midi(n), STEP * 16, { type: 'triangle', vol: 0.045, attack: 0.25 })
  tick(bed, t, i % 4 === 0 ? 0.08 : 0.03)
  const m = MOTIF[i]
  if (m !== null && s % 128 >= 64) tone(bed, t, midi(m + (bar === 3 ? -2 : 0)), 0.5, { vol: 0.05 })
  if (i === 0 && bar === 0) timpani(bed, t, 38, 0.4)
  if (i === 12 && bar === 3) { timpani(bed, t, 45, 0.25); timpani(bed, t + STEP * 2, 45, 0.3) }
}

export const nightMusic = {
  /** Call from a user gesture so the browser allows sound. */
  unlock() { void audio()?.resume() },
  play() {
    const c = audio()
    if (!c || timer) return
    void c.resume()
    bed.gain.cancelScheduledValues(c.currentTime)
    bed.gain.setTargetAtTime(1, c.currentTime, 0.3)
    nextTime = c.currentTime + 0.05
    timer = setInterval(() => {
      while (nextTime < c.currentTime + LOOKAHEAD) {
        if (!useMusic.getState().muted) scheduleStep(nextTime, step)
        nextTime += STEP
        step++
      }
    }, 25)
  },
  pause() {
    if (!ctx || !timer) return
    clearInterval(timer)
    timer = null
    bed.gain.cancelScheduledValues(ctx.currentTime)
    bed.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
  },
  /** Short hit for a news flash; `final` for the closing flourish. */
  sting(kind: 'breaking' | 'projection' | 'final') {
    const c = audio()
    if (!c || useMusic.getState().muted) return
    const t = c.currentTime + 0.02
    if (kind === 'breaking') {
      brass(master, t, [62, 65, 69], 0.25)
      brass(master, t + 0.28, [62, 65, 69, 74], 0.9)
      timpani(master, t, 38, 0.5)
    } else if (kind === 'projection') {
      brass(master, t, [60, 64, 67], 0.3)
      brass(master, t + 0.32, [62, 66, 69, 74], 1.2)
      timpani(master, t + 0.32, 38, 0.5)
    } else {
      ;[[62, 65, 69], [58, 62, 65], [60, 64, 67], [62, 66, 69, 74]].forEach((ch, k) => brass(master, t + k * 0.45, ch, k === 3 ? 2.2 : 0.4))
      timpani(master, t + 1.35, 38, 0.6)
      timpani(master, t + 1.35, 50, 0.3)
    }
  },
}

export const useMusic = create<{ muted: boolean; toggle: () => void }>((set, get) => ({
  muted: (() => { try { return localStorage.getItem(MUTED_KEY) === '1' } catch { return false } })(),
  toggle: () => {
    const muted = !get().muted
    try { localStorage.setItem(MUTED_KEY, muted ? '1' : '0') } catch { /* ignore */ }
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05)
    set({ muted })
  },
}))
