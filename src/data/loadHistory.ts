import { create } from 'zustand'
import type { HistoryData, HistYearData } from '../model/history'

interface HistoryState {
  data: HistoryData | null
  loading: boolean
  error: string | null
  /** fetches the past-election data once, the first time a comparison is opened */
  load: () => void
}

export const useHistory = create<HistoryState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  load: () => {
    if (get().data || get().loading) return
    set({ loading: true, error: null })
    const base = import.meta.env.BASE_URL + 'data/'
    Promise.all([
      fetch(base + 'history.json').then((r) => r.json()) as Promise<{ years: HistYearData[] }>,
      fetch(base + 'history.topo.json').then((r) => r.json()),
    ])
      .then(([h, topo]) => set({ data: { years: h.years, topo }, loading: false }))
      .catch((e) => set({ error: String(e), loading: false }))
  },
}))
