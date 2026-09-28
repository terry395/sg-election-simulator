import type { Block, Plan } from '../types'
import { isContiguous, type PlanStats } from './stats'

export interface Rules {
  /** max allowed deviation of electors-per-MP from the national average (EBRC norm: 30%) */
  maxDeviation: number
  /** Constitution (Art. 39A): at least 8 SMCs */
  minSMC: number
  minGRCSeats: number
  maxGRCSeats: number
  /** seats you are aiming for (informational) */
  targetSeats: number
}

export const DEFAULT_RULES: Rules = { maxDeviation: 0.3, minSMC: 8, minGRCSeats: 3, maxGRCSeats: 6, targetSeats: 97 }

export interface Issue {
  level: 'error' | 'warning' | 'info'
  message: string
  constituency?: string
  blocks?: number[]
}

export function validate(plan: Plan, stats: PlanStats, blocks: Block[], rules: Rules): Issue[] {
  const issues: Issue[] = []
  if (stats.unassignedBlocks.length) {
    const e = stats.unassignedBlocks.reduce((s, i) => s + blocks[i].e25, 0)
    issues.push({ level: 'error', message: `${stats.unassignedBlocks.length} populated areas (${e.toLocaleString()} electors) are not in any constituency`, blocks: stats.unassignedBlocks })
  }
  const smcs = plan.constituencies.filter((c) => c.type === 'SMC').length
  if (smcs < rules.minSMC) issues.push({ level: 'error', message: `Only ${smcs} SMCs — the Constitution requires at least ${rules.minSMC}` })

  const members: Record<string, number[]> = {}
  plan.assign.forEach((cid, i) => { if (cid) (members[cid] ||= []).push(i) })

  for (const c of plan.constituencies) {
    const s = stats.byId[c.id]
    if (!s || s.electors === 0) {
      issues.push({ level: 'warning', message: `${c.name} has no electors yet`, constituency: c.id })
      continue
    }
    if (c.type === 'GRC' && (c.seats < rules.minGRCSeats || c.seats > rules.maxGRCSeats))
      issues.push({ level: 'error', message: `${c.name} GRC must have ${rules.minGRCSeats}–${rules.maxGRCSeats} MPs`, constituency: c.id })
    const dev = s.deviation
    if (Math.abs(dev) > rules.maxDeviation)
      issues.push({ level: 'error', message: `${c.name}: ${fmtDev(dev)} electors per MP vs national average (limit ±${Math.round(rules.maxDeviation * 100)}%)`, constituency: c.id })
    else if (Math.abs(dev) > rules.maxDeviation * 0.8)
      issues.push({ level: 'warning', message: `${c.name}: ${fmtDev(dev)} electors per MP — close to the ±${Math.round(rules.maxDeviation * 100)}% limit`, constituency: c.id })
    if (!isContiguous(members[c.id] || [], blocks))
      issues.push({ level: 'warning', message: `${c.name} is not contiguous`, constituency: c.id })
  }
  if (stats.seats !== rules.targetSeats)
    issues.push({ level: 'info', message: `${stats.seats} seats in total (target ${rules.targetSeats})` })
  const grcs = plan.constituencies.filter((c) => c.type === 'GRC')
  if (grcs.length) {
    const avg = grcs.reduce((s, c) => s + c.seats, 0) / grcs.length
    issues.push({ level: 'info', message: `${grcs.length} GRCs (avg ${avg.toFixed(2)} MPs) · ${smcs} SMCs · quota ${Math.round(stats.quota).toLocaleString()} electors/MP` })
  }
  return issues
}

export const fmtDev = (d: number) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`
