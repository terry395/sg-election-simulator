import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { Button, PartyBadge, Section, ShareBar, Swatch, pct, fmt } from '../components/ui'
import { FastForward, FileText, Info, Newspaper, Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { notionalHolder } from '../model/report'
import { CoalitionBuilder } from '../components/CoalitionBuilder'
import { coalitionName, isHung, majorityOf } from '../model/coalition'
import { DISCLAIMER_SHORT } from '../data/disclaimer'
import { SeatBar } from '../components/SeatBar'
import { Hemicycle } from '../components/Hemicycle'
import { buildTimeline, clock, tallySamples, type NewsTag, type NightEvent } from '../model/timeline'
import { SampleCountChart } from '../components/SampleCountChart'
import { nightMusic, useMusic } from '../audio/nightMusic'
import { runElection, type SeatResult } from '../model/swing'
import { rng } from '../model/rng'
import { PAP } from '../data/parties'
import type { Constituency, Party } from '../types'
import { useSheet } from '../lib/sheet'

const SPEEDS = [{ v: 2, label: '1×' }, { v: 6, label: '3×' }, { v: 20, label: '10×' }]

/** Tally of what has been officially declared so far. */
export function useDeclared() {
  const result = useNight((s) => s.result)
  const plan = useNight((s) => s.plan)
  const revealed = useNight((s) => s.revealed)
  return useMemo(() => {
    const seats: Record<string, number> = {}
    const votes: Record<string, number> = {}
    let declared = 0
    let valid = 0
    if (result && plan) plan.forEach((c, i) => {
      if (revealed[c.id] !== 'result') return
      const r = result.seats[i]
      seats[r.winner] = (seats[r.winner] || 0) + c.seats
      declared += c.seats
      for (const [p, v] of Object.entries(r.votes)) votes[p] = (votes[p] || 0) + v
      valid += r.valid
    })
    const total = plan?.reduce((s, c) => s + c.seats, 0) ?? 0
    return { seats, votes, declared, valid, total }
  }, [result, plan, revealed])
}

export function NightPanel() {
  const plan = useStore((s) => s.plan)
  const swings = useStore((s) => s.swings)
  const { stats, contests, partyMap, projection } = useDerived()
  const night = useNight()
  const [mode, setMode] = useState<'surprise' | 'projection'>('surprise')

  const ge = useStore((s) => s.data)!.ge
  const start = () => {
    nightMusic.unlock()
    const seed = Math.floor(Math.random() * 1e9)
    const result = mode === 'projection' ? projection : runElection(plan.constituencies, stats.byId, contests, swings, partyMap, rng(seed))
    const news = {
      leaders: Object.fromEntries(Object.entries(contests).map(([id, c]) => [id, c.leaders])),
      holders: Object.fromEntries(Object.entries(stats.byId).map(([id, s]) => [id, notionalHolder(s.pap0, s.mainOpp)])),
      prevNational: Object.fromEntries(Object.entries(ge.parties).map(([p, v]) => [p, v.national])),
      contests,
    }
    night.start(plan.constituencies, result, buildTimeline(plan.constituencies, result, seed, news), seed, mode)
    // phones: lower the panel so the map and scoreboard are in view
    useSheet.getState().setSnap('peek')
  }

  // animation loop: speed = simulated minutes per real second
  const playing = night.playing
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000
      last.current = now
      useNight.getState().advance(dt * useNight.getState().speed)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); last.current = null }
  }, [playing])

  if (!night.result || !night.plan) {
    return (
      <div>
        <Section title="Election night">
          <p className="text-sm text-slate-300">Polls close at 8pm. Watch sample counts come in, then the Returning Officer's declarations through the night, until the new Parliament is known.</p>
          <div className="mt-3 space-y-1.5 text-xs">
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-700 p-2 hover:bg-slate-900">
              <input type="radio" checked={mode === 'surprise'} onChange={() => setMode('surprise')} className="mt-0.5" />
              <span><b>Realistic night</b><br /><span className="text-slate-400">Your forecast plus a polling error (±{swings.sigmaNational}pp) and seat-level surprises (±{swings.sigmaLocal}pp). Every run is different.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-700 p-2 hover:bg-slate-900">
              <input type="radio" checked={mode === 'projection'} onChange={() => setMode('projection')} className="mt-0.5" />
              <span><b>Exactly my forecast</b><br /><span className="text-slate-400">Results match the Forecast tab with no surprises.</span></span>
            </label>
          </div>
          <Button variant="primary" className="mt-3 w-full py-2.5 text-sm" onClick={start}><Play size={15} aria-hidden /> Polls close — start the count</Button>
        </Section>
        <Section title="Your map">
          <p className="text-xs text-slate-400">{plan.constituencies.length} constituencies · {stats.seats} seats · {fmt(stats.assignedElectors)} electors. {Object.values(contests).filter((c) => c.parties.length <= 1).length} walkovers.</p>
        </Section>
      </div>
    )
  }
  return <NightLive onRestart={start} />
}

function NightLive({ onRestart }: { onRestart: () => void }) {
  const night = useNight()
  const { partyMap, stats, contests } = useDerived()
  const setActive = useStore((s) => s.setActive)
  const d = useDeclared()
  const done = night.cursor >= night.events.length
  const plan = night.plan!
  const result = night.result!
  const byId = useMemo(() => Object.fromEntries(plan.map((c, i) => [c.id, { c, r: result.seats[i] }])), [plan, result])
  const fired = night.events.slice(0, night.cursor).filter((e) => e.kind !== 'ncmp').reverse()
  const ge = useStore((s) => s.data)!.ge
  const samples = useMemo(() => tallySamples(night.events, night.cursor, plan), [night.events, night.cursor, plan])
  useNightMusic()
  // the report opens by itself once the last result is in
  const wasDone = useRef(done)
  useEffect(() => {
    if (done && !wasDone.current) useNight.getState().setReportOpen(true)
    wasDone.current = done
  }, [done])

  return (
    <div>
      <Section title="Live" right={<span className="tabular text-lg font-bold text-rose-400">{night.t < 0 ? '8:00 pm' : clock(night.t)}</span>}>
        <NightControls />
        <div className="mt-3 flex justify-center">
          <Hemicycle seats={d.seats} total={d.total} parties={partyMap} ncmp={done ? night.result!.ncmp : undefined} width={330} government={night.coalition ?? undefined} />
        </div>
        <div className="mt-2">
          <SeatBar seats={d.seats} total={d.total} parties={partyMap} />
          <div className="mt-1 text-[11px] text-slate-400">{d.declared} of {d.total} seats declared</div>
        </div>
        {samples.sampled > 0 && (
          <div className="mt-3 rounded-md border border-slate-800 p-2">
            <SampleCountChart tally={samples} total={d.total} parties={partyMap} />
          </div>
        )}
        {d.valid > 0 && (
          <div className="mt-2">
            <ShareBar parts={Object.entries(d.votes).sort((a, b) => b[1] - a[1]).map(([p, v]) => ({ color: partyMap[p]?.color ?? '#999', value: v, label: `${p} ${fmt(v)} (${pct(v / d.valid)})` }))} />
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-300">
              {Object.entries(d.votes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, v]) => <span key={p}>{p} <span className="tabular">{fmt(v)}</span> <b className="tabular">({pct(v / d.valid)})</b></span>)}
              <span className="text-slate-500">of declared votes</span>
            </div>
          </div>
        )}
      </Section>

      {done && <FinalSummary plan={plan} partyMap={partyMap} />}

      <Section title="Announcements">
        <ul className="space-y-1.5">
          {fired.length === 0 && <li className="text-xs text-slate-400">Counting has begun at the counting centres…</li>}
          {fired.map((e, k) => {
            if (e.kind === 'news') return (
              <li key={`news-${e.t}-${e.headline}`} className={`rounded-md border border-slate-700 bg-slate-900/70 p-2 text-xs ${k === 0 ? 'flash' : ''} ${e.cid ? 'cursor-pointer' : ''}`} onClick={() => e.cid && setActive(e.cid)}>
                <NewsLine e={e} />
              </li>
            )
            const it = byId[e.cid]
            if (!it) return null
            const s = stats.byId[e.cid]
            return (
              <li key={`${e.kind}-${e.cid}`} className={`rounded-md border border-slate-800 p-2 text-xs ${k === 0 ? 'flash' : ''}`} onClick={() => setActive(e.cid)}>
                <EventLine e={e} c={it.c} r={it.r} partyMap={partyMap} holder={s ? notionalHolder(s.pap0, s.mainOpp) : PAP} leaders={contests[e.cid]?.leaders} />
              </li>
            )
          })}
        </ul>
      </Section>
      <Section title="Replay">
        <Button onClick={onRestart} className="w-full"><RotateCcw size={14} aria-hidden /> New election night (new random draw)</Button>
        <p className="mt-2 text-[11px] text-slate-500">Seed {night.seed}. Sample counts are accurate to ±4 percentage points at 95% confidence, as with ELD's real sample counts. GE2025 national result for reference: PAP {pct(ge.parties.PAP.national)}.</p>
      </Section>
    </div>
  )
}

/** Play / pause, step, speed and skip for the count (also shown in the phone sheet's peek row). */
export function NightControls({ compact = false }: { compact?: boolean }) {
  const night = useNight()
  const done = night.cursor >= night.events.length
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant={night.playing ? 'subtle' : 'primary'} onClick={() => night.setPlaying(!night.playing)} disabled={done}>{night.playing ? <><Pause size={14} aria-hidden /> Pause</> : <><Play size={14} aria-hidden /> Play</>}</Button>
      <Button onClick={night.stepNext} disabled={done} title="Next announcement" aria-label="Next announcement"><SkipForward size={14} aria-hidden />{!compact && ' Next'}</Button>
      <div className="flex overflow-hidden rounded-md border border-slate-700">
        {SPEEDS.map((s) => (
          <button key={s.v} onClick={() => night.setSpeed(s.v)} className={`px-2 py-1 text-xs phone:min-h-9 phone:px-2.5 ${night.speed === s.v ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>{s.label}</button>
        ))}
      </div>
      <Button onClick={night.skipToEnd} disabled={done} title="Skip to the end" aria-label="Skip to the end">{!compact && 'Skip '}<FastForward size={14} aria-hidden /></Button>
      {!compact && <MuteButton className="ml-auto" />}
    </div>
  )
}

/** Plays the music bed while the count runs, with stings on big news and a flourish at the end. */
function useNightMusic() {
  const playing = useNight((s) => s.playing)
  const cursor = useNight((s) => s.cursor)
  const events = useNight((s) => s.events)
  const done = cursor >= events.length
  useEffect(() => {
    if (playing && !done) nightMusic.play()
    else nightMusic.pause()
  }, [playing, done])
  useEffect(() => () => nightMusic.pause(), [])
  const prev = useRef(cursor)
  useEffect(() => {
    const from = prev.current
    prev.current = cursor
    if (cursor <= from) return
    if (done) { nightMusic.sting('final'); return }
    let sting: 'breaking' | 'projection' | null = null
    for (let i = from; i < cursor; i++) {
      const e = events[i]
      if (e.kind === 'news' && (e.tag === 'projection' || (e.tag === 'breaking' && !sting))) sting = e.tag
    }
    if (sting) nightMusic.sting(sting)
  }, [cursor, events, done])
}

function MuteButton({ className = '' }: { className?: string }) {
  const muted = useMusic((s) => s.muted)
  const toggle = useMusic((s) => s.toggle)
  return (
    <Button onClick={toggle} className={className} title={muted ? 'Unmute music' : 'Mute music'} aria-label={muted ? 'Unmute music' : 'Mute music'} aria-pressed={muted}>
      {muted ? <VolumeX size={14} aria-hidden /> : <Volume2 size={14} aria-hidden />}
    </Button>
  )
}

const NEWS_STYLE: Record<NewsTag, { label: string; cls: string }> = {
  breaking: { label: 'Breaking', cls: 'bg-red-600 text-white' },
  projection: { label: 'Projection', cls: 'bg-blue-600 text-white' },
  analysis: { label: 'Analysis', cls: 'bg-slate-600 text-slate-100' },
  desk: { label: 'Newsdesk', cls: 'bg-slate-200 text-slate-900' },
}

type NewsEvent = Extract<NightEvent, { kind: 'news' }>

function NewsLine({ e }: { e: NewsEvent }) {
  const s = NEWS_STYLE[e.tag]
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="tabular text-slate-500">{clock(e.t)}</span>
        <span className={`rounded px-1 text-[9px] font-bold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
        <Newspaper size={12} className="text-slate-500" aria-hidden />
      </div>
      <div className="mt-0.5 font-semibold text-slate-100">{e.headline}</div>
      {e.body && <div className="mt-0.5 text-[11px] text-slate-400">{e.body}</div>}
    </div>
  )
}

/** Lower-third news flash on the map, shown for a while after each news item. */
function NewsTicker() {
  const t = useNight((s) => s.t)
  const events = useNight((s) => s.events)
  const cursor = useNight((s) => s.cursor)
  let latest: NewsEvent | undefined
  for (let i = cursor - 1; i >= 0; i--) {
    const e = events[i]
    if (e.kind === 'news') { latest = e; break }
  }
  if (!latest || t - latest.t > 30) return null
  const s = NEWS_STYLE[latest.tag]
  return (
    <div key={`${latest.t}-${latest.headline}`} className="news-in flex max-w-xl items-stretch overflow-hidden rounded-md bg-slate-950/90 text-xs shadow-xl ring-1 ring-slate-700 backdrop-blur">
      <span className={`flex items-center px-2 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
      <span className="px-2.5 py-1.5"><b className="text-slate-100">{latest.headline}</b>{latest.body && <span className="hidden text-slate-400 sm:inline"> · {latest.body}</span>}</span>
    </div>
  )
}

function EventLine({ e, c, r, partyMap, holder, leaders }: { e: NightEvent; c: Constituency; r: SeatResult; partyMap: Record<string, Party>; holder: string; leaders?: Record<string, string> }) {
  const time = <span className="tabular text-slate-500">{clock(e.t)}</span>
  if (e.kind === 'walkover') return <div>{time} <b>{c.name}</b> — <PartyBadge party={partyMap[r.winner]} small />{leaders?.[r.winner] ? ` team led by ${leaders[r.winner]}` : ''} returned unopposed on Nomination Day</div>
  if (e.kind === 'sample') {
    const sorted = Object.entries(e.shares).sort((a, b) => b[1] - a[1])
    return (
      <div>
        {time} <span className="text-slate-400">Sample count</span> <b>{c.name}</b>: {sorted.map(([p, v]) => <span key={p} className="mr-1.5"><Swatch color={partyMap[p]?.color} /> {p} {Math.round(v * 100)}%</span>)}
      </div>
    )
  }
  if (e.kind !== 'result') return null
  const gain = r.winner !== holder
  const sorted = Object.entries(r.shares).sort((a, b) => b[1] - a[1])
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {time}
        <PartyBadge party={partyMap[r.winner]} small />
        <b>{c.name} {c.type}</b>
        {gain ? <span className="rounded bg-amber-400 px-1 text-[10px] font-bold text-slate-900">{r.winner} GAIN from {holder}</span> : <span className="text-[10px] text-slate-500">{r.winner} hold</span>}
      </div>
      {leaders?.[r.winner] && (
        <div className="mt-0.5 text-[11px] text-slate-300">
          {c.type === 'GRC' ? 'Team led by' : 'Elected:'} <b>{leaders[r.winner]}</b>
          {r.runnerUp && leaders[r.runnerUp] ? <span className="text-slate-500"> · defeated {r.runnerUp} {c.type === 'GRC' ? 'team led by' : ''} {leaders[r.runnerUp]}</span> : null}
        </div>
      )}
      <div className="mt-1"><ShareBar height={6} parts={sorted.map(([p, v]) => ({ color: partyMap[p]?.color ?? '#999', value: v, label: p }))} /></div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
        {sorted.map(([p, v]) => <span key={p}>{p} {pct(v, 2)} ({fmt(r.votes[p])})</span>)}
        <span>turnout {pct(r.turnout)}</span>
        {r.margin < 0.02 && <span className="text-amber-300">recount margin</span>}
      </div>
    </div>
  )
}

function FinalSummary({ plan, partyMap }: { plan: Constituency[]; partyMap: Record<string, Party> }) {
  const result = useNight((s) => s.result)!
  const { contests } = useDerived()
  const ge = useStore((s) => s.data)!.ge
  const { stats } = useDerived()
  const total = plan.reduce((s, c) => s + c.seats, 0)
  const coalition = useNight((s) => s.coalition)
  const setCoalition = useNight((s) => s.setCoalition)
  const hung = isHung(result.seatsByParty, total)
  const gov = result.government
  const govSeats = coalition ? coalition.reduce((s, p) => s + (result.seatsByParty[p] ?? 0), 0) : result.seatsByParty[gov] ?? 0
  const verdict = coalition
    ? `${coalitionName(coalition)} coalition forms the government`
    : !hung ? `${gov === PAP ? 'PAP' : partyMap[gov]?.name ?? gov} forms the government` : 'Hung Parliament — no party has a majority'
  const gains = plan.map((c, i) => ({ c, r: result.seats[i] })).filter(({ c, r }) => {
    const s = stats.byId[c.id]
    return s && !r.walkover && r.winner !== notionalHolder(s.pap0, s.mainOpp)
  })
  return (
    <Section title="Result">
      <Button variant="primary" className="mb-2 w-full py-2 text-sm" onClick={() => useNight.getState().setReportOpen(true)}>
        <FileText size={15} aria-hidden /> Read the election report
      </Button>
      <div className="rounded-md bg-gradient-to-r from-slate-800 to-slate-900 p-3">
        <div className="text-base font-bold">{verdict}</div>
        <div className="text-xs text-slate-300">
          {hung && !coalition ? `Largest party: ${gov} with ${govSeats} of ${total} seats · ${majorityOf(total)} needed` : `${govSeats} of ${total} seats${govSeats >= Math.ceil((total * 2) / 3) ? ' · two-thirds supermajority' : govSeats > total / 2 && !coalition ? ' · supermajority lost' : ''}`}
          {coalition && <> · <button className="text-violet-300 underline-offset-2 hover:underline" onClick={() => setCoalition(null)}>change</button></>}
        </div>
      </div>
      {hung && (
        <CoalitionBuilder seatsByParty={result.seatsByParty} votesByParty={result.votesByParty} totalValid={result.totalValid} total={total}
          contests={contests} parties={partyMap} formed={coalition} onForm={setCoalition} />
      )}
      {coalition && <p className="mt-1 text-[10px] text-slate-500">Non-Constituency MP offers below are as computed on the night, before coalition talks.</p>}
      <table className="mt-2 w-full text-xs">
        <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left font-medium">Party</th><th className="text-right font-medium">Seats</th><th className="text-right font-medium">Votes</th><th className="text-right font-medium">vs 2025</th></tr></thead>
        <tbody>
          {Object.entries(result.votesByParty).sort((a, b) => (result.seatsByParty[b[0]] ?? 0) - (result.seatsByParty[a[0]] ?? 0) || b[1] - a[1]).map(([p, v]) => {
            const share = v / result.totalValid
            const prev = ge.parties[p]?.national
            const ncmp = result.ncmp.filter((n) => n.party === p).reduce((s, n) => s + n.seats, 0)
            return (
              <tr key={p} className="border-t border-slate-800/70">
                <td className="py-1"><PartyBadge party={partyMap[p]} small /> <span className="text-slate-300">{partyMap[p]?.name}</span></td>
                <td className="tabular text-right font-semibold">{result.seatsByParty[p] ?? 0}{ncmp ? <span className="font-normal text-slate-400"> +{ncmp}N</span> : ''}</td>
                <td className="tabular text-right"><span className="whitespace-nowrap text-slate-300">{fmt(v)}</span> <span className="whitespace-nowrap font-semibold">{pct(share)}</span></td>
                <td className={`tabular text-right ${prev === undefined ? 'text-slate-500' : share - prev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{prev === undefined ? 'new' : `${share - prev >= 0 ? '+' : ''}${((share - prev) * 100).toFixed(1)}`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 flex items-start gap-1.5 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-100"><Info size={13} className="mt-px shrink-0" aria-hidden /><span>A simulated election based on your own settings. {DISCLAIMER_SHORT}</span></p>
      <p className="mt-1 text-[10px] text-slate-500">National vote shares compare against all valid votes nationwide (GE2025 PAP {pct(ge.parties.PAP.national)}).</p>
      {gains.length > 0 && (
        <div className="mt-2 text-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Changing hands</div>
          {gains.map(({ c, r }) => <div key={c.id}><PartyBadge party={partyMap[r.winner]} small /> {c.name} {c.type === 'GRC' ? `(${c.seats})` : ''}{contests[c.id]?.leaders?.[r.winner] ? <span className="text-slate-400"> · {contests[c.id].leaders![r.winner]}</span> : null}</div>)}
        </div>
      )}
      {result.ncmp.length > 0 && (
        <div className="mt-2 text-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Non-Constituency MPs offered</div>
          {result.ncmp.map((n) => <div key={n.constituency}><PartyBadge party={partyMap[n.party]} small /> {plan.find((c) => c.id === n.constituency)?.name} — {pct(n.share)} ({n.seats} seat{n.seats > 1 ? 's' : ''})</div>)}
        </div>
      )}
    </Section>
  )
}

/** Scoreboard shown on top of the map during election night. */
export function NightOverlay() {
  const night = useNight()
  const { partyMap } = useDerived()
  const d = useDeclared()
  if (!night.result) return null
  const leader = Object.entries(d.seats).sort((a, b) => b[1] - a[1])[0]
  const majority = Math.floor(d.total / 2) + 1
  const called = leader && leader[1] >= majority
  const done = night.cursor >= night.events.length
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-slate-950/85 px-4 py-1.5 text-sm shadow-lg ring-1 ring-slate-700 backdrop-blur phone:gap-x-2 phone:px-3 phone:text-xs desk:rounded-full">
        <span className="tabular font-bold text-rose-400">{night.t < 0 ? '8:00 pm' : clock(night.t)}</span>
        {Object.entries(d.seats).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
          <span key={p} className="flex items-center gap-1"><PartyBadge party={partyMap[p]} small /><b className="tabular">{n}</b></span>
        ))}
        <span className="text-xs text-slate-400">{d.total - d.declared} to declare</span>
        <MuteButton className="pointer-events-auto -my-1 -mr-2 rounded-full border-0 px-1.5 py-1" />
      </div>
      <NewsTicker />
      {called && (
        <div className="rounded-lg px-4 py-2 text-center text-sm font-extrabold uppercase tracking-wide shadow-xl" style={{ background: partyMap[leader[0]]?.color, color: '#fff' }}>
          {leader[0]} wins a majority — {leader[1]} seats declared
        </div>
      )}
      {done && !night.reportOpen && (
        <button onClick={() => night.setReportOpen(true)} className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-slate-950/90 px-3 py-1 text-xs font-semibold text-slate-100 shadow-lg ring-1 ring-rose-500/70 hover:bg-slate-900">
          <FileText size={13} className="text-rose-300" aria-hidden /> Election report ready: read it
        </button>
      )}
    </div>
  )
}

/** Live parliament chart floating over the map during election night. */
export function NightParliament() {
  const result = useNight((s) => s.result)
  const coalition = useNight((s) => s.coalition)
  const done = useNight((s) => s.cursor >= s.events.length && s.events.length > 0)
  const { partyMap } = useDerived()
  const d = useDeclared()
  if (!result) return null
  return (
    <div className="pointer-events-none absolute bottom-10 right-3 z-10 hidden w-64 rounded-xl bg-slate-950/85 p-2.5 shadow-xl ring-1 ring-slate-700 backdrop-blur sm:block">
      <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>Parliament</span><span className="tabular">{d.declared}/{d.total} declared</span>
      </div>
      <Hemicycle seats={d.seats} total={d.total} parties={partyMap} ncmp={done ? result.ncmp : undefined} width={240} government={coalition ?? undefined} />
    </div>
  )
}
