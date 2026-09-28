import { useMemo } from 'react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { DIVERGING, SEQ, marginShade, mix, ramp } from '../lib/color'
import { electorsOf } from '../model/stats'
import { PAP } from '../data/parties'

export const UNASSIGNED = '#e2e8f0'
const PENDING = '#cbd5e1'

export interface LensInfo { label: string; lo: string; hi: string; stops: string[] }
export const LENS_INFO: Record<string, LensInfo> = {
  deviation: { label: 'Electors per MP vs quota', lo: '−30%', hi: '+30%', stops: DIVERGING },
  pap: { label: 'Notional GE2025 PAP vote', lo: '40%', hi: '85%', stops: ['#22c5e8', '#f1f5f9', '#1e3a9e'] },
  young: { label: 'Voters aged 21–34', lo: '15%', hi: '40%', stops: SEQ },
  senior: { label: 'Voters aged 65+', lo: '5%', hi: '35%', stops: SEQ },
  malay: { label: 'Malay residents', lo: '0%', hi: '30%', stops: SEQ },
  indian: { label: 'Indian residents', lo: '0%', hi: '20%', stops: SEQ },
  landed: { label: 'Landed homes', lo: '0%', hi: '60%', stops: SEQ },
  condo: { label: 'Condos & apartments', lo: '0%', hi: '80%', stops: SEQ },
  density: { label: 'Electors per km²', lo: '0', hi: '40k', stops: SEQ },
}

export function useBlockColors(): string[] {
  const data = useStore((s) => s.data)!
  const tab = useStore((s) => s.tab)
  const lens = useStore((s) => s.lens)
  const year = useStore((s) => s.year)
  const plan = useStore((s) => s.plan)
  const { stats, contests, partyMap, projection } = useDerived()
  const revealed = useNight((s) => s.revealed)
  const nightResult = useNight((s) => s.result)
  const nightPlan = useNight((s) => s.plan)
  const events = useNight((s) => s.events)

  return useMemo(() => {
    const colorOf = Object.fromEntries(plan.constituencies.map((c) => [c.id, c.color]))
    const pc = (p: string) => partyMap[p]?.color ?? '#94a3b8'
    const blocks = data.blocks
    const empty = (i: number) => blocks[i].e25 + blocks[i].e30 === 0

    if (tab === 'night' && nightResult && nightPlan) {
      const seatBy = Object.fromEntries(nightResult.seats.map((s) => [s.id, s]))
      const sampleBy: Record<string, Record<string, number>> = {}
      for (const e of events) if (e.kind === 'sample') sampleBy[e.cid] = e.shares
      return blocks.map((b, i) => {
        const cid = plan.assign[i]
        if (!cid) return UNASSIGNED
        const r = revealed[cid]
        let c = PENDING
        if (r === 'result') c = marginShade(pc(seatBy[cid].winner), seatBy[cid].margin)
        else if (r === 'sample') {
          const lead = Object.entries(sampleBy[cid] ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? PAP
          c = mix('#f8fafc', pc(lead), 0.35)
        }
        return empty(b.id) ? mix(c, '#ffffff', 0.45) : c
      })
    }

    if (tab === 'forecast') {
      const seatBy = Object.fromEntries(projection.seats.map((s) => [s.id, s]))
      return blocks.map((b, i) => {
        const cid = plan.assign[i]
        const s = cid ? seatBy[cid] : undefined
        if (!s) return UNASSIGNED
        const c = marginShade(pc(s.winner), s.walkover ? 0.3 : s.margin)
        return empty(b.id) ? mix(c, '#ffffff', 0.45) : c
      })
    }

    if (tab === 'contests') {
      return blocks.map((b, i) => {
        const cid = plan.assign[i]
        if (!cid) return UNASSIGNED
        const opp = contests[cid]?.parties.filter((p) => p !== PAP) ?? []
        let c = opp.length === 0 ? '#94a3b8' : pc(opp[0])
        if (opp.length > 1) c = mix(c, '#000000', 0.25)
        return empty(b.id) ? mix(c, '#ffffff', 0.5) : c
      })
    }

    // draw tab
    return blocks.map((b, i) => {
      const cid = plan.assign[i]
      if (lens === 'constituency') {
        if (!cid) return UNASSIGNED
        return empty(b.id) ? mix(colorOf[cid], '#ffffff', 0.55) : colorOf[cid]
      }
      if (empty(b.id)) return '#f1f5f9'
      switch (lens) {
        case 'deviation': {
          const d = cid ? stats.byId[cid]?.deviation ?? 0 : 0
          return cid ? ramp(DIVERGING, 0.5 + d / 0.6) : UNASSIGNED
        }
        case 'pap': return ramp(LENS_INFO.pap.stops, (b.pap - 0.4) / 0.45)
        case 'young': return ramp(SEQ, ((b.age?.[0] ?? 0) - 0.15) / 0.25)
        case 'senior': return ramp(SEQ, ((b.age?.[3] ?? 0) - 0.05) / 0.3)
        case 'malay': return ramp(SEQ, (b.eth?.[1] ?? 0) / 0.3)
        case 'indian': return ramp(SEQ, (b.eth?.[2] ?? 0) / 0.2)
        case 'landed': return ramp(SEQ, (b.house?.[4] ?? 0) / 0.6)
        case 'condo': return ramp(SEQ, (b.house?.[3] ?? 0) / 0.8)
        case 'density': return ramp(SEQ, electorsOf(b, year) / (b.area / 1e6) / 40000)
      }
      return UNASSIGNED
    })
  }, [data, tab, lens, year, plan, stats, contests, partyMap, projection, revealed, nightResult, nightPlan, events])
}
