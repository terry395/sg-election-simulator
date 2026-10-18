import { useEffect, useMemo, useState } from 'react'
import { History, Loader2 } from 'lucide-react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { useHistory } from '../data/loadHistory'
import { HISTORIC_PARTIES, PAP, partyFor } from '../data/parties'
import {
  compareBoundaries, compareResults, notionalPast, seatLineage,
  type BoundaryComparison, type HistYearData, type MapCount, type PastFate, type SeatSwing,
} from '../model/history'
import { PartyBadge, Section, Stat, fmt, pct } from '../components/ui'
import { YearBars, YearLine, YearSlider } from '../components/HistoryCharts'
import { SERIES } from '../lib/color'
import { Hemicycle } from '../components/Hemicycle'
import type { Party } from '../types'

const ESTIMATE_NOTE = 'Past results on new boundaries are estimates: each area takes the result of the constituency it was in that year, weighted by today\'s electors.'

/** Loads the past-election data on first use and returns the selected year. */
function useYearData(enabled: boolean): { yd: HistYearData | null; years: HistYearData[] | null; loading: boolean; error: string | null } {
  const { data, loading, error, load } = useHistory()
  const year = useStore((s) => s.compare.year)
  useEffect(() => { if (enabled) load() }, [enabled, load])
  return { yd: data?.years.find((y) => y.year === year) ?? null, years: data?.years ?? null, loading, error }
}

function SwipeToggle({ label }: { label: string }) {
  const on = useStore((s) => s.compare.on)
  const setCompare = useStore((s) => s.setCompare)
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-300">
      <input type="checkbox" checked={on} onChange={(e) => setCompare({ on: e.target.checked })} /> {label}
    </label>
  )
}

function Opener({ title, hint, onOpen }: { title: string; hint: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 rounded-md border border-sky-500/50 bg-sky-500/10 px-3 py-2 text-left hover:bg-sky-500/20">
      <History size={17} className="shrink-0 text-sky-300" aria-hidden />
      <span><span className="block text-sm font-semibold">{title}</span><span className="block text-[11px] text-slate-300">{hint}</span></span>
    </button>
  )
}

const Loading = ({ error }: { error: string | null }) => error
  ? <p className="text-xs text-red-300">Could not load past elections: {error}</p>
  : <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" aria-hidden /> Loading past elections…</p>

const sizesText = (m: MapCount) => Object.entries(m.sizes).sort((a, b) => Number(b[0]) - Number(a[0])).map(([n, k]) => `${k}×${n}`).join(', ') || '—'

// ====================================================================== Draw step

/** Draw step: how the user's map compares with a past election's boundaries. */
export function CompareBoundaries() {
  const [open, setOpen] = useState(false)
  const compare = useStore((s) => s.compare)
  const opened = open || compare.on
  const setCompare = useStore((s) => s.setCompare)
  const plan = useStore((s) => s.plan)
  const year = useStore((s) => s.year)
  const blocks = useStore((s) => s.data)!.blocks
  const { stats } = useDerived()
  const { yd, years, loading, error } = useYearData(opened)
  const cmp = useMemo(() => (yd ? compareBoundaries(plan, stats, blocks, yd, year) : null), [yd, plan, stats, blocks, year])

  if (!opened) return (
    <Section title="Past boundaries">
      <Opener title="Compare with past boundaries" hint="GE2006 to GE2025, side by side with a swipe slider on the map"
        onOpen={() => { setOpen(true); setCompare({ on: true }) }} />
    </Section>
  )
  return (
    <Section title="Compare with past boundaries" right={<SwipeToggle label="Swipe on map" />}>
      <YearSlider year={compare.year} onChange={(y) => setCompare({ year: y })} yours="Your map" />
      {!cmp || !yd || !years ? <Loading error={error && !loading ? error : null} /> : (
        <>
          <p className="mt-1 text-[11px] text-slate-400">Drag the white divider on the map: <b className="text-slate-200">GE{yd.year}</b> on the left, <b className="text-rose-200">your map</b> on the right. Polling day {yd.date}.</p>
          <CountTable cmp={cmp} yd={yd} registerLabel={year === 2030 ? '2030 projection' : '2025 register'} />
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <Stat label="Similarity" value={pct(cmp.similarity, 0)} sub={`voters kept together`} />
            <Stat label="Your seats" value={<span className="text-sm">{cmp.unchanged} · {cmp.redrawn} · {cmp.created}</span>} sub="same · redrawn · new" />
            <Stat label={`GE${yd.year} seats`} value={<span className="text-sm">{cmp.fates.kept + cmp.fates.redrawn} · {cmp.fates.merged + cmp.fates.split}</span>} sub="survive · broken up" />
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">Similarity: the share of voters who stay with most of their GE{yd.year} constituency. "Same" seats keep at least 98% of their voters both ways, "redrawn" at least 60%.</p>
          <PastFates past={cmp.past} year={yd.year} />
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">MPs elected in SMCs and GRCs</div>
            <YearBars colors={[SERIES.smc, SERIES.grc]} names={['SMC seats', 'GRC seats']} selected={String(yd.year)}
              bars={[
                ...years.map((y) => {
                  const smc = y.constituencies.filter((c) => c.type === 'SMC').length
                  return { label: String(y.year), values: [smc, y.seats - smc], tip: `GE${y.year}: ${y.seats} MPs (${smc} SMC, ${y.seats - smc} in GRCs)` }
                }),
                { label: 'Yours', mine: true, values: [cmp.yours.smc, cmp.yours.seats - cmp.yours.smc], tip: `Your map: ${cmp.yours.seats} MPs (${cmp.yours.smc} SMC, ${cmp.yours.seats - cmp.yours.smc} in GRCs)` },
              ]} />
          </div>
        </>
      )}
    </Section>
  )
}

function CountTable({ cmp, yd, registerLabel }: { cmp: BoundaryComparison; yd: HistYearData; registerLabel: string }) {
  const rows: [string, string, string][] = [
    ['Constituencies', String(cmp.then.constituencies), String(cmp.yours.constituencies)],
    ['SMCs', String(cmp.then.smc), String(cmp.yours.smc)],
    ['GRCs (count×MPs)', sizesText(cmp.then), sizesText(cmp.yours)],
    ['MPs', String(cmp.then.seats), String(cmp.yours.seats)],
    ['Electors', fmt(cmp.then.electors), fmt(cmp.yours.electors)],
    ['Electors per MP', fmt(cmp.then.perMp), fmt(cmp.yours.perMp)],
    ['Most per MP', cmp.then.largest ? `${fmt(cmp.then.largest.perMp)}` : '—', cmp.yours.largest ? `${fmt(cmp.yours.largest.perMp)}` : '—'],
    ['Fewest per MP', cmp.then.smallest ? `${fmt(cmp.then.smallest.perMp)}` : '—', cmp.yours.smallest ? `${fmt(cmp.yours.smallest.perMp)}` : '—'],
  ]
  return (
    <table className="mt-2 w-full text-xs">
      <thead className="text-[10px] uppercase text-slate-500">
        <tr><th className="text-left font-medium" /><th className="text-right font-medium">GE{yd.year}</th><th className="text-right font-medium text-rose-300">Yours</th></tr>
      </thead>
      <tbody>
        {rows.map(([k, a, b]) => (
          <tr key={k} className="border-t border-slate-800/70">
            <td className="py-0.5 text-slate-400">{k}</td>
            <td className="tabular py-0.5 text-right text-slate-200">{a}</td>
            <td className={`tabular py-0.5 text-right ${a === b ? 'text-slate-400' : 'font-semibold text-slate-100'}`}>{b}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={3} className="pt-1 text-[10px] text-slate-500">GE{yd.year}: that year's official register. Yours: {registerLabel}. Most/fewest: {cmp.then.largest?.name} and {cmp.then.smallest?.name} then; {cmp.yours.largest?.name} and {cmp.yours.smallest?.name} on your map.</td></tr></tfoot>
    </table>
  )
}

const FATE: Record<PastFate['fate'], { label: string; cls: string }> = {
  kept: { label: 'kept', cls: 'bg-emerald-500/20 text-emerald-200' },
  redrawn: { label: 'redrawn', cls: 'bg-sky-500/20 text-sky-200' },
  merged: { label: 'merged', cls: 'bg-amber-500/20 text-amber-200' },
  split: { label: 'split up', cls: 'bg-rose-500/20 text-rose-200' },
}

function PastFates({ past, year }: { past: PastFate[]; year: number }) {
  const [all, setAll] = useState(false)
  const { partyMap } = useDerived()
  const order = { split: 0, merged: 1, redrawn: 2, kept: 3 }
  const list = [...past].sort((a, b) => order[a.fate] - order[b.fate] || a.name.localeCompare(b.name))
  const shown = all ? list : list.slice(0, 6)
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">What happened to the GE{year} constituencies</div>
      <ul className="space-y-1">
        {shown.map((p) => (
          <li key={p.idx} className="text-xs">
            <div className="flex items-center gap-1.5">
              <PartyBadge party={partyFor(p.winner, partyMap)} small noInfo />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className={`rounded px-1 text-[10px] font-semibold ${FATE[p.fate].cls}`}>{FATE[p.fate].label}</span>
            </div>
            <div className="truncate pl-1 text-[11px] text-slate-500">→ {p.into.slice(0, 3).map((x) => `${x.name} ${pct(x.share, 0)}`).join(', ') || 'not assigned on your map'}</div>
          </li>
        ))}
      </ul>
      {list.length > 6 && <button className="mt-1 text-[11px] text-sky-400" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${list.length}`}</button>}
    </div>
  )
}

/** Active constituency card: the same area at the selected past election. */
export function PastForSeat({ cid }: { cid: string }) {
  const data = useHistory((s) => s.data)
  const year = useStore((s) => s.compare.year)
  const plan = useStore((s) => s.plan)
  const reg = useStore((s) => s.year)
  const blocks = useStore((s) => s.data)!.blocks
  const { stats, partyMap } = useDerived()
  const [history, setHistory] = useState(false)
  const yd = data?.years.find((y) => y.year === year)
  const cmp = useMemo(() => (yd ? compareBoundaries(plan, stats, blocks, yd, reg) : null), [yd, plan, stats, blocks, reg])
  const notional = useMemo(() => (yd ? notionalPast(plan, blocks, yd, reg) : null), [yd, plan, blocks, reg])
  const lineage = useMemo(() => (history && data ? seatLineage(plan, blocks, data.years, reg)[cid] : null), [history, data, plan, blocks, reg, cid])
  if (!yd || !cmp || !notional) return null
  const seat = cmp.seats.find((s) => s.id === cid)
  const n = notional[cid]
  if (!seat || !n) return null
  const shares = n.shares ? Object.entries(n.shares).sort((a, b) => b[1] - a[1]) : []
  return (
    <div className="mt-3 rounded-md border border-sky-900/60 bg-sky-950/20 p-2 text-[11px]">
      <div className="text-slate-300"><b>In GE{yd.year}</b> this area was: {seat.sources.slice(0, 3).map((s) => `${s.name} ${pct(s.share, 0)}`).join(', ')}</div>
      {n.shares ? (
        <div className="mt-0.5 text-slate-400">GE{yd.year} vote here (estimate): {shares.slice(0, 3).map(([p, v]) => (
          <span key={p} className="mr-1.5 whitespace-nowrap"><span className="mr-0.5 inline-block h-2 w-2 rounded-[2px] align-middle" style={{ background: partyFor(p, partyMap).color }} />{p} {pct(v)}</span>
        ))}{n.covered < 0.98 && <span className="text-slate-500">({pct(1 - n.covered, 0)} was a walkover)</span>}</div>
      ) : <div className="mt-0.5 text-slate-400">No vote here in GE{yd.year}: {n.winner} won it unopposed.</div>}
      <button className="mt-1 text-sky-400 hover:underline" onClick={() => setHistory(!history)}>{history ? 'Hide' : 'Show'} seat history 2006–2025</button>
      {lineage && (
        <ol className="mt-1 space-y-0.5">
          {lineage.map((l) => <li key={l.year} className="text-slate-300"><span className="tabular mr-1.5 text-slate-500">{l.year}</span>{l.name} <span className="text-slate-500">({pct(l.share, 0)} of voters)</span></li>)}
        </ol>
      )}
    </div>
  )
}

// ====================================================================== Election night

/** Election night: the user's result against a past general election. */
export function CompareResults() {
  const [open, setOpen] = useState(false)
  const compare = useStore((s) => s.compare)
  const opened = open || compare.on
  const setCompare = useStore((s) => s.setCompare)
  const result = useNight((s) => s.result)!
  const nightPlan = useNight((s) => s.plan)!
  const plan = useStore((s) => s.plan)
  const reg = useStore((s) => s.year)
  const blocks = useStore((s) => s.data)!.blocks
  const { stats, partyMap } = useDerived()
  const { yd, years, loading, error } = useYearData(opened)
  const parties = useMemo<Record<string, Party>>(() => ({ ...HISTORIC_PARTIES, ...partyMap }), [partyMap])
  const notional = useMemo(() => (yd ? notionalPast(plan, blocks, yd, reg) : null), [yd, plan, blocks, reg])
  const cmp = useMemo(() => {
    if (!yd || !notional) return null
    const electors = Object.fromEntries(Object.entries(stats.byId).map(([id, s]) => [id, s.electors]))
    return compareResults(result, nightPlan, electors, yd, notional)
  }, [yd, notional, result, nightPlan, stats])

  if (!opened) return (
    <Section title="Past elections">
      <Opener title="Compare with past elections" hint="Your night against GE2006 to GE2025, with a swipe slider on the map"
        onOpen={() => { setOpen(true); setCompare({ on: true }) }} />
    </Section>
  )
  const now = { label: 'GE2030', mine: true }
  return (
    <Section title="Compare with past elections" right={<SwipeToggle label="Swipe on map" />}>
      <YearSlider year={compare.year} onChange={(y) => setCompare({ year: y })} yours="Your GE2030" />
      {!cmp || !yd || !years ? <Loading error={error && !loading ? error : null} /> : (
        <>
          <p className="mt-1 text-[11px] text-slate-400">On the map: <b className="text-slate-200">GE{yd.year} winners</b> on the left of the divider, <b className="text-rose-200">your results</b> on the right.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { title: `GE${yd.year}`, sub: yd.date, seats: Object.fromEntries(Object.entries(yd.parties).map(([p, v]) => [p, v.seats])), total: yd.seats },
              { title: 'Your GE2030', sub: 'simulated', seats: result.seatsByParty, total: cmp.seatsNow },
            ].map((h) => (
              <div key={h.title} className="rounded-md bg-slate-900 p-1.5 text-center">
                <div className="text-xs font-semibold">{h.title}</div>
                <div className="text-[10px] text-slate-500">{h.sub}</div>
                <Hemicycle seats={h.seats} total={h.total} parties={parties} width={170} />
                <div className="text-[10px] text-slate-400">{h.total} seats</div>
              </div>
            ))}
          </div>
          <PartyTable cmp={cmp} parties={parties} year={yd.year} />
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Stat label="Opposition seats" value={<>{cmp.oppThen} → {cmp.oppNow}</>} sub={delta(cmp.oppNow - cmp.oppThen, 'seat')} />
            <Stat label="Turnout" value={<>{pct(cmp.turnoutThen)} → {pct(cmp.turnoutNow)}</>} sub="of electors, contested seats" />
            <Stat label="Walkovers" value={<>{cmp.walkoversThen} → {cmp.walkoversNow}</>} sub="seats with no contest" />
            <Stat label="Closest seat" value={<span className="text-sm">{cmp.closestThen ? pct(cmp.closestThen.margin) : '—'} → {cmp.closestNow ? pct(cmp.closestNow.margin) : '—'}</span>}
              sub={<span className="block truncate">{cmp.closestThen?.name} → {cmp.closestNow?.name}</span>} />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">PAP national vote share</div>
            <YearLine color={SERIES.grc} fmt={(v) => pct(v, 0)} domain={[0.5, 0.8]}
              points={[
                ...years.map((y) => ({ label: String(y.year), value: y.parties.PAP.share, tip: `GE${y.year}: PAP ${pct(y.parties.PAP.share)}` })),
                { ...now, value: (result.votesByParty[PAP] ?? 0) / (result.totalValid || 1), tip: `Your GE2030: PAP ${pct((result.votesByParty[PAP] ?? 0) / (result.totalValid || 1))}` },
              ]} />
          </div>
          <div className="mt-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Opposition MPs elected</div>
            <YearBars colors={[SERIES.smc]} selected={String(yd.year)}
              bars={[
                ...years.map((y) => {
                  const opp = Object.entries(y.parties).filter(([p]) => p !== PAP).reduce((s, [, v]) => s + v.seats, 0)
                  return { label: String(y.year), values: [opp], tip: `GE${y.year}: ${opp} opposition MPs of ${y.seats}` }
                }),
                { ...now, values: [cmp.oppNow], tip: `Your GE2030: ${cmp.oppNow} opposition MPs of ${cmp.seatsNow}` },
              ]} />
          </div>
          <SeatSwings swings={cmp.seatSwings} year={yd.year} parties={parties} />
          <p className="mt-2 text-[10px] leading-snug text-slate-500">{ESTIMATE_NOTE} Party vote shares are of all valid votes in contested seats. GE{yd.year} source: Elections Department.</p>
        </>
      )}
    </Section>
  )
}

const delta = (d: number, unit: string) => (d === 0 ? 'no change' : `${d > 0 ? '+' : ''}${d} ${unit}${Math.abs(d) === 1 ? '' : 's'}`)
const ppDelta = (d: number) => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}`

function PartyTable({ cmp, parties, year }: { cmp: ReturnType<typeof compareResults>; parties: Record<string, Party>; year: number }) {
  const rows = cmp.parties.filter((p) => p.seatsThen || p.seatsNow || (p.shareThen ?? 0) >= 0.005 || (p.shareNow ?? 0) >= 0.005)
  return (
    <table className="mt-3 w-full text-xs">
      <thead className="text-[10px] uppercase text-slate-500">
        <tr><th className="text-left font-medium">Party</th><th className="text-right font-medium">Seats {year} → yours</th><th className="text-right font-medium">Vote {year} → yours</th></tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const d = p.shareThen !== null && p.shareNow !== null ? p.shareNow - p.shareThen : null
          const sd = p.seatsNow - p.seatsThen
          return (
            <tr key={p.party} className="border-t border-slate-800/70">
              <td className="py-1"><PartyBadge party={partyFor(p.party, parties)} small noInfo={!!HISTORIC_PARTIES[p.party]} /></td>
              <td className="tabular text-right">{p.seatsThen} → <b>{p.seatsNow}</b> <span className={sd > 0 ? 'text-emerald-400' : sd < 0 ? 'text-red-400' : 'text-slate-500'}>({sd > 0 ? '+' : ''}{sd})</span></td>
              <td className="tabular text-right">
                {p.shareThen === null ? <span className="text-slate-500">—</span> : pct(p.shareThen)} → <b>{p.shareNow === null ? '—' : pct(p.shareNow)}</b>
                {d !== null && <span className={`ml-1 ${d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{ppDelta(d)}</span>}
                {p.shareThen === null && p.shareNow !== null && <span className="ml-1 text-slate-500">new</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot><tr><td colSpan={3} className="pt-1 text-[10px] text-slate-500">Vote changes are in percentage points. "—": did not stand.</td></tr></tfoot>
    </table>
  )
}

function SeatSwings({ swings, year, parties }: { swings: SeatSwing[]; year: number; parties: Record<string, Party> }) {
  const [sort, setSort] = useState<'opp' | 'pap' | 'name'>('opp')
  const [all, setAll] = useState(false)
  const flips = swings.filter((s) => s.thenWinner && s.thenWinner !== s.nowWinner)
  const list = [...swings].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'opp' ? (a.swing ?? 9) - (b.swing ?? 9)
        : (b.swing ?? -9) - (a.swing ?? -9))
  const shown = all ? list : list.slice(0, 8)
  const pv = (v: number | null) => (v === null ? 'w/o' : pct(v, 1))
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Your seats vs GE{year} on the same boundaries</div>
      <p className="text-[11px] text-slate-400">{flips.length ? `${flips.length} seat${flips.length > 1 ? 's' : ''} change${flips.length > 1 ? '' : 's'} hands compared with GE${year}: ${flips.slice(0, 4).map((s) => `${s.name} (${s.thenWinner} → ${s.nowWinner})`).join(', ')}${flips.length > 4 ? '…' : ''}` : `No seat changes hands compared with GE${year}.`}</p>
      <div className="mb-1 mt-1.5 flex gap-2 text-[11px] text-slate-500">
        Sort: {([['opp', 'swing to opposition'], ['pap', 'swing to PAP'], ['name', 'name']] as const).map(([k, l]) => (
          <button key={k} className={sort === k ? 'text-slate-200' : 'hover:text-slate-300'} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>
      <table className="w-full table-fixed text-xs">
        <colgroup><col /><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[14%]" /></colgroup>
        <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left font-medium">Seat</th><th className="text-right font-medium">PAP {year}</th><th className="text-right font-medium">Yours</th><th className="text-right font-medium">Swing</th></tr></thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.id} className="border-t border-slate-800/70">
              <td className="truncate py-0.5" title={`${s.name} ${s.type}`}>
                {s.thenWinner && s.thenWinner !== s.nowWinner && <span className="mr-1 rounded bg-amber-400 px-0.5 text-[9px] font-bold text-slate-900">FLIP</span>}
                {s.name}
              </td>
              <td className="tabular text-right text-slate-400">{s.thenWinner && s.thenWinner !== PAP && <PartyBadge party={partyFor(s.thenWinner, parties)} small noInfo />} {pv(s.papThen)}</td>
              <td className="tabular text-right">{s.nowWinner !== PAP && <PartyBadge party={partyFor(s.nowWinner, parties)} small noInfo />} {pv(s.papNow)}</td>
              <td className={`tabular text-right font-semibold ${s.swing === null ? 'text-slate-500' : s.swing >= 0 ? 'text-blue-300' : 'text-sky-300'}`}>{s.swing === null ? '—' : ppDelta(s.swing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length > 8 && <button className="mt-1 text-[11px] text-sky-400" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${list.length}`}</button>}
      <p className="mt-1 text-[10px] text-slate-500">Swing: change in the PAP's share in points (+ towards the PAP). "w/o": a walkover, so no votes to compare.</p>
    </div>
  )
}

