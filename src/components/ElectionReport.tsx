import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FileText, Info, ScrollText, X } from 'lucide-react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { buildReport, CLOSE_MARGIN, type BoundaryStatus, type OldSeatFate, type Report, type SeatReport } from '../model/report'
import { coalitionName } from '../model/coalition'
import { PAP } from '../data/parties'
import { DISCLAIMER_SHORT } from '../data/disclaimer'
import { Hemicycle } from './Hemicycle'
import { SeatBar } from './SeatBar'
import { PartyBadge, Stat, pct, fmt } from './ui'
import type { Party } from '../types'

/** Plain-English definitions, shown as tooltips and listed at the end of the report. */
const GLOSSARY: Record<string, string> = {
  SMC: 'Single Member Constituency: an area that elects one MP.',
  GRC: 'Group Representation Constituency: an area that elects a team of 3 to 6 MPs together. Voters pick a team, and the winning team takes every seat. Each team must include at least one minority-race candidate.',
  constituency: 'An area of Singapore whose voters elect their own MP or team of MPs. Also called a seat or a division.',
  boundaries: 'The lines on the map that decide which voters belong to which constituency.',
  notional: 'An estimate of how a constituency would have voted in 2025 if it had existed then, worked out from the 2025 votes of the areas inside it.',
  swing: 'How much support moved from one side to another, in percentage points. A 3-point swing means about 3 in every 100 voters changed sides.',
  points: 'Percentage points: the plain difference between two percentages. Going from 60% to 55% is a fall of 5 points.',
  quota: 'The average number of voters per MP across the country. Constituencies are expected to stay within 30% of it so that every vote counts about equally.',
  walkover: 'A seat where only one party stood, so it wins without a vote.',
  'straight fight': 'A contest between just two parties.',
  'multi-cornered': 'A contest with three or more parties, which can split the votes of those opposed to the leading party.',
  majority: 'More than half of all elected seats. The party (or group of parties) with a majority forms the government.',
  'two-thirds': 'Two-thirds of the elected seats: enough to change the Constitution without anyone else\'s support.',
  'hung parliament': 'A result where no single party has a majority, so parties may need to work together (a coalition) to govern.',
  coalition: 'Two or more parties agreeing to form a government together.',
  NCMP: 'Non-Constituency MP: up to 12 opposition MPs are guaranteed in Parliament. If fewer are elected, seats are offered to the best-performing opposition candidates who lost but won at least 15% of the vote.',
  'sample count': 'An early estimate released on election night from a random sample of ballots. It is usually accurate to within about 4 points.',
  turnout: 'The share of registered voters who actually voted.',
  margin: 'The gap between the winner and the runner-up, in points.',
  'changed hands': 'Won by a different party from the one that (notionally) held those voters in 2025.',
  forecast: 'What your settings predict with no random surprises: the result shown in the Swings & forecast tab.',
}

/** A term with a dotted underline that explains itself on hover or tap. */
function T({ k, children }: { k: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  return <abbr title={GLOSSARY[k]} className="cursor-help underline decoration-slate-500 decoration-dotted underline-offset-2">{children ?? k}</abbr>
}

const SECTIONS = [
  { id: 'glance', label: 'At a glance' },
  { id: 'key', label: 'Key points' },
  { id: 'boundaries', label: 'Boundaries' },
  { id: 'contests', label: 'Contests' },
  { id: 'swings', label: 'Swings' },
  { id: 'results', label: 'Results' },
  { id: 'seats', label: 'All seats' },
  { id: 'terms', label: 'Terms' },
]

const STATUS: Record<BoundaryStatus, { label: string; cls: string; hint: string }> = {
  unchanged: { label: 'Unchanged', cls: 'bg-slate-700 text-slate-200', hint: 'Same voters as in 2025' },
  redrawn: { label: 'Redrawn', cls: 'bg-amber-500/80 text-slate-950', hint: 'Mostly the same voters as a 2025 constituency, with some changes' },
  new: { label: 'New', cls: 'bg-violet-500/80 text-white', hint: 'Made up of voters from several 2025 constituencies' },
}

const FATE: Record<OldSeatFate['fate'], string> = {
  kept: 'Kept as it was',
  redrawn: 'Redrawn',
  merged: 'Mostly merged into',
  split: 'Split between',
}

const signed = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const points = (v: number) => `${Math.abs(v).toFixed(1)} point${Math.abs(v).toFixed(1) === '1.0' ? '' : 's'}`

export function ElectionReport() {
  const open = useNight((s) => s.reportOpen)
  const result = useNight((s) => s.result)
  if (!open || !result) return null
  return <ReportView />
}

function ReportView() {
  const night = useNight()
  const { stats, issues, contests, defaults, partyMap, projection } = useDerived()
  const swings = useStore((s) => s.swings)
  const parties = useStore((s) => s.parties)
  const year = useStore((s) => s.year)
  const data = useStore((s) => s.data)!
  const setActive = useStore((s) => s.setActive)
  const close = () => night.setReportOpen(false)
  const body = useRef<HTMLDivElement>(null)

  const report = useMemo(() => buildReport({
    plan: night.plan!, result: night.result!, projection, events: night.events, mode: night.mode, coalition: night.coalition,
    stats, issues, contests, defaults, swings, parties, ge: data.ge, blocks: data.blocks, year,
  }), [night.plan, night.result, projection, night.events, night.mode, night.coalition, stats, issues, contests, defaults, swings, parties, data, year])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') useNight.getState().setReportOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const goTo = (id: string) => body.current?.querySelector(`#report-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const showSeat = (id: string) => { setActive(id); close() }
  const ctx: Ctx = { r: report, partyMap, showSeat }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 md:p-4" onClick={close}>
      <div role="dialog" aria-label="Election night report" onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-4xl flex-col overflow-hidden border-slate-700 bg-slate-950 text-sm md:rounded-xl md:border">
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-600"><FileText size={18} className="text-white" aria-hidden /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight">Election night report</h2>
            <p className="text-[11px] text-slate-400">Your simulated GE2030 · {night.mode === 'surprise' ? 'realistic night with random surprises' : 'exactly your forecast'} · {report.summary.total} seats · run {night.seed}</p>
          </div>
          <button onClick={close} className="text-slate-400 hover:text-white" aria-label="Close report"><X size={20} /></button>
        </div>
        <nav className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 px-3 py-1.5" aria-label="Report sections">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => goTo(s.id)} className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white">{s.label}</button>
          ))}
        </nav>
        <div ref={body} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <p className="mx-4 mt-3 flex items-start gap-1.5 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1.5 text-[11px] text-amber-100">
            <Info size={13} className="mt-px shrink-0" aria-hidden />
            <span>This report explains how your own choices (the map you drew, who stood where and how you set voters' moods) led to this simulated result. It describes what happened without judging whether it is good or bad. Underlined terms explain themselves when you hover over or tap them. {DISCLAIMER_SHORT}</span>
          </p>
          <Glance {...ctx} />
          <KeyPoints {...ctx} />
          <Boundaries {...ctx} />
          <Contests {...ctx} />
          <Swings {...ctx} />
          <Results {...ctx} />
          <AllSeats {...ctx} />
          <Terms />
        </div>
      </div>
    </div>
  )
}

interface Ctx { r: Report; partyMap: Record<string, Party>; showSeat: (id: string) => void }

function Part({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={`report-${id}`} className="scroll-mt-2 border-b border-slate-800 px-4 py-4">
      <h3 className="text-base font-bold text-slate-100">{title}</h3>
      {lead && <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{lead}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

function Sub({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      {children}
    </div>
  )
}

function Badge({ p, partyMap }: { p: string; partyMap: Record<string, Party> }) {
  const party = partyMap[p]
  return party ? <PartyBadge party={party} small /> : <span className="rounded border border-slate-600 px-1 text-[10px] font-bold">{p}</span>
}

function SeatName({ s, showSeat }: { s: SeatReport; showSeat: (id: string) => void }) {
  return (
    <button onClick={() => showSeat(s.c.id)} className="text-left font-medium text-slate-100 underline-offset-2 hover:text-rose-300 hover:underline" title="Show on the map">
      {s.c.name} <span className="text-slate-500">{s.c.type}{s.c.type === 'GRC' ? ` (${s.c.seats})` : ''}</span>
    </button>
  )
}

function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[480px] text-xs">
        <thead className="text-[10px] uppercase text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className={`pb-1 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="tabular">{children}</tbody>
      </table>
    </div>
  )
}

const Td = ({ children, left, className = '' }: { children: ReactNode; left?: boolean; className?: string }) =>
  <td className={`border-t border-slate-800/70 py-1 ${left ? 'text-left' : 'text-right'} ${className}`}>{children}</td>

const Change = ({ v, d = 1 }: { v: number | null; d?: number }) =>
  v === null ? <span className="text-slate-500">new</span> : <span className={v >= 0 ? 'text-emerald-400' : 'text-red-400'}>{signed(v, d)}</span>

function Seats({ list, showSeat, render }: { list: SeatReport[]; showSeat: (id: string) => void; render: (s: SeatReport) => ReactNode }) {
  if (!list.length) return <p className="text-xs text-slate-500">None.</p>
  return (
    <ul className="space-y-1 text-xs">
      {list.map((s) => <li key={s.c.id} className="flex flex-wrap items-baseline gap-x-2"><SeatName s={s} showSeat={showSeat} /><span className="text-slate-400">{render(s)}</span></li>)}
    </ul>
  )
}

function More({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-300">{summary}</summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

// --- sections ------------------------------------------------------------------

function Glance({ r, partyMap }: Ctx) {
  const s = r.summary
  const verdict = s.coalition
    ? `A ${s.governmentName} coalition forms the government`
    : !s.hung ? `${partyMap[s.governmentName]?.name ?? s.governmentName} (${s.governmentName}) forms the government`
    : 'Hung parliament: no party has a majority'
  const seats = r.results.parties.reduce<Record<string, number>>((m, p) => (p.seats ? { ...m, [p.party]: p.seats } : m), {})
  const ncmp = r.results.ncmp
  return (
    <Part id="glance" title="At a glance" lead={<>The headline result of your election night, compared with the real 2025 general election.</>}>
      <div className="rounded-md bg-gradient-to-r from-slate-800 to-slate-900 p-3">
        <div className="text-lg font-bold">{verdict}</div>
        <div className="text-xs text-slate-300">
          {s.hung && !s.coalition
            ? <>The largest party, {s.governmentName}, has {s.govSeats} of {s.total} seats; {s.majority} are needed for a <T k="majority" />. See the coalition builder in the Result panel.</>
            : <>{s.govSeats} of {s.total} seats ({s.majority} needed for a <T k="majority" />){s.supermajority ? <>, which is more than <T k="two-thirds" /></> : <>, short of <T k="two-thirds">two-thirds</T> ({s.twoThirds})</>}.</>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Government seats" value={`${s.govSeats} / ${s.total}`} sub={`${s.majority} needed`} />
        <Stat label="Government vote" value={pct(s.govShare)} sub={s.govPrevShare !== null ? <>{signed((s.govShare - s.govPrevShare) * 100)} points on 2025</> : 'did not stand in 2025'} />
        <Stat label="Seats changing hands" value={s.gains} sub={`${s.gainMps} MPs`} />
        <Stat label="Turnout" value={pct(s.turnout)} sub={`2025: ${pct(s.turnout2025)}`} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <Hemicycle seats={seats} total={s.total} parties={partyMap} ncmp={ncmp} width={340} government={s.coalition ? s.government : undefined} />
        <div className="w-full"><SeatBar seats={seats} total={s.total} parties={partyMap} /></div>
        <p className="text-[11px] text-slate-500">Each dot is one elected MP; rings are <T k="NCMP">Non-Constituency MPs</T>. {s.contested} constituencies were contested and {s.walkovers} {s.walkovers === 1 ? 'was a' : 'were'} <T k="walkover">walkover{s.walkovers === 1 ? '' : 's'}</T>.</p>
      </div>
    </Part>
  )
}

function KeyPoints({ r }: Ctx) {
  return (
    <Part id="key" title="Key points" lead="The main things to know about this result, worked out from the figures in the rest of the report.">
      <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-slate-200">
        {r.takeaways.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </Part>
  )
}

function Boundaries({ r, partyMap, showSeat }: Ctx) {
  const b = r.boundaries
  const parties = [...new Set([...Object.keys(b.actualSeats2025), ...Object.keys(b.notionalSeats)])]
    .sort((x, y) => (b.notionalSeats[y] ?? 0) - (b.notionalSeats[x] ?? 0))
  const rows: [string, keyof typeof b.count][] = [['Constituencies', 'constituencies'], ['Single-seat (SMCs)', 'smc'], ['Team seats (GRCs)', 'grc'], ['MPs elected', 'seats'], ['Voters', 'electors']]
  const changedOld = b.oldSeats.filter((o) => o.fate !== 'kept')
  return (
    <Part id="boundaries" title="1 · The boundaries you drew" lead={<>
      <T k="boundaries">Electoral boundaries</T> decide which voters are grouped together to elect each MP. Moving them can change who wins, even if nobody changes their vote. This section compares your map with the one used in 2025.
    </>}>
      {!b.changed && <p className="rounded-md bg-slate-900 p-2 text-xs text-slate-300">You used the GE2025 map without changes, so every constituency has the same voters as in 2025.</p>}
      <button type="button" onClick={() => useStore.getState().setEbrcOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:underline">
        <ScrollText size={14} aria-hidden /> Read the mock EBRC report for this map
      </button>
      <Table head={['', 'GE2025 map', 'Your map', 'Change']}>
        {rows.map(([label, k]) => (
          <tr key={k}><Td left>{label}</Td><Td>{fmt(b.count2025[k])}</Td><Td className="font-semibold">{fmt(b.count[k])}</Td><Td><Change v={b.count[k] - b.count2025[k]} d={0} /></Td></tr>
        ))}
      </Table>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Unchanged" value={b.unchanged} sub="same voters as 2025" />
        <Stat label="Redrawn" value={b.redrawn} sub="mostly the same voters" />
        <Stat label="New" value={b.created} sub="drawn afresh" />
        <Stat label="Voters moved" value={pct(b.votersMoved / (b.count.electors || 1))} sub={`${fmt(b.votersMoved)} voters`} />
      </div>
      <p className="text-[11px] text-slate-500">"Voters moved" counts people who now vote in a different or newly created constituency. A constituency counts as unchanged if at least 98% of its voters are the same as in 2025, and redrawn if at least 60% are.</p>

      <Sub title={<>Who would have won on 2025 votes</>}>
        <p className="mb-2 text-xs leading-relaxed text-slate-300">
          This applies the real 2025 votes to your new map. Each constituency goes to the party that won most of its voters in 2025 (its <T k="notional">notional</T> result). Any difference from the real 2025 seat count comes from the boundaries alone, not from people changing their minds.
        </p>
        <Table head={['Party', 'Real 2025 map', 'Your map, 2025 votes', 'Difference']}>
          {parties.map((p) => (
            <tr key={p}><Td left><Badge p={p} partyMap={partyMap} /></Td><Td>{b.actualSeats2025[p] ?? 0}</Td><Td className="font-semibold">{b.notionalSeats[p] ?? 0}</Td><Td><Change v={b.boundaryEffect[p] ?? 0} d={0} /></Td></tr>
          ))}
        </Table>
        {b.notionalFlips.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-xs text-slate-300">These constituencies would have gone to a different party on paper than the 2025 constituency most of their voters came from:</p>
            <Seats list={b.notionalFlips} showSeat={showSeat} render={(s) => <>mostly from {s.sources[0]?.name} (won by {s.sourceWinner} in 2025), notionally {s.holder} with PAP on {pct(s.pap0 ?? 0)}</>} />
          </div>
        )}
      </Sub>

      <Sub title="Are constituencies a fair size?">
        <p className="text-xs leading-relaxed text-slate-300">
          The national <T k="quota" /> on your map is <b>{fmt(b.quota)}</b> voters per MP.
          {b.largest && b.smallest && b.largest !== b.smallest && <> The largest constituency per MP is <b>{b.largest.c.name}</b> ({fmt(b.largest.perMp)} per MP, {signed(b.largest.deviation * 100)}%), and the smallest is <b>{b.smallest.c.name}</b> ({fmt(b.smallest.perMp)} per MP, {signed(b.smallest.deviation * 100)}%).</>}
          {' '}{b.beyond.p10} constituencies are more than 10% away from the quota, {b.beyond.p20} more than 20% and {b.beyond.p30} more than 30% (the usual limit). In a bigger constituency each vote carries a little less weight.
        </p>
        {b.issues.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[11px]">
            {b.issues.map((i) => <li key={i.message} className={i.level === 'error' ? 'text-red-300' : 'text-amber-300'}>{i.level === 'error' ? 'Rule broken: ' : 'Check: '}{i.message}</li>)}
          </ul>
        )}
      </Sub>

      <More summary={`Your ${r.seats.length} constituencies and where their voters came from`}>
        <ul className="space-y-1.5 text-xs">
          {r.seats.map((s) => (
            <li key={s.c.id}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1 text-[9px] font-bold uppercase ${STATUS[s.status].cls}`} title={STATUS[s.status].hint}>{STATUS[s.status].label}</span>
                <SeatName s={s} showSeat={showSeat} />
                {s.typeChanged && <span className="text-[10px] text-amber-300">was a{s.c.type === 'GRC' ? 'n SMC' : ' GRC'}</span>}
                {s.renamed && s.basedOn && <span className="text-[10px] text-slate-400">renamed from {r.boundaries.oldSeats.find((o) => o.id === s.basedOn)?.name}</span>}
              </div>
              <div className="text-[11px] text-slate-400">
                {fmt(s.electors)} voters · {s.sources.slice(0, 4).map((x) => `${pct(x.share, 0)} from ${x.name}`).join(', ')}{s.sources.length > 4 ? `, and ${s.sources.length - 4} more` : ''}
              </div>
            </li>
          ))}
        </ul>
      </More>
      {changedOld.length > 0 && (
        <More summary={`What happened to the ${changedOld.length} changed 2025 constituencies`}>
          <ul className="space-y-1 text-xs">
            {changedOld.map((o) => (
              <li key={o.id}>
                <b>{o.name}</b> <span className="text-slate-500">{o.type} · won by {o.winner} in 2025</span>
                <div className="text-[11px] text-slate-400">{FATE[o.fate]}{o.fate === 'redrawn' ? ` as ${o.into[0]?.name}: ` : ' '}{o.into.slice(0, 4).map((x) => `${x.name} (${pct(x.share, 0)})`).join(', ')}</div>
              </li>
            ))}
          </ul>
        </More>
      )}
    </Part>
  )
}

function Contests({ r, partyMap, showSeat }: Ctx) {
  const c = r.contests
  const noChanges = !c.changedLineups.length && !c.stars.length && !c.strengthEdits.length && !c.customParties.length
  return (
    <Part id="contests" title="2 · Who stood where" lead={<>
      Which parties stand in each <T k="constituency" /> matters. A seat with only one party is won without a vote (a <T k="walkover" />), and when several parties oppose the leading party in the same seat they can split the vote between them.
    </>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Contested" value={c.contested} sub="seats with a vote" />
        <Stat label="Walkovers" value={c.walkovers.length} sub="won without a vote" />
        <Stat label="Straight fights" value={c.straight} sub="two parties" />
        <Stat label="Multi-cornered" value={c.multi.length} sub="three or more parties" />
      </div>
      <Sub title="How each party did where it stood">
        <Table head={['Party', 'Stood in', 'Won', 'Vote where it stood', '2025']}>
          {c.parties.map((p) => (
            <tr key={p.party}>
              <Td left><Badge p={p.party} partyMap={partyMap} /> <span className="text-slate-400">{partyMap[p.party]?.name}</span></Td>
              <Td>{p.stood} <span className="text-slate-500">({p.mpsStood} MPs)</span></Td>
              <Td className="font-semibold">{p.won}</Td>
              <Td>{p.shareWhereStood === null ? '–' : pct(p.shareWhereStood)}</Td>
              <Td className="text-slate-400">{p.prevShareWhereStood === null ? 'new' : pct(p.prevShareWhereStood)}</Td>
            </tr>
          ))}
        </Table>
        <p className="mt-1 text-[11px] text-slate-500">"Vote where it stood" is each party's share of the vote only in the constituencies it contested. A party that stands in fewer, friendlier seats can score higher here than one that stands everywhere.</p>
      </Sub>
      {c.multi.length > 0 && (
        <Sub title={<><T k="multi-cornered">Multi-cornered fights</T></>}>
          <Seats list={c.multi} showSeat={showSeat} render={(s) => <>{s.lineup.join(' vs ')} · won by {s.r.winner} with {pct(s.r.shares[s.r.winner])}</>} />
        </Sub>
      )}
      {c.walkovers.length > 0 && (
        <Sub title={<><T k="walkover">Walkovers</T></>}>
          <Seats list={c.walkovers} showSeat={showSeat} render={(s) => <>{s.r.winner} returned unopposed</>} />
        </Sub>
      )}
      <Sub title="Changes you made">
        {noChanges && <p className="text-xs text-slate-400">You kept the suggested line-ups, team leaders and party strengths.</p>}
        {c.changedLineups.length > 0 && (
          <More summary={`${c.changedLineups.length} constituencies with line-ups or leaders you changed`}>
            <ul className="space-y-1 text-xs">
              {c.changedLineups.map(({ seat, added, removed, otherChanges }) => (
                <li key={seat.c.id} className="flex flex-wrap gap-x-2"><SeatName s={seat} showSeat={showSeat} />
                  <span className="text-slate-400">{[added.length ? `added ${added.join(', ')}` : '', removed.length ? `removed ${removed.join(', ')}` : '', otherChanges ? 'changed leaders or bonuses' : ''].filter(Boolean).join('; ')}</span>
                </li>
              ))}
            </ul>
          </More>
        )}
        {c.stars.length > 0 && (
          <div className="mt-1.5 text-xs">
            <p className="text-slate-300">Candidate bonuses (for a well-known minister or star candidate):</p>
            <ul className="mt-0.5 space-y-0.5">{c.stars.map((x) => <li key={`${x.seat.c.id}-${x.party}`} className="flex flex-wrap gap-x-2"><SeatName s={x.seat} showSeat={showSeat} /><span className="text-slate-400">{x.party} {signed(x.points)} points</span></li>)}</ul>
          </div>
        )}
        {c.strengthEdits.length > 0 && <p className="mt-1.5 text-xs text-slate-300">Party strength changed: {c.strengthEdits.map((e) => `${e.party} from ${e.from.toFixed(2)} to ${e.to.toFixed(2)}`).join(', ')}. Strength sets how well a party does where it has not stood before.</p>}
        {c.customParties.length > 0 && <p className="mt-1.5 text-xs text-slate-300">Parties you created: {c.customParties.join(', ')}.</p>}
      </Sub>
      {(c.electedLeaders.length > 0 || c.defeatedLeaders.length > 0) && (
        <More summary={`Team leaders: ${c.electedLeaders.length} elected, ${c.defeatedLeaders.length} defeated`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="mb-1 text-[11px] font-semibold text-emerald-300">Elected</div>
              <ul className="space-y-0.5 text-xs">{c.electedLeaders.map((l) => <li key={`${l.seat.c.id}-${l.party}`}><Badge p={l.party} partyMap={partyMap} /> {l.name} <span className="text-slate-500">· {l.seat.c.name}</span></li>)}</ul></div>
            <div><div className="mb-1 text-[11px] font-semibold text-red-300">Defeated</div>
              <ul className="space-y-0.5 text-xs">{c.defeatedLeaders.map((l) => <li key={`${l.seat.c.id}-${l.party}`}><Badge p={l.party} partyMap={partyMap} /> {l.name} <span className="text-slate-500">· {l.seat.c.name}</span></li>)}</ul></div>
          </div>
        </More>
      )}
    </Part>
  )
}

function SwingLine({ s }: { s: SeatReport }) {
  return <>PAP {pct(s.pap0 ?? 0)} → {pct(s.papResult ?? 0)} (<b>{signed(s.totalSwing ?? 0)}</b>: your settings {signed(s.settingsSwing ?? 0)}, surprises {signed(s.surprise ?? 0)})</>
}

function Swings({ r, partyMap, showSeat }: Ctx) {
  const w = r.swings
  return (
    <Part id="swings" title="3 · How voters moved" lead={<>
      A <T k="swing" /> is how much support moves from one side to another, measured in <T k="points" />. Here we compare each constituency with its <T k="notional" /> 2025 result, and split the change into the part that came from your settings and the part that came from the night's random surprises.
    </>}>
      <Sub title="What you set">
        <ul className="space-y-1 text-xs">
          {w.settings.map((x) => <li key={x.label}><b className="text-slate-200">{x.label}:</b> <span className="text-slate-300">{x.text}</span></li>)}
        </ul>
      </Sub>
      <Sub title="National vote share">
        <Table head={['Party', '2025', 'This election', 'Change']}>
          {w.national.map((n) => (
            <tr key={n.party}><Td left><Badge p={n.party} partyMap={partyMap} /></Td><Td className="text-slate-400">{n.prev === null ? '–' : pct(n.prev)}</Td><Td className="font-semibold">{pct(n.share)}</Td><Td><Change v={n.prev === null ? null : (n.share - n.prev) * 100} /></Td></tr>
          ))}
        </Table>
        <p className="mt-1 text-[11px] text-slate-500">National shares also depend on where each party stood: standing in more seats usually means more votes overall.</p>
      </Sub>
      {w.avgTotal !== null && (
        <Sub title="Change in PAP's vote, constituency by constituency">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Average change" value={signed(w.avgTotal)} sub="points vs 2025" />
            <Stat label="From your settings" value={signed(w.avgSettings ?? 0)} sub="your forecast" />
            <Stat label="From surprises" value={signed(w.avgSurprise ?? 0)} sub={w.mode === 'surprise' ? 'random, this run' : 'none chosen'} />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
            Positive numbers mean PAP did better than in 2025, negative numbers mean the opposition did. "Your settings" also includes the effect of the line-ups: for example, a stronger or weaker challenger than in 2025, or extra parties splitting the vote. It covers the {r.seats.filter((s) => s.totalSwing !== null).length} constituencies where PAP stood and a vote took place.
          </p>
        </Sub>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Sub title="Biggest moves towards PAP"><Seats list={w.toPap} showSeat={showSeat} render={(s) => <SwingLine s={s} />} /></Sub>
        <Sub title="Biggest moves away from PAP"><Seats list={w.fromPap} showSeat={showSeat} render={(s) => <SwingLine s={s} />} /></Sub>
      </div>
      {w.mode === 'surprise' && (
        <Sub title={<>Where the surprises changed the winner (vs your <T k="forecast" />)</>}>
          <Seats list={w.forecastFlips} showSeat={showSeat} render={(s) => <>forecast {s.forecast.winner} by {points(s.forecast.margin * 100)}, actually won by {s.r.winner} by {points(s.r.margin * 100)}</>} />
        </Sub>
      )}
    </Part>
  )
}

function Results({ r, partyMap, showSeat }: Ctx) {
  const x = r.results
  const s = r.summary
  const gov = s.governmentName
  return (
    <Part id="results" title="4 · The final result" lead="The full count, which seats changed hands, and how close the result was.">
      <Table head={['Party', 'Seats', 'NCMPs', 'Votes', 'Share', 'vs 2025']}>
        {x.parties.map((p) => (
          <tr key={p.party}>
            <Td left><Badge p={p.party} partyMap={partyMap} /> <span className="text-slate-400">{partyMap[p.party]?.name}</span></Td>
            <Td className="font-semibold">{p.seats}</Td>
            <Td className="text-slate-400">{p.ncmp || '–'}</Td>
            <Td>{fmt(p.votes)}</Td>
            <Td className="font-semibold">{pct(p.share)}</Td>
            <Td><Change v={p.prevShare === null ? null : (p.share - p.prevShare) * 100} /></Td>
          </tr>
        ))}
      </Table>
      {s.coalition && <p className="text-xs text-slate-300">After the count, you formed a <T k="coalition" /> of {coalitionName(s.government)} with {s.govSeats} seats between them.</p>}
      <Sub title={<>Seats that <T k="changed hands" /> ({x.gains.length})</>}>
        <Seats list={x.gains} showSeat={showSeat} render={(g) => <>{g.r.winner} gain from {g.holder}{g.leaders[g.r.winner] ? `, team led by ${g.leaders[g.r.winner]}` : ''} · {pct(g.r.shares[g.r.winner])}, <T k="margin" /> {points(g.r.margin * 100)}</>} />
        <p className="mt-1 text-[11px] text-slate-500">{x.holds} contested constituencies stayed with the party that notionally held them in 2025.</p>
      </Sub>
      <div className="grid gap-3 sm:grid-cols-2">
        <Sub title="Closest results">
          <Seats list={x.closest} showSeat={showSeat} render={(c) => <>{c.r.winner} over {c.r.runnerUp} by {points(c.r.margin * 100)}</>} />
        </Sub>
        <Sub title="Safest results">
          <Seats list={x.safest} showSeat={showSeat} render={(c) => <>{c.r.winner} by {points(c.r.margin * 100)}</>} />
        </Sub>
      </div>
      <Sub title="How easily could it have gone differently?">
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">
          <li>{x.close.length} constituencies were decided by less than {CLOSE_MARGIN * 100} points.</li>
          {x.loseMajority.points !== null && <li>{gov} would lose its <T k="majority" /> if about <b>{points(x.loseMajority.points)}</b> more voters out of every 100 moved away from it in every seat. The tipping seat is {x.loseMajority.seat}.</li>}
          {x.gainMajority.points !== null && <li>{gov} would win a <T k="majority" /> on its own with a shift of about <b>{points(x.gainMajority.points)}</b> towards it in every seat. The tipping seat is {x.gainMajority.seat}.</li>}
          {x.twoThirds.points !== null && <li>{x.twoThirds.direction === 'lose'
            ? <>{gov} would drop below <T k="two-thirds" /> with a shift of about <b>{points(x.twoThirds.points)}</b> away from it.</>
            : <>{gov} would reach <T k="two-thirds" /> with a shift of about <b>{points(x.twoThirds.points)}</b> towards it.</>}</li>}
          <li className="list-none text-[11px] text-slate-500">These are rough estimates that assume every seat moves by the same amount, which real elections never do exactly.</li>
        </ul>
      </Sub>
      {x.ncmp.length > 0 && (
        <Sub title={<><T k="NCMP">Non-Constituency MPs</T> offered</>}>
          <p className="mb-1 text-xs text-slate-400">Parliament always has at least 12 opposition MPs. Because fewer were elected, NCMP seats go to the best-performing opposition candidates who lost:</p>
          <ul className="space-y-0.5 text-xs">{x.ncmp.map((n) => <li key={n.constituency}><Badge p={n.party} partyMap={partyMap} /> {n.name} with {pct(n.share)} ({n.seats} seat{n.seats > 1 ? 's' : ''})</li>)}</ul>
        </Sub>
      )}
      {x.samples && (
        <Sub title={<>How good were the <T k="sample count">sample counts</T>?</>}>
          <p className="text-xs text-slate-300">
            In {x.samples.rightLeader} of {x.samples.total} constituencies, the sample count already showed the eventual winner ahead.
            {' '}{x.samples.withinMargin} of {x.samples.total} were within 4 points of the final result, and the average gap for the biggest party difference was {x.samples.avgError.toFixed(1)} points.
          </p>
        </Sub>
      )}
    </Part>
  )
}

type Filter = 'all' | 'gains' | 'close' | 'changed'

function AllSeats({ r, partyMap, showSeat }: Ctx) {
  const [filter, setFilter] = useState<Filter>('all')
  const list = r.seats.filter((s) =>
    filter === 'all' ? true : filter === 'gains' ? s.gain : filter === 'close' ? !s.r.walkover && s.r.margin < CLOSE_MARGIN : s.status !== 'unchanged')
  const filters: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'gains', label: 'Changed hands' }, { id: 'close', label: `Under ${CLOSE_MARGIN * 100} points` }, { id: 'changed', label: 'Redrawn or new' }]
  return (
    <Part id="seats" title="5 · Every constituency" lead="The full result in every constituency. Select a name to see it on the map.">
      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-md border px-2 py-0.5 text-xs ${filter === f.id ? 'border-slate-200 bg-slate-200 text-slate-900' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>{f.label}</button>
        ))}
        <span className="ml-auto self-center text-[11px] text-slate-500">{list.length} shown</span>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="text-[10px] uppercase text-slate-500">
            <tr>
              <th className="pb-1 text-left font-medium">Constituency</th>
              <th className="pb-1 text-left font-medium">Map</th>
              <th className="pb-1 text-right font-medium">Voters</th>
              <th className="pb-1 text-left font-medium pl-2">Line-up</th>
              <th className="pb-1 text-left font-medium">Winner</th>
              <th className="pb-1 text-right font-medium">Margin</th>
              <th className="pb-1 text-right font-medium">PAP change</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {list.map((s) => (
              <tr key={s.c.id} className="border-t border-slate-800/70 align-top">
                <td className="py-1"><SeatName s={s} showSeat={showSeat} /></td>
                <td className="py-1"><span className={`rounded px-1 text-[9px] font-bold uppercase ${STATUS[s.status].cls}`} title={STATUS[s.status].hint}>{STATUS[s.status].label}</span></td>
                <td className="py-1 text-right text-slate-400">{fmt(s.electors)}</td>
                <td className="py-1 pl-2 text-slate-400">{s.lineup.join(' · ')}</td>
                <td className="py-1">
                  <Badge p={s.r.winner} partyMap={partyMap} />{' '}
                  {s.r.walkover ? <span className="text-slate-500">unopposed</span> : <span>{pct(s.r.shares[s.r.winner])}</span>}{' '}
                  {s.gain ? <span className="rounded bg-amber-400 px-1 text-[9px] font-bold text-slate-900">GAIN from {s.holder}</span> : null}
                </td>
                <td className="py-1 text-right">{s.r.walkover ? '–' : (s.r.margin * 100).toFixed(1)}</td>
                <td className="py-1 text-right">{s.totalSwing === null ? <span className="text-slate-500">–</span> : <Change v={s.totalSwing} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Margin and PAP change are in points. PAP change compares with the {PAP} share these voters gave in 2025 (notionally).</p>
    </Part>
  )
}

function Terms() {
  return (
    <Part id="terms" title="Terms used in this report">
      <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        {Object.entries(GLOSSARY).map(([k, v]) => (
          <div key={k}><dt className="font-semibold text-slate-200">{k}</dt><dd className="text-slate-400">{v}</dd></div>
        ))}
      </dl>
      <p className="text-[11px] text-slate-500">{DISCLAIMER_SHORT} All figures come from the simulator's model and your own settings, not from real polls.</p>
    </Part>
  )
}
