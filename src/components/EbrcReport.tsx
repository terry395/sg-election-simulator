import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { feature } from 'topojson-client'
import { ScrollText, X } from 'lucide-react'
import type { MultiPolygon, Polygon } from 'geojson'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { buildEbrcReport, COMMITTEE, type EbrcReport as Report, type Para } from '../model/ebrc'
import { fmtInt } from '../model/text'
import { BoundaryMapSvg } from './ebrc/BoundaryMapSvg'
import { outlines, projectLabels, toShape } from './ebrc/mapShapes'

const NOTICE = 'Simulation · Not an official document'
const DISCLAIMER = 'This is a mock report written automatically by the GE2030 Simulator from a map drawn by one of its users, for entertainment and learning. It is not an official document. It has not been issued, reviewed or endorsed by the Electoral Boundaries Review Committee, the Elections Department, the Prime Minister\'s Office or any other government body, and it does not represent any real-life polling, survey or official projection.'

const PAGES = [
  { id: 'ebrc-cover', label: 'Cover' },
  { id: 'ebrc-letter', label: 'Letter' },
  { id: 'ebrc-report', label: 'Report' },
  { id: 'ebrc-details', label: 'Recommendations' },
  { id: 'ebrc-annex-a', label: 'Annex A' },
  { id: 'ebrc-annex-b', label: 'Annex B' },
  { id: 'ebrc-annex-c', label: 'Annex C' },
]

/** Mock Electoral Boundaries Review Committee report for the current map, styled as a printed White Paper. View-only. */
export function EbrcReport() {
  const open = useStore((s) => s.ebrcOpen)
  if (!open) return null
  return <EbrcDialog />
}

function EbrcDialog() {
  const close = () => useStore.getState().setEbrcOpen(false)
  const plan = useStore((s) => s.plan)
  const data = useStore((s) => s.data)!
  const year = useStore((s) => s.year)
  const rules = useStore((s) => s.rules)
  const { stats, issues, districts, labels } = useDerived()
  const body = useRef<HTMLDivElement>(null)

  const report = useMemo(() => buildEbrcReport({ plan, stats, issues, rules, ge: data.ge, blocks: data.blocks, year, date: new Date() }), [plan, stats, issues, rules, data, year])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') useStore.getState().setEbrcOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const goTo = (id: string) => body.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95" role="dialog" aria-label="Mock EBRC report">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <ScrollText size={18} className="shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">Mock EBRC report</div>
          <div className="truncate text-[11px] text-slate-400">Generated from your map · for entertainment and learning · not an official document</div>
        </div>
        <select onChange={(e) => goTo(e.target.value)} defaultValue="" aria-label="Jump to a page"
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 phone:max-w-32">
          <option value="" disabled>Jump to…</option>
          {PAGES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button onClick={close} className="p-1 text-slate-400 hover:text-white" aria-label="Close report"><X size={20} /></button>
      </div>
      <div ref={body} className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="ebrc-doc mx-auto flex max-w-[820px] flex-col gap-6 px-3 py-6 phone:gap-4 phone:px-2 phone:py-3">
          <Document r={report} districts={districts} labels={labels} />
        </div>
        <div className="ebrc-print-note">The mock EBRC report is view-only and cannot be printed. {DISCLAIMER}</div>
      </div>
    </div>
  )
}

function Document({ r, districts, labels }: { r: Report; districts: ReturnType<typeof useDerived>['districts']; labels: ReturnType<typeof useDerived>['labels'] }) {
  const data = useStore((s) => s.data)!
  const plan = useStore((s) => s.plan)
  const numbers = useMemo(() => Object.fromEntries(r.annexA.map((a, i) => [a.id, i + 1])), [r.annexA])
  const map = useMemo(() => {
    const grc = new Set(plan.constituencies.filter((c) => c.type === 'GRC').map((c) => c.id))
    const shapes = districts.features.map((f) => toShape(f.properties.id, f.geometry as MultiPolygon | Polygon, grc.has(f.properties.id)))
    const old = r.changed ? outlines(feature(data.topo, data.topo.objects.ge2025)) : undefined
    return { shapes, old, labels: projectLabels(labels, numbers) }
  }, [districts, labels, numbers, plan.constituencies, data, r.changed])

  const [intro, terms, electors, considerations, recs, details, closing] = r.sections
  let page = 0
  const next = () => ++page

  return (
    <>
      {/* ---------------------------------------------------------------- cover */}
      <Page id="ebrc-cover" n={next()} cover>
        <div className="flex min-h-[880px] flex-col items-center text-center phone:min-h-[560px]">
          <div className="mt-6 text-[13px] tracking-[0.3em]">SIMULATED · GE2030</div>
          <div className="mt-24 phone:mt-14">
            <div className="text-[13px] tracking-[0.25em]">REPORT OF THE</div>
            <h1 className="mx-auto mt-3 max-w-md text-[30px] font-bold leading-tight tracking-wide phone:text-[22px]">ELECTORAL BOUNDARIES REVIEW COMMITTEE</h1>
            <div className="mx-auto my-8 h-px w-24 bg-black" />
            <p className="text-[15px] italic">for the next General Election</p>
          </div>
          <div className="mt-auto space-y-6 pb-4">
            <p className="text-[14px]">Presented to Parliament by Command of<br />The President of the Republic of Singapore</p>
            <p className="text-[13px] tracking-wider">[ SIMULATED PAPER · NOT PRESENTED TO PARLIAMENT ]</p>
            <p className="text-[13px]">Generated on {r.dateText}</p>
            <p className="mx-auto max-w-lg border border-black px-4 py-3 text-left text-[11.5px] leading-snug">{DISCLAIMER}</p>
          </div>
        </div>
      </Page>

      {/* ---------------------------------------------------------------- letter */}
      <Page id="ebrc-letter" n={next()}>
        <div className="text-right text-[14px]">{r.dateText}</div>
        <p className="mt-8">Prime Minister<br />Republic of Singapore</p>
        <p className="mt-6">Dear Prime Minister,</p>
        <p className="mt-4 text-center font-bold">REPORT OF THE ELECTORAL BOUNDARIES REVIEW COMMITTEE</p>
        <ol className="ebrc-paras mt-4">
          {r.letter.map((t, i) => <li key={i}><span className="ebrc-num">{i + 1}.</span><span>{t}</span></li>)}
        </ol>
        <p className="mt-8">Yours sincerely,</p>
        <div className="mt-10 w-56 border-t border-dotted border-black pt-1 text-[13px]">Chairman<br />Electoral Boundaries Review Committee</div>
        <div className="mt-8 text-[13px]">
          <div className="font-bold">Members</div>
          <ul className="mt-1 space-y-0.5">{COMMITTEE.slice(1).map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      </Page>

      {/* ---------------------------------------------------------------- report body */}
      <Page id="ebrc-report" n={next()}>
        <h2 className="ebrc-title">REPORT OF THE ELECTORAL BOUNDARIES REVIEW COMMITTEE</h2>
        {[intro, terms, electors, considerations].map((s) => <Section key={s.id} s={s} />)}
      </Page>
      <Page id="ebrc-recs" n={next()}>
        <Section s={recs} />
        <table className="ebrc-table mx-auto mt-2 w-full max-w-md">
          <thead><tr><th className="text-left">Type of division</th><th>Number</th><th>MPs</th></tr></thead>
          <tbody>
            {r.sizes.map((s) => <tr key={s.label}><td className="text-left">{s.label}</td><td>{s.count}</td><td>{s.mps}</td></tr>)}
            <tr className="font-bold"><td className="text-left">Total</td><td>{r.sizes.reduce((n, s) => n + s.count, 0)}</td><td>{r.totalMps}</td></tr>
          </tbody>
        </table>
        {r.caveats.map((c) => <p key={c} className="mt-4 border border-black p-2 text-[13px]"><b>Note.</b> {c}</p>)}
      </Page>
      <Page id="ebrc-details" n={next()}>
        <Section s={details} />
        <Section s={closing} />
        <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 text-[12.5px] phone:grid-cols-1">
          {COMMITTEE.map((m) => (
            <div key={m}><div className="mb-1 h-6 border-b border-dotted border-black" />{m}</div>
          ))}
        </div>
        <p className="mt-6 text-[13px]">{r.dateText}</p>
      </Page>

      {/* ---------------------------------------------------------------- annex A */}
      <Page id="ebrc-annex-a" n={next()}>
        <AnnexHead letter="A" title={`Electoral divisions and number of electors (${r.registerLabel})`} />
        <div className="overflow-x-auto">
          <table className="ebrc-table w-full">
            <thead>
              <tr><th>No.</th><th className="text-left">Electoral division</th><th>MPs</th><th>Electors</th><th>Electors per MP</th><th>± average</th></tr>
            </thead>
            <tbody>
              {r.annexA.map((a, i) => (
                <tr key={a.id}>
                  <td>{i + 1}</td>
                  <td className="text-left">{a.name}{a.status === 'new' ? ' *' : ''}</td>
                  <td>{a.seats}</td>
                  <td>{fmtInt(a.electors)}</td>
                  <td>{fmtInt(a.perMp)}</td>
                  <td>{a.deviation >= 0 ? '+' : '−'}{Math.abs(a.deviation * 100).toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="font-bold"><td /><td className="text-left">Total</td><td>{r.totalMps}</td><td>{fmtInt(r.totalElectors)}</td><td>{fmtInt(r.quota)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px]">* New electoral division. “± average” is the difference from the national average of {fmtInt(r.quota)} electors per Member of Parliament.</p>
      </Page>

      {/* ---------------------------------------------------------------- annex B */}
      <Page id="ebrc-annex-b" n={next()}>
        <AnnexHead letter="B" title="Maps of the recommended electoral divisions" />
        <div className="border border-black">
          <BoundaryMapSvg shapes={map.shapes} labels={map.labels} old={map.old} title="Map of all electoral divisions" />
        </div>
        <MapKey changed={r.changed} />
        <ol className="mt-3 columns-2 gap-6 text-[12px] phone:columns-1">
          {r.annexA.map((a, i) => <li key={a.id}>{i + 1}. {a.name}</li>)}
        </ol>
      </Page>
      {r.regions.filter((g) => g.changed).map((g) => (
        <Page key={g.region} id={`ebrc-annex-b-${g.region}`} n={next()}>
          <AnnexHead letter="B" title={`${g.region} Region`} />
          <div className="border border-black">
            <BoundaryMapSvg shapes={map.shapes} labels={map.labels} old={map.old} focus={g.ids} title={`Map of the ${g.region} Region`} />
          </div>
          <MapKey changed={r.changed} />
        </Page>
      ))}

      {/* ---------------------------------------------------------------- annex C */}
      <Page id="ebrc-annex-c" n={next()}>
        <AnnexHead letter="C" title="Changes to the electoral divisions of the 2025 General Election" />
        {r.annexC.length ? (
          <div className="overflow-x-auto">
            <table className="ebrc-table w-full">
              <thead><tr><th className="text-left">2025 electoral division</th><th>MPs</th><th className="text-left">Recommendation</th></tr></thead>
              <tbody>{r.annexC.map((c) => <tr key={c.name}><td className="text-left">{c.name}</td><td>{c.seats}</td><td className="text-left">{c.outcome}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p>The Committee recommends no change to the electoral divisions of the 2025 General Election.</p>}
        <p className="mx-auto mt-10 max-w-lg border border-black px-4 py-3 text-[11.5px] leading-snug">{DISCLAIMER}</p>
      </Page>
    </>
  )
}

function Page({ id, n, cover, children }: { id: string; n: number; cover?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="ebrc-page scroll-mt-3">
      <div className="ebrc-running" aria-hidden>{NOTICE}</div>
      {children}
      {!cover && <div className="ebrc-folio">— {n} —</div>}
    </section>
  )
}

function Section({ s }: { s: Report['sections'][number] }) {
  return (
    <div className="mt-6">
      <h3 className="ebrc-heading">{s.title}</h3>
      {s.blocks.map((b, i) => (
        <div key={i}>
          {b.heading && <h4 className="ebrc-subheading">{b.heading}</h4>}
          <ol className="ebrc-paras">{b.paras.map((p) => <Paragraph key={p.n} p={p} />)}</ol>
        </div>
      ))}
    </div>
  )
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
function Paragraph({ p }: { p: Para }) {
  return (
    <li>
      <span className="ebrc-num">{p.n}.</span>
      <div>
        <span>{p.text}</span>
        {p.items && (
          <ol className="ebrc-items">
            {p.items.map((it, i) => <li key={i}><span className="ebrc-num">({LETTERS[i]})</span><span>{it}</span></li>)}
          </ol>
        )}
      </div>
    </li>
  )
}

function AnnexHead({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="mb-4 text-center">
      <div className="text-right text-[13px] font-bold">ANNEX {letter}</div>
      <h3 className="ebrc-heading mt-2">{title}</h3>
    </div>
  )
}

function MapKey({ changed }: { changed: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
      <span className="inline-flex items-center gap-1.5"><span className="ebrc-swatch ebrc-swatch-grc" /> Group Representation Constituency</span>
      <span className="inline-flex items-center gap-1.5"><span className="ebrc-swatch" /> Single Member Constituency</span>
      {changed && <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed border-[#8a1c1c]" /> 2025 boundary</span>}
    </div>
  )
}
