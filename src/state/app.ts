import { create } from 'zustand'

/** the two simulators, switched from the sidebar */
export type SimApp = 'election' | 'planner'
const APP_KEY = 'sg-sim:app'

interface AppState {
  app: SimApp
  setApp: (a: SimApp) => void
}

export const useApp = create<AppState>((set) => ({
  app: (() => { try { return localStorage.getItem(APP_KEY) === 'planner' ? 'planner' : 'election' } catch { return 'election' } })(),
  setApp: (app) => {
    try { localStorage.setItem(APP_KEY, app) } catch { /* ignore */ }
    set({ app })
  },
}))
