import { create } from 'zustand'
import type { NightEvent } from '../model/timeline'
import type { ElectionResult } from '../model/swing'
import type { Constituency } from '../types'

export type Reveal = 'sample' | 'result'

interface NightState {
  plan: Constituency[] | null
  result: ElectionResult | null
  events: NightEvent[]
  t: number
  /** index of the next event to fire */
  cursor: number
  playing: boolean
  speed: number
  seed: number
  revealed: Record<string, Reveal>
  start: (plan: Constituency[], result: ElectionResult, events: NightEvent[], seed: number) => void
  setPlaying: (v: boolean) => void
  setSpeed: (v: number) => void
  advance: (dt: number) => void
  skipToEnd: () => void
  stepNext: () => void
  reset: () => void
}

function applyUntil(s: NightState, t: number) {
  const revealed = { ...s.revealed }
  let cursor = s.cursor
  while (cursor < s.events.length && s.events[cursor].t <= t) {
    const e = s.events[cursor]
    if (e.kind === 'sample') revealed[e.cid] = revealed[e.cid] === 'result' ? 'result' : 'sample'
    if (e.kind === 'result' || e.kind === 'walkover') revealed[e.cid] = 'result'
    cursor++
  }
  const done = cursor >= s.events.length
  return { revealed, cursor, t, playing: done ? false : s.playing }
}

export const useNight = create<NightState>((set, get) => ({
  plan: null,
  result: null,
  events: [],
  t: -5,
  cursor: 0,
  playing: false,
  speed: 6,
  seed: 1,
  revealed: {},
  start: (plan, result, events, seed) => set({ plan, result, events, seed, t: -5, cursor: 0, revealed: {}, playing: true }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  advance: (dt) => {
    const s = get()
    if (!s.result) return
    const next = s.t + dt
    // fast-forward through quiet periods so the night never drags
    const upcoming = s.events[s.cursor]
    const t = upcoming && upcoming.t - next > 20 ? upcoming.t - 20 : next
    set(applyUntil(s, t))
  },
  skipToEnd: () => {
    const s = get()
    if (!s.result) return
    set({ ...applyUntil(s, Infinity), t: s.events.at(-1)?.t ?? 0, playing: false })
  },
  stepNext: () => {
    const s = get()
    const e = s.events[s.cursor]
    if (e) set(applyUntil(s, e.t))
  },
  reset: () => set({ result: null, plan: null, events: [], t: -5, cursor: 0, revealed: {}, playing: false }),
}))

if (import.meta.env.DEV) (window as unknown as { __night: typeof useNight }).__night = useNight
