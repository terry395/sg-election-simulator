import { create } from 'zustand'
import type { Constituency, Contest, Party, Plan, Swings, Year } from '../types'
import type { AppData } from '../data/loadData'
import { CONSTITUENCY_PALETTE, DEFAULT_PARTIES } from '../data/parties'
import { buildBlockContext, ge2025Plan, type BlockContext } from '../model/stats'
import { DEFAULT_SWINGS } from '../model/swing'
import { DEFAULT_RULES, type Rules } from '../model/validation'
import type { SharedState } from '../share/serialize'

export type Tab = 'draw' | 'contests' | 'forecast' | 'night'
export type Tool = 'paint' | 'fill' | 'lasso' | 'erase' | 'pan' | 'inspect'
export type Lens = 'constituency' | 'deviation' | 'pap' | 'young' | 'senior' | 'malay' | 'indian' | 'landed' | 'condo' | 'density'

interface Snapshot { constituencies: Constituency[]; assign: (string | null)[] }

interface State {
  data: AppData | null
  ctx: BlockContext[]
  tab: Tab
  tool: Tool
  lens: Lens
  year: Year
  showGE2025: boolean
  rules: Rules
  plan: Plan
  past: Snapshot[]
  future: Snapshot[]
  activeId: string | null
  hoverBlock: number | null
  selectedBlock: number | null
  parties: Party[]
  /** only user-edited contests are stored; the rest follow defaults */
  contestOverrides: Record<string, Contest>
  swings: Swings

  init: (d: AppData, shared?: SharedState | null) => void
  setTab: (t: Tab) => void
  setTool: (t: Tool) => void
  setLens: (l: Lens) => void
  setYear: (y: Year) => void
  setShowGE2025: (v: boolean) => void
  setRules: (r: Partial<Rules>) => void
  setActive: (id: string | null) => void
  setHoverBlock: (id: number | null) => void
  setSelectedBlock: (id: number | null) => void

  checkpoint: () => void
  assignBlocks: (ids: number[], cid: string | null) => void
  undo: () => void
  redo: () => void
  loadPreset: (p: 'ge2025' | 'blank') => void
  addConstituency: (type: 'SMC' | 'GRC') => string
  updateConstituency: (id: string, patch: Partial<Constituency>) => void
  deleteConstituency: (id: string) => void

  setContest: (id: string, c: Contest) => void
  resetContests: () => void
  setAllContests: (c: Record<string, Contest>) => void
  updateParty: (id: string, patch: Partial<Party>) => void
  addParty: (p: Party) => void
  removeParty: (id: string) => void

  setSwings: (patch: Partial<Swings>) => void
  resetSwings: () => void
  importState: (s: SharedState) => void
}

const snap = (p: Plan): Snapshot => ({ constituencies: p.constituencies, assign: p.assign })
let counter = 0
const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`

export const useStore = create<State>((set, get) => ({
  data: null,
  ctx: [],
  tab: 'draw',
  tool: 'inspect',
  lens: 'constituency',
  year: 2025,
  showGE2025: false,
  rules: DEFAULT_RULES,
  plan: { constituencies: [], assign: [] },
  past: [],
  future: [],
  activeId: null,
  hoverBlock: null,
  selectedBlock: null,
  parties: DEFAULT_PARTIES,
  contestOverrides: {},
  swings: DEFAULT_SWINGS,

  init: (d, shared) => {
    const ctx = buildBlockContext(d.blocks, d.ge)
    const plan = ge2025Plan(d.blocks, d.ge, CONSTITUENCY_PALETTE)
    set({ data: d, ctx, plan, activeId: plan.constituencies[0]?.id ?? null })
    if (shared) { get().importState(shared); set({ past: [] }) }
  },
  setTab: (tab) => set({ tab }),
  setTool: (tool) => set({ tool }),
  setLens: (lens) => set({ lens }),
  setYear: (year) => set({ year }),
  setShowGE2025: (showGE2025) => set({ showGE2025 }),
  setRules: (r) => set({ rules: { ...get().rules, ...r } }),
  setActive: (activeId) => set({ activeId }),
  setHoverBlock: (hoverBlock) => set({ hoverBlock }),
  setSelectedBlock: (selectedBlock) => set({ selectedBlock }),

  checkpoint: () => set((s) => ({ past: [...s.past.slice(-99), snap(s.plan)], future: [] })),
  assignBlocks: (ids, cid) =>
    set((s) => {
      let changed = false
      const assign = s.plan.assign.slice()
      for (const i of ids) if (assign[i] !== cid) { assign[i] = cid; changed = true }
      return changed ? { plan: { ...s.plan, assign } } : {}
    }),
  undo: () =>
    set((s) => {
      const prev = s.past.at(-1)
      if (!prev) return {}
      return { plan: { ...prev }, past: s.past.slice(0, -1), future: [snap(s.plan), ...s.future] }
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0]
      if (!next) return {}
      return { plan: { ...next }, future: s.future.slice(1), past: [...s.past, snap(s.plan)] }
    }),
  loadPreset: (p) => {
    const { data } = get()
    if (!data) return
    get().checkpoint()
    const plan = p === 'ge2025' ? ge2025Plan(data.blocks, data.ge, CONSTITUENCY_PALETTE) : { constituencies: [], assign: data.blocks.map(() => null) }
    set({ plan, activeId: plan.constituencies[0]?.id ?? null, contestOverrides: {} })
  },
  addConstituency: (type) => {
    get().checkpoint()
    const { plan } = get()
    const used = new Set(plan.constituencies.map((c) => c.color))
    const color = CONSTITUENCY_PALETTE.find((c) => !used.has(c)) ?? CONSTITUENCY_PALETTE[plan.constituencies.length % CONSTITUENCY_PALETTE.length]
    const n = plan.constituencies.filter((c) => c.type === type).length + 1
    const c: Constituency = { id: newId(), name: `New ${type} ${n}`, type, seats: type === 'SMC' ? 1 : 4, color }
    set({ plan: { ...plan, constituencies: [...plan.constituencies, c] }, activeId: c.id, tool: 'paint' })
    return c.id
  },
  updateConstituency: (id, patch) =>
    set((s) => ({
      plan: {
        ...s.plan,
        constituencies: s.plan.constituencies.map((c) => {
          if (c.id !== id) return c
          const next = { ...c, ...patch }
          if (patch.type === 'SMC') next.seats = 1
          if (patch.type === 'GRC' && c.type === 'SMC') next.seats = 4
          return next
        }),
      },
    })),
  deleteConstituency: (id) => {
    get().checkpoint()
    set((s) => {
      const constituencies = s.plan.constituencies.filter((c) => c.id !== id)
      const { [id]: _, ...contestOverrides } = s.contestOverrides
      return {
        plan: { constituencies, assign: s.plan.assign.map((a) => (a === id ? null : a)) },
        activeId: s.activeId === id ? constituencies[0]?.id ?? null : s.activeId,
        contestOverrides,
      }
    })
  },

  setContest: (id, c) => set((s) => ({ contestOverrides: { ...s.contestOverrides, [id]: c } })),
  resetContests: () => set({ contestOverrides: {} }),
  setAllContests: (c) => set({ contestOverrides: c }),
  updateParty: (id, patch) => set((s) => ({ parties: s.parties.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  addParty: (p) => set((s) => ({ parties: [...s.parties, p] })),
  removeParty: (id) =>
    set((s) => ({
      parties: s.parties.filter((p) => p.id !== id),
      contestOverrides: Object.fromEntries(Object.entries(s.contestOverrides).map(([k, c]) => [k, { ...c, parties: c.parties.filter((p) => p !== id) }])),
    })),

  setSwings: (patch) => set((s) => ({ swings: { ...s.swings, ...patch } })),
  resetSwings: () => set({ swings: DEFAULT_SWINGS }),
  importState: (st) =>
    set((s) => ({
      plan: st.plan,
      contestOverrides: st.contests,
      swings: st.swings,
      year: st.year,
      parties: [
        ...DEFAULT_PARTIES.map((d) => st.customParties.find((p) => p.id === d.id) ?? d),
        ...st.customParties.filter((p) => !DEFAULT_PARTIES.some((d) => d.id === p.id)),
      ],
      activeId: st.plan.constituencies[0]?.id ?? null,
      past: [...s.past, snap(s.plan)],
      future: [],
    })),
}))
