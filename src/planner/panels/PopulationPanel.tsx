import { Section, Stat, Button } from '../../components/ui'
import { YearBars, YearLine } from '../../components/HistoryCharts'
import { BASELINE, DEFAULT_POLICY, type PopulationPolicy } from '../data/demographics'
import { usePlanner } from '../state/planner'
import { usePlannerDerived } from '../state/derived'
import { atYear, PHASES } from '../model/population'
import { PolicySlider } from './common'
import { millions, thousands } from './format'

export const BAND_COLORS = ['#bae6fd', '#38bdf8', '#0369a1', '#f472b6']
export const BAND_NAMES = ['Under 5', '5–19', '20–64', '65+']

const SCENARIOS: { label: string; desc: string; policy: Partial<PopulationPolicy> }[] = [
  { label: 'Today\'s trends', desc: 'Fertility stays at 0.87, about 22,000 new residents a year', policy: { tfr: DEFAULT_POLICY.tfr, netMigration: DEFAULT_POLICY.netMigration, nonResidentGrowth: DEFAULT_POLICY.nonResidentGrowth } },
  { label: 'Baby boom', desc: 'Family policies lift fertility to 1.3', policy: { tfr: 1.3 } },
  { label: 'Open door', desc: '50,000 new residents a year, more foreign workers', policy: { netMigration: 50_000, nonResidentGrowth: 2 } },
  { label: 'Closed door', desc: '5,000 new residents a year, fewer foreign workers', policy: { netMigration: 5_000, nonResidentGrowth: -1 } },
]

export function PopulationPanel() {
  const policy = usePlanner((s) => s.policy)
  const setPolicy = usePlanner((s) => s.setPolicy)
  const { projection } = usePlannerDerived()
  const today = projection[0]
  const end = atYear(projection, 2050)
  const years = [2026, ...PHASES.map((p) => p.end)]
  const pops = years.map((y) => atYear(projection, y))
  return (
    <div>
      <Section title="Singapore today (end-June 2026)">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Total population" value={millions(BASELINE.total)} sub="residents and non-residents" />
          <Stat label="Citizens" value={millions(BASELINE.citizens)} sub={`+ ${millions(BASELINE.prs)} permanent residents`} />
          <Stat label="Non-residents" value={millions(BASELINE.nonResidents)} sub="work passes, students, dependants" />
          <Stat label="Median age" value={BASELINE.medianAge.toFixed(1)} sub={`${(BASELINE.seniorShare * 100).toFixed(1)}% of residents aged 65+`} />
          <Stat label="Fertility rate" value={BASELINE.tfr.toFixed(2)} sub="2025, preliminary; 2.1 replaces a generation" />
          <Stat label="Resident households" value={thousands(today.households)} sub={`about ${BASELINE.householdSize.toFixed(1)} people each`} />
        </div>
        <p className="mt-2 text-[10px] leading-snug text-slate-500">Population in Brief 2026 and Population Trends 2026 (SingStat / NPTD). Residents by age and region: SingStat, end-June 2026.</p>
      </Section>

      <Section title="Population policy">
        <div className="mb-2 flex flex-wrap gap-1">
          {SCENARIOS.map((s) => <Button key={s.label} onClick={() => setPolicy(s.policy)} title={s.desc}>{s.label}</Button>)}
        </div>
        <PolicySlider label="Fertility rate (births per woman)" value={policy.tfr} min={0.6} max={2.1} step={0.01} format={(v) => v.toFixed(2)} onChange={(tfr) => setPolicy({ tfr })}
          hint="Reached by 2031. Baby bonuses, housing priority and childcare can nudge it up." />
        <PolicySlider label="New residents a year (immigration, net)" value={policy.netMigration} min={0} max={80_000} step={1000} format={(v) => v.toLocaleString('en-SG')} onChange={(netMigration) => setPolicy({ netMigration })}
          hint="New citizens and permanent residents, minus those who leave. Mostly young adults." />
        <PolicySlider label="Non-resident growth a year" value={policy.nonResidentGrowth} min={-2} max={4} step={0.1} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`} onChange={(nonResidentGrowth) => setPolicy({ nonResidentGrowth })}
          hint="Foreign workers fill jobs, especially in construction and care. They live mostly in dormitories and rented homes." />
        <PolicySlider label="Life expectancy by 2050" value={policy.lifeExpectancy} min={83.5} max={92} step={0.5} format={(v) => `${v.toFixed(1)} yrs`} onChange={(lifeExpectancy) => setPolicy({ lifeExpectancy })} />
        <PolicySlider label="Development budget per 5-year phase" value={policy.budget} min={10} max={150} step={5} format={(v) => `S$${v}b`} onChange={(budget) => setPolicy({ budget })}
          hint="For building, reclaiming and acquiring land. Land sales go to the national reserves, not this budget." />
      </Section>

      <Section title="Projection to 2050">
        <YearBars
          bars={pops.map((p) => ({ label: String(p.year), values: p.bands, tip: `${p.year}: ${millions(p.residents)} residents, ${((p.bands[3] / p.residents) * 100).toFixed(0)}% aged 65+` }))}
          colors={BAND_COLORS} names={BAND_NAMES} height={120} fmt={(v) => millions(v, 1)} />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Stat label="Total in 2050" value={millions(end.total)} sub={`${millions(end.residents)} residents`} />
          <Stat label="Aged 65+ in 2050" value={`${((end.bands[3] / end.residents) * 100).toFixed(0)}%`} sub={`median age ${end.medianAge.toFixed(1)}`} />
          <Stat label="Households in 2050" value={thousands(end.households)} sub={`${end.households > today.households ? '+' : ''}${thousands(end.households - today.households)} homes needed`} />
          <Stat label="Births in 2050" value={thousands(end.births)} sub={`${thousands(end.deaths)} deaths`} />
        </div>
        <div className="mt-3 text-[11px] text-slate-400">Working-age residents (20–64) per senior</div>
        <YearLine points={pops.map((p) => ({ label: String(p.year), value: p.supportRatio, tip: `${p.year}: ${p.supportRatio.toFixed(2)} working-age per senior` }))}
          color="#f472b6" fmt={(v) => v.toFixed(1)} domain={[0, Math.ceil(today.supportRatio)]} />
        <p className="mt-2 text-[11px] leading-snug text-slate-400">A simple cohort model: residents age a year at a time, births follow the fertility rate, deaths follow life expectancy, and new residents arrive mostly aged 20–44. Households shrink slowly, so more homes are needed even if the population does not grow.</p>
      </Section>
    </div>
  )
}
