import { create } from 'zustand'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { PlannerData } from '../data/loadPlanner'
import { DEFAULT_POLICY, type PopulationPolicy } from '../data/demographics'
import { PHASES, type PhaseId } from '../model/population'
import { emptyPlan, type NationalPlan } from '../model/simulate'
import { buildBlocked, hasLandBy, reclaimBlocked, reclaimedCount } from '../model/rules'
import { PRESETS } from '../model/presets'
import { ZONES, type Density, type ZoneId } from '../model/zones'

export type PlannerTab = 'population' | 'build' | 'indicators' | 'report'
export type PlannerTool = 'inspect' | 'paint' | 'fill' | 'lasso' | 'reclaim' | 'erase' | 'pan'
export type PlannerLens = 'zone' | 'density' | 'seniors' | 'access' | 'phase' | 'depth'

const STORAGE_KEY = 'sg-planner:v1'

interface PlannerState {
  data: PlannerData | null
  tab: PlannerTab
  tool: PlannerTool
  lens: PlannerLens
  /** the phase being planned (the map shows the end of it) */
  phase: PhaseId
  zone: ZoneId
  density: Density
  plan: NationalPlan
  policy: PopulationPolicy
  name: string
  past: NationalPlan[]
  future: NationalPlan[]
  selected: number | null
  /** why the last cells could not be changed */
  notice: { text: string; n: number; at: number } | null
  reportOpen: boolean

  init: (d: PlannerData) => void
  setTab: (t: PlannerTab) => void
  setTool: (t: PlannerTool) => void
  setLens: (l: PlannerLens) => void
  setPhase: (p: PhaseId) => void
  setZone: (z: ZoneId) => void
  setDensity: (d: Density) => void
  setPolicy: (p: Partial<PopulationPolicy>) => void
  setName: (n: string) => void
  setSelected: (i: number | null) => void
  setReportOpen: (v: boolean) => void
  clearNotice: () => void

  checkpoint: () => void
  /** paint the selected zone, or reclaim with the reclaim tool */
  apply: (cells: number[]) => void
  erase: (cells: number[]) => void
  applyPreset: (id: string) => void
  reset: () => void
  undo: () => void
  redo: () => void
}

/** action lists per phase: [cell, reclaim, zone index, density] */
type Packed = [number, number, number, number][][]
const ZONE_IDS = ZONES.map((z) => z.id)
const pack = (plan: NationalPlan): Packed => plan.map((p) => Object.entries(p).map(([c, a]) => [Number(c), a.r ? 1 : 0, a.z ? ZONE_IDS.indexOf(a.z) : -1, a.d ?? 1]))
const unpack = (packed: Packed): NationalPlan => {
  const plan = emptyPlan()
  packed.slice(0, PHASES.length).forEach((list, p) => {
    for (const [c, r, z, d] of list) plan[p][c] = { ...(r ? { r: 1 as const } : {}), ...(z >= 0 ? { z: ZONE_IDS[z], d: d as Density } : {}) }
  })
  return plan
}

export function savePlanner() {
  const s = usePlanner.getState()
  try { localStorage.setItem(STORAGE_KEY, compressToEncodedURIComponent(JSON.stringify({ v: 1, plan: pack(s.plan), policy: s.policy, name: s.name, phase: s.phase }))) } catch { /* ignore */ }
}
function loadSaved(n: number): Partial<Pick<PlannerState, 'plan' | 'policy' | 'name' | 'phase'>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const j = JSON.parse(decompressFromEncodedURIComponent(raw) ?? '')
    const plan = unpack(j.plan)
    if (plan.some((p) => Object.keys(p).some((c) => Number(c) >= n))) return {}
    return { plan, policy: { ...DEFAULT_POLICY, ...j.policy }, name: j.name ?? 'Singapore 2050', phase: j.phase ?? 0 }
  } catch { return {} }
}

const copy = (plan: NationalPlan): NationalPlan => plan.map((p) => ({ ...p }))

export const usePlanner = create<PlannerState>((set, get) => ({
  data: null,
  tab: 'population',
  tool: 'inspect',
  lens: 'zone',
  phase: 0,
  zone: 'hdb',
  density: 1,
  plan: emptyPlan(),
  policy: DEFAULT_POLICY,
  name: 'Singapore 2050',
  past: [],
  future: [],
  selected: null,
  notice: null,
  reportOpen: false,

  init: (data) => set({ data, ...loadSaved(data.n) }),
  setTab: (tab) => set({ tab }),
  setTool: (tool) => set({ tool }),
  setLens: (lens) => set({ lens }),
  setPhase: (phase) => set({ phase }),
  setZone: (zone) => set((s) => ({ zone, tool: s.tool === 'paint' || s.tool === 'fill' || s.tool === 'lasso' ? s.tool : 'paint' })),
  setDensity: (density) => set({ density }),
  setPolicy: (p) => set((s) => ({ policy: { ...s.policy, ...p } })),
  setName: (name) => set({ name }),
  setSelected: (selected) => set({ selected }),
  setReportOpen: (reportOpen) => set({ reportOpen }),
  clearNotice: () => set({ notice: null }),

  checkpoint: () => set((s) => ({ past: [...s.past.slice(-99), s.plan], future: [] })),
  apply: (cells) => {
    const { data, plan: old, phase, tool, zone, density } = get()
    if (!data || !cells.length) return
    const plan = copy(old)
    const cur = plan[phase]
    let reclaimed = reclaimedCount(plan, phase)
    let changed = false
    let reason: string | null = null
    let rejected = 0
    // cells far from the coast may become reachable once nearer cells are reclaimed: retry until stuck
    let todo = cells
    for (let pass = 0; pass < 40 && todo.length; pass++) {
      const retry: number[] = []
      for (const i of todo) {
        const a = cur[i] ?? {}
        if (tool === 'reclaim') {
          if (hasLandBy(data, plan, i, phase)) continue
          const why = reclaimBlocked(data, plan, i, phase, reclaimed)
          if (why) { retry.push(i); reason = why; continue }
          cur[i] = { ...a, r: 1 }
          reclaimed++
          changed = true
          continue
        }
        const why = buildBlocked(data, plan, i, phase, zone)
        if (why === 'reclaim') {
          // painting onto the sea reclaims it first
          const r = reclaimBlocked(data, plan, i, phase, reclaimed)
          if (r) { retry.push(i); reason = r; continue }
          cur[i] = { r: 1, z: zone, d: density }
          reclaimed++
          changed = true
        } else if (why) {
          rejected++
          reason = why
        } else if (a.z !== zone || a.d !== density) {
          if (!a.z && data.base[i] === zone && !a.r) continue
          cur[i] = { ...a, z: zone, d: density }
          changed = true
        }
      }
      if (retry.length === todo.length) { rejected += retry.length; break }
      todo = retry
    }
    if (changed) set({ plan })
    if (reason && rejected) set((s) => ({ notice: { text: reason!, n: rejected + (s.notice?.text === reason ? s.notice.n : 0), at: Date.now() } }))
  },
  erase: (cells) => {
    const { plan: old, phase } = get()
    let changed = false
    const plan = copy(old)
    for (const i of cells) {
      const a = plan[phase][i]
      if (!a) continue
      delete plan[phase][i]
      // without the reclamation, later projects on that land go too
      if (a.r) for (let p = phase + 1; p < plan.length; p++) delete plan[p][i]
      changed = true
    }
    if (changed) set({ plan })
  },
  applyPreset: (id) => {
    const { data } = get()
    const preset = PRESETS.find((p) => p.id === id)
    if (!data || !preset) return
    get().checkpoint()
    const plan = copy(get().plan)
    preset.apply(data, plan)
    set({ plan })
  },
  reset: () => { get().checkpoint(); set({ plan: emptyPlan(), policy: DEFAULT_POLICY, phase: 0 }) },
  undo: () => set((s) => {
    const prev = s.past.at(-1)
    return prev ? { plan: prev, past: s.past.slice(0, -1), future: [s.plan, ...s.future] } : {}
  }),
  redo: () => set((s) => {
    const next = s.future[0]
    return next ? { plan: next, future: s.future.slice(1), past: [...s.past, s.plan] } : {}
  }),
}))

if (import.meta.env.DEV) (window as unknown as { __planner: typeof usePlanner }).__planner = usePlanner
