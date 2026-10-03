import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { merge } from 'topojson-client'
import type { FeatureCollection, MultiPolygon, Point } from 'geojson'
import type { Contest, Party } from '../types'
import { useStore } from './store'
import { computeStats, type PlanStats } from '../model/stats'
import { validate, type Issue } from '../model/validation'
import { defaultContests, withoutLeaders } from '../model/contests'
import { runElection, type ElectionResult } from '../model/swing'

export interface Derived {
  stats: PlanStats
  issues: Issue[]
  contests: Record<string, Contest>
  /** contests with leaders kept even when leaders are switched off (the base for edits) */
  editable: Record<string, Contest>
  /** contests before any user edits (used for leader-effect baselines) */
  defaults: Record<string, Contest>
  partyMap: Record<string, Party>
  projection: ElectionResult
  districts: FeatureCollection<MultiPolygon, { id: string; color: string }>
  labels: FeatureCollection<Point, { id: string; name: string }>
  membersOf: Record<string, number[]>
}

const Ctx = createContext<Derived | null>(null)

export function DerivedProvider({ children }: { children: ReactNode }) {
  const data = useStore((s) => s.data)!
  const ctx = useStore((s) => s.ctx)
  const plan = useStore((s) => s.plan)
  const year = useStore((s) => s.year)
  const parties = useStore((s) => s.parties)
  const rules = useStore((s) => s.rules)
  const overrides = useStore((s) => s.contestOverrides)
  const swings = useStore((s) => s.swings)
  const useLeaders = useStore((s) => s.useLeaders)

  const stats = useMemo(() => computeStats(plan, data.blocks, ctx, parties, year), [plan, data, ctx, parties, year])
  const issues = useMemo(() => validate(plan, stats, data.blocks, rules), [plan, stats, data, rules])
  const partyMap = useMemo(() => Object.fromEntries(parties.map((p) => [p.id, p])), [parties])
  const rawDefaults = useMemo(() => defaultContests(plan, stats, data.ge), [plan, stats, data])
  const editable = useMemo(() => {
    const out: Record<string, Contest> = {}
    for (const c of plan.constituencies) out[c.id] = overrides[c.id] ?? rawDefaults[c.id]
    return out
  }, [plan, overrides, rawDefaults])
  // "parties only": everything downstream sees no leaders, but the user's picks are kept for later
  const defaults = useMemo(() => (useLeaders ? rawDefaults : withoutLeaders(rawDefaults)), [rawDefaults, useLeaders])
  const contests = useMemo(() => (useLeaders ? editable : withoutLeaders(editable)), [editable, useLeaders])
  const projection = useMemo(() => runElection(plan.constituencies, stats.byId, contests, swings, partyMap), [plan, stats, contests, swings, partyMap])

  const membersOf = useMemo(() => {
    const m: Record<string, number[]> = {}
    plan.assign.forEach((cid, i) => { if (cid) (m[cid] ||= []).push(i) })
    return m
  }, [plan.assign])

  const { districts, labels } = useMemo(() => {
    const geoms = data.topo.objects.blocks.geometries
    const features = plan.constituencies
      .filter((c) => membersOf[c.id]?.length)
      .map((c) => ({
        type: 'Feature' as const,
        properties: { id: c.id, color: c.color },
        geometry: merge(data.topo, membersOf[c.id].map((i) => geoms[i]) as never) as MultiPolygon,
      }))
    const labelFeatures = plan.constituencies
      .filter((c) => stats.byId[c.id]?.electors)
      .map((c) => ({
        type: 'Feature' as const,
        properties: { id: c.id, name: c.name },
        geometry: { type: 'Point' as const, coordinates: stats.byId[c.id].centroid },
      }))
    return {
      districts: { type: 'FeatureCollection' as const, features },
      labels: { type: 'FeatureCollection' as const, features: labelFeatures },
    }
  }, [plan.constituencies, membersOf, data, stats])

  const value = useMemo(
    () => ({ stats, issues, contests, editable, defaults, partyMap, projection, districts, labels, membersOf }),
    [stats, issues, contests, editable, defaults, partyMap, projection, districts, labels, membersOf],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDerived() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDerived outside provider')
  return v
}
