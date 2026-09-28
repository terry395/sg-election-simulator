import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { Button, PartyBadge, Section, ShareBar, pct, fmt } from '../components/ui'
import { SeatBar } from '../components/SeatBar'
import { buildTimeline, clock, type NightEvent } from '../model/timeline'
import { runElection, type SeatResult } from '../model/swing'
import { rng } from '../model/rng'
import { PAP } from '../data/parties'
import type { Constituency, Party } from '../types'

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

/** The party that held these voters in 2025 (notionally). */
function notionalHolder(pap0: number, mainOpp: string) {
  return pap0 >= 0.5 ? PAP : mainOpp
}

export function NightPanel() {
  const plan = useStore((s) => s.plan)
  const swings = useStore((s) => s.swings)
  const { stats, contests, partyMap, projection } = useDerived()
  const night = useNight()
  const [mode, setMode] = useState<'surprise' | 'projection'>('surprise')

  const start = () => {
    const seed = Math.floor(Math.random() * 1e9)
    const result = mode === 'projection' ? projection : runElection(plan.constituencies, stats.byId, contests, swings, partyMap, rng(seed))
    night.start(plan.constituencies, result, buildTimeline(plan.constituencies, result, seed), seed)
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
          <Button variant="primary" className="mt-3 w-full py-2.5 text-sm" onClick={start}>▶ Polls close — start the count</Button>
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
  const { partyMap, stats } = useDerived()
  const setActive = useStore((s) => s.setActive)
  const d = useDeclared()
  const done = night.cursor >= night.events.length
  const plan = night.plan!
  const result = night.result!
  const byId = useMemo(() => Object.fromEntries(plan.map((c, i) => [c.id, { c, r: result.seats[i] }])), [plan, result])
  const fired = night.events.slice(0, night.cursor).filter((e) => e.kind !== 'ncmp').reverse()
  const ge = useStore((s) => s.data)!.ge

  return (
    <div>
      <Section title="Live" right={<span className="tabular text-lg font-bold text-rose-400">{night.t < 0 ? '8:00 pm' : clock(night.t)}</span>}>
        <div className="flex items-center gap-1.5">
          <Button variant={night.playing ? 'subtle' : 'primary'} onClick={() => night.setPlaying(!night.playing)} disabled={done}>{night.playing ? '❚❚ Pause' : '▶ Play'}</Button>
          <Button onClick={night.stepNext} disabled={done} title="Next announcement">⏭ Next</Button>
          <div className="flex overflow-hidden rounded-md border border-slate-700">
            {SPEEDS.map((s) => (
              <button key={s.v} onClick={() => night.setSpeed(s.v)} className={`px-2 py-1 text-xs ${night.speed === s.v ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>{s.label}</button>
            ))}
          </div>
          <Button onClick={night.skipToEnd} disabled={done}>Skip ⏩</Button>
        </div>
        <div className="mt-3">
          <SeatBar seats={d.seats} total={d.total} parties={partyMap} />
          <div className="mt-1 text-[11px] text-slate-400">{d.declared} of {d.total} seats declared</div>
        </div>
        {d.valid > 0 && (
          <div className="mt-2">
            <ShareBar parts={Object.entries(d.votes).sort((a, b) => b[1] - a[1]).map(([p, v]) => ({ color: partyMap[p]?.color ?? '#999', value: v, label: `${p} ${pct(v / d.valid)}` }))} />
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-300">
              {Object.entries(d.votes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, v]) => <span key={p}>{p} <b className="tabular">{pct(v / d.valid)}</b></span>)}
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
            const it = byId[e.cid]
            if (!it) return null
            const s = stats.byId[e.cid]
            return (
              <li key={`${e.kind}-${e.cid}`} className={`rounded-md border border-slate-800 p-2 text-xs ${k === 0 ? 'flash' : ''}`} onClick={() => setActive(e.cid)}>
                <EventLine e={e} c={it.c} r={it.r} partyMap={partyMap} holder={s ? notionalHolder(s.pap0, s.mainOpp) : PAP} />
              </li>
            )
          })}
        </ul>
      </Section>
      <Section title="Replay">
        <Button onClick={onRestart} className="w-full">↻ New election night (new random draw)</Button>
        <p className="mt-2 text-[11px] text-slate-500">Seed {night.seed}. Sample counts are accurate to ±4 percentage points at 95% confidence, as with ELD's real sample counts. GE2025 national result for reference: PAP {pct(ge.parties.PAP.national)}.</p>
      </Section>
    </div>
  )
}

function EventLine({ e, c, r, partyMap, holder }: { e: NightEvent; c: Constituency; r: SeatResult; partyMap: Record<string, Party>; holder: string }) {
  const time = <span className="tabular text-slate-500">{clock(e.t)}</span>
  if (e.kind === 'walkover') return <div>{time} <b>{c.name}</b> — <PartyBadge party={partyMap[r.winner]} small /> returned unopposed on Nomination Day</div>
  if (e.kind === 'sample') {
    const sorted = Object.entries(e.shares).sort((a, b) => b[1] - a[1])
    return (
      <div>
        {time} <span className="text-slate-400">Sample count</span> <b>{c.name}</b>: {sorted.map(([p, v]) => <span key={p} className="mr-1.5"><span style={{ color: partyMap[p]?.color }}>■</span> {p} {Math.round(v * 100)}%</span>)}
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
  const ge = useStore((s) => s.data)!.ge
  const { stats } = useDerived()
  const total = plan.reduce((s, c) => s + c.seats, 0)
  const gov = result.government
  const govSeats = result.seatsByParty[gov] ?? 0
  const verdict = govSeats > total / 2 ? `${gov === PAP ? 'PAP' : partyMap[gov]?.name ?? gov} forms the government` : 'Hung Parliament — no party has a majority'
  const gains = plan.map((c, i) => ({ c, r: result.seats[i] })).filter(({ c, r }) => {
    const s = stats.byId[c.id]
    return s && !r.walkover && r.winner !== notionalHolder(s.pap0, s.mainOpp)
  })
  return (
    <Section title="Result">
      <div className="rounded-md bg-gradient-to-r from-slate-800 to-slate-900 p-3">
        <div className="text-base font-bold">{verdict}</div>
        <div className="text-xs text-slate-300">{govSeats} of {total} seats{govSeats >= Math.ceil((total * 2) / 3) ? ' · two-thirds supermajority' : govSeats > total / 2 ? ' · supermajority lost' : ''}</div>
      </div>
      <table className="mt-2 w-full text-xs">
        <thead className="text-[10px] uppercase text-slate-500"><tr><th className="text-left font-medium">Party</th><th className="text-right font-medium">Seats</th><th className="text-right font-medium">Vote</th><th className="text-right font-medium">vs 2025</th></tr></thead>
        <tbody>
          {Object.entries(result.votesByParty).sort((a, b) => (result.seatsByParty[b[0]] ?? 0) - (result.seatsByParty[a[0]] ?? 0) || b[1] - a[1]).map(([p, v]) => {
            const share = v / result.totalValid
            const prev = ge.parties[p]?.national
            const ncmp = result.ncmp.filter((n) => n.party === p).reduce((s, n) => s + n.seats, 0)
            return (
              <tr key={p} className="border-t border-slate-800/70">
                <td className="py-1"><PartyBadge party={partyMap[p]} small /> <span className="text-slate-300">{partyMap[p]?.name}</span></td>
                <td className="tabular text-right font-semibold">{result.seatsByParty[p] ?? 0}{ncmp ? <span className="font-normal text-slate-400"> +{ncmp}N</span> : ''}</td>
                <td className="tabular text-right">{pct(share)}</td>
                <td className={`tabular text-right ${prev === undefined ? 'text-slate-500' : share - prev >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{prev === undefined ? 'new' : `${share - prev >= 0 ? '+' : ''}${((share - prev) * 100).toFixed(1)}`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-slate-500">National vote shares compare against all valid votes nationwide (GE2025 PAP {pct(ge.parties.PAP.national)}).</p>
      {gains.length > 0 && (
        <div className="mt-2 text-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Changing hands</div>
          {gains.map(({ c, r }) => <div key={c.id}><PartyBadge party={partyMap[r.winner]} small /> {c.name} {c.type === 'GRC' ? `(${c.seats})` : ''}</div>)}
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
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3">
      <div className="flex items-center gap-3 rounded-full bg-slate-950/85 px-4 py-1.5 text-sm shadow-lg ring-1 ring-slate-700 backdrop-blur">
        <span className="tabular font-bold text-rose-400">{night.t < 0 ? '8:00 pm' : clock(night.t)}</span>
        {Object.entries(d.seats).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
          <span key={p} className="flex items-center gap-1"><PartyBadge party={partyMap[p]} small /><b className="tabular">{n}</b></span>
        ))}
        <span className="text-xs text-slate-400">{d.total - d.declared} to declare</span>
      </div>
      {called && (
        <div className="rounded-lg px-4 py-2 text-center text-sm font-extrabold uppercase tracking-wide shadow-xl" style={{ background: partyMap[leader[0]]?.color, color: '#fff' }}>
          {leader[0]} wins a majority — {leader[1]} seats declared
        </div>
      )}
    </div>
  )
}
