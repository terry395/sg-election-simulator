import { create } from 'zustand'

export type Snap = 'peek' | 'half' | 'full'
export const ORDER: Snap[] = ['peek', 'half', 'full']

interface SheetState {
  snap: Snap
  /** settled height in px (not updated mid-drag), for map padding and overlays */
  height: number
  setSnap: (s: Snap) => void
  setHeight: (h: number) => void
}

/** Phone bottom sheet position; other parts of the app lower or raise it. */
export const useSheet = create<SheetState>((set) => ({
  snap: 'half',
  height: 0,
  setSnap: (snap) => set({ snap }),
  setHeight: (height) => set({ height }),
}))

/** px/ms: a flick faster than this moves one snap point in its direction. */
const FLING = 0.5

/**
 * Snap point for a released drag: a fast flick moves to the next point in its direction,
 * otherwise the nearest point wins. `h` is the sheet height, `velocity` > 0 means growing.
 */
export function nearestSnap(h: number, velocity: number, snaps: Record<Snap, number>): Snap {
  if (Math.abs(velocity) > FLING) {
    const up = velocity > 0
    const candidates = ORDER.filter((s) => (up ? snaps[s] > h : snaps[s] < h))
    if (candidates.length) return up ? candidates[0] : candidates[candidates.length - 1]
  }
  return ORDER.reduce((best, s) => (Math.abs(snaps[s] - h) < Math.abs(snaps[best] - h) ? s : best), 'peek' as Snap)
}
