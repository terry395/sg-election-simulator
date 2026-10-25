import { createContext, useContext, useDeferredValue, useMemo, type ReactNode } from 'react'
import { usePlanner } from './planner'
import { project, type YearPop } from '../model/population'
import { simulate, type SimResult, type Snapshot } from '../model/simulate'
import { planIssues, type PlanIssue } from '../model/rules'

export interface PlannerDerived {
  projection: YearPop[]
  sim: SimResult
  issues: PlanIssue[]
  /** the end of the phase being planned */
  snap: Snapshot
  /** today (2026) */
  today: Snapshot
}

const Ctx = createContext<PlannerDerived | null>(null)

export function PlannerDerivedProvider({ children }: { children: ReactNode }) {
  const data = usePlanner((s) => s.data)!
  // painting stays smooth: the simulation catches up a moment later
  const plan = useDeferredValue(usePlanner((s) => s.plan))
  const policy = usePlanner((s) => s.policy)
  const phase = usePlanner((s) => s.phase)
  const projection = useMemo(() => project(data.file.meta.age2026, data.file.meta.female2026, policy), [data, policy])
  const sim = useMemo(() => simulate(data, plan, projection, policy), [data, plan, projection, policy])
  const issues = useMemo(() => planIssues(sim), [sim])
  const value = useMemo(() => ({ projection, sim, issues, snap: sim.snaps[phase + 1], today: sim.snaps[0] }), [projection, sim, issues, phase])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePlannerDerived() {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePlannerDerived outside provider')
  return v
}
