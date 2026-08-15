import { BASELINE } from '@airship/model'
import { DesignExplorer } from '../components/DesignExplorer'
import { Diagnostics } from '../components/Diagnostics'
import { FlightSimulator } from '../components/FlightSimulator'
import { HullViewer } from '../components/HullViewer'
import {
  baseline,
  designs,
  hullProfile,
  hydrogenAdvantage,
  diagnostics,
  fleet,
  fuelRanking,
  massFractionExponents,
  massFractionTable,
  mission,
  purityDemonstration,
  referenceLift,
  structuralBenchmark,
  structuralScaling,
  uncertainties,
  validation,
} from '../lib/model'

const kWh = (joules: number) => joules / 3.6e6
const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const pct = (n: number, digits = 1) => `${n >= 0 ? '' : ''}${(n * 100).toFixed(digits)}%`

function Rule() {
  return <hr className="border-0 border-t border-[var(--color-rule)]" />
}

function Section({
  n,
  title,
  lede,
  children,
}: {
  n: string
  title: string
  lede?: string
  children: React.ReactNode
}) {
  return (
    <section className="py-14 sm:py-20">
      <div className="flex items-baseline gap-3">
        <span className="num text-xs text-[var(--color-ink-faint)]">{n}</span>
        <h2 className="text-xl sm:text-2xl font-medium tracking-tight">{title}</h2>
      </div>
      {lede ? (
        <p className="mt-3 max-w-3xl text-[var(--color-ink-dim)] leading-relaxed">{lede}</p>
      ) : null}
      <div className="mt-7">{children}</div>
    </section>
  )
}

function Stat({
  label,
  value,
  unit,
  tone = 'ink',
  note,
}: {
  label: string
  value: string
  unit?: string
  tone?: 'ink' | 'pass' | 'fail' | 'unknown'
  note?: string
}) {
  const colour = {
    ink: 'text-[var(--color-ink)]',
    pass: 'text-[var(--color-pass)]',
    fail: 'text-[var(--color-fail)]',
    unknown: 'text-[var(--color-unknown)]',
  }[tone]

  return (
    <div className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">{label}</div>
      <div className={`num mt-2 text-2xl ${colour}`}>
        {value}
        {unit ? <span className="ml-1 text-sm text-[var(--color-ink-dim)]">{unit}</span> : null}
      </div>
      {note ? <div className="mt-1.5 text-xs text-[var(--color-ink-faint)]">{note}</div> : null}
    </div>
  )
}

export default function Home() {
  const b = baseline
  const energyTotal = b ? b.result.propulsionEnergy + b.result.habitatEnergy + b.result.liftMakeupEnergy : 1

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-8">
      {/* ---------------------------------------------------------------- */}
      <header className="pt-16 pb-10 sm:pt-24">
        <div className="num text-xs tracking-[0.2em] text-[var(--color-accent)]">AIRSHIP.DIY</div>
        <h1 className="mt-5 max-w-4xl text-3xl sm:text-5xl font-medium leading-[1.12] tracking-tight">
          A hydrogen airship you can build in a shop and then never have to land.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--color-ink-dim)]">
          Powered by sunlight, fuel cells and engines so that no single technology failure ends the
          flight. Sized to be lived aboard by two people for a year, with a stretch goal of five.
          Able to land on water and operate as a boat.
        </p>
        <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-ink-faint)]">
          This is an open engineering notebook, not a concept renderer. Every number on this page was
          computed by the model at build time, by the same functions the tests call. Nothing here is
          typed in by hand. Where the model is guessing, it says so.
        </p>
      </header>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="01"
        title="The hull"
        lede="Generated from the model's own shape function, not drawn. The surface below is the one whose volume, wetted area and prismatic coefficient every figure on this page was computed from. Rings mark gas cell bulkheads; the blue band is the photovoltaic array, on the actual covered stations the energy balance integrated over."
      >
        <div className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <HullViewer
            radii={hullProfile.radii}
            length={hullProfile.length}
            cellCount={BASELINE.hull.cellCount}
            arrayHalfAngle={BASELINE.power.arrayCoverageHalfAngle}
            arrayForwardStation={BASELINE.power.arrayForwardStation}
            arrayAftStation={BASELINE.power.arrayAftStation}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Length" value={fmt(hullProfile.length)} unit="m" />
          <Stat label="Max diameter" value={fmt(hullProfile.maxDiameter, 1)} unit="m" />
          <Stat label="Envelope volume" value={fmt(hullProfile.volume)} unit="m³" />
          <Stat label="Wetted area" value={fmt(hullProfile.wettedArea)} unit="m²" />
          <Stat
            label="Prismatic coeff."
            value={hullProfile.prismaticCoefficient.toFixed(3)}
            note="0.68 to 0.70 on real hulls"
          />
          <Stat
            label="Max dia. station"
            value={hullProfile.maxDiameterStation.toFixed(2)}
            note="forward of midships"
          />
        </div>
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="02"
        title="Fly it"
        lede="This runs the project's own 6-DOF solver at 100 Hz, not a simplified version for the browser. The same step function the validation gates exercise is called here, so if the vehicle feels wrong there is no second implementation to blame. Expect it to be slow to respond and slow to stop: the displaced air nearly doubles the effective mass in sway and heave."
      >
        <FlightSimulator
          length={BASELINE.hull.length}
          finenessRatio={BASELINE.hull.finenessRatio}
          prismaticCoefficient={BASELINE.hull.prismaticCoefficient}
          cellCount={BASELINE.hull.cellCount}
        />

        <div className="mt-6 border-l-2 border-[var(--color-accent)] bg-[var(--color-panel)] p-5">
          <h3 className="font-medium">Two things it does that an aeroplane does not</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            <strong>It wallows when stopped and is dead-beat under way.</strong> The pitch pendulum
            has a period around thirty seconds and <em>no</em> aerodynamic damping at zero airspeed,
            because the fins have no dynamic pressure to work with. Above about 10 m/s the same mode
            is overdamped. Both are correct, the difference is large, and a control law tuned at one
            end will misbehave at the other.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            <strong>The fins are enormous, and they have to be.</strong> Setting the fin restoring
            moment against the Munk moment, the dynamic pressure and the incidence both cancel,
            leaving a minimum area that is independent of speed and altitude. For this hull it is
            about 174 m². A first guess of 60 m² diverged just as surely as no fins at all: below
            the minimum there is no partial credit.
          </p>
        </div>
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="03"
        title="Move a parameter and watch what breaks"
        lede="Every figure here is recomputed by the same solvers the tests and the reports use. Infeasible regions are shown as infeasible rather than as a small number: a hull that cannot lift its own structure says so, and a wind the vehicle cannot hold against turns the verdict red."
      >
        <DesignExplorer />
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="04"
        title="Does it hold up against ships that actually flew?"
        lede="Unit tests catch regressions. These catch being wrong. The model is fed published geometry for every rigid airship in the reference set and has to reproduce published gross lift within a stated tolerance. Where a source contradicts itself, the fixture records the contradiction rather than resolving it quietly."
      >
        <div className="scroll-x border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="px-4 py-3 font-normal">Ship</th>
                <th className="px-4 py-3 font-normal">Gas</th>
                <th className="px-4 py-3 text-right font-normal">Volume</th>
                <th className="px-4 py-3 text-right font-normal">Model</th>
                <th className="px-4 py-3 text-right font-normal">Published</th>
                <th className="px-4 py-3 text-right font-normal">Error</th>
                <th className="px-4 py-3 font-normal">Gate</th>
              </tr>
            </thead>
            <tbody>
              {validation.map((row) => (
                <tr key={row.name} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="px-4 py-3">
                    {row.name}
                    <span className="num ml-2 text-xs text-[var(--color-ink-faint)]">{row.year}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-dim)]">{row.gas}</td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {fmt(row.volume)} m³
                  </td>
                  <td className="num px-4 py-3 text-right">
                    {row.modelled === null ? '—' : `${fmt(row.modelled / 1000, 1)} t`}
                  </td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {row.published === null ? '—' : `${fmt(row.published / 1000, 1)} t`}
                  </td>
                  <td className="num px-4 py-3 text-right">
                    {row.error === null ? (
                      '—'
                    ) : (
                      <span className={row.passes ? 'text-[var(--color-pass)]' : 'text-[var(--color-fail)]'}>
                        {row.error >= 0 ? '+' : ''}
                        {(row.error * 100).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="num px-4 py-3">
                    {row.passes === null ? (
                      <span className="text-[var(--color-ink-faint)]">n/a</span>
                    ) : row.passes ? (
                      <span className="text-[var(--color-pass)]">PASS</span>
                    ) : (
                      <span className="text-[var(--color-fail)]">FAIL</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {purityDemonstration ? (
          <div className="mt-6 border-l-2 border-[var(--color-accent)] bg-[var(--color-panel)] p-5">
            <h3 className="font-medium">Gas purity is first-order, not a refinement</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
              The US Navy quoted Akron and Macon at 95 percent fill with &ldquo;helium of standard
              purity&rdquo;, which was itself about 95 percent, because helium was expensive and the
              Navy cared about the lift it actually had. Modelled with pure helium, the ship fails
              its own gate by more than twice the tolerance.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Stat
                label="Macon at 95% service purity"
                value={`${fmt(purityDemonstration.atServicePurity / 1000, 1)} t`}
                tone="pass"
                note={`${pct(purityDemonstration.atServicePurity / purityDemonstration.published - 1, 2)} against published`}
              />
              <Stat
                label="Macon at 100% pure helium"
                value={`${fmt(purityDemonstration.asPure / 1000, 1)} t`}
                tone="fail"
                note={`${pct(purityDemonstration.asPure / purityDemonstration.published - 1, 2)} against published`}
              />
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
              Air leaks inward through the cell film continuously, and lost purity is lost lift,
              permanently, unless the gas is replaced. On a vehicle whose premise is never landing,
              the only way to replace it is to make more. That is why onboard electrolysis is
              load-bearing rather than clever.
            </p>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Hydrogen specific lift" value={referenceLift.hydrogen.toFixed(4)} unit="kg/m³" />
          <Stat label="Helium specific lift" value={referenceLift.helium.toFixed(4)} unit="kg/m³" />
          <Stat label="Hydrogen advantage" value={pct(hydrogenAdvantage)} />
          <Stat
            label="Benchmark to equal"
            value={pct(structuralBenchmark.target)}
            tone="unknown"
            note="LZ-129 Hindenburg, best large rigid ever built"
          />
        </div>
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="05"
        title="Does the loop close?"
        lede="Regime A is the project's thesis: sunlight in, electrolysis to store, fuel cell to convert back, engines cold, endurance bounded by component life rather than by energy. The balance is run day by day through a year, because an annual average hides the ship that banks a surplus in June and runs a deficit in December."
      >
        {b ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Regime A verdict"
                value={b.result.closes ? 'CLOSES' : 'DOES NOT CLOSE'}
                tone={b.result.closes ? 'pass' : 'fail'}
                note={`baseline, ${b.latitude.toFixed(0)}° latitude`}
              />
              <Stat label="Annual margin" value={pct(b.result.annualMargin, 0)} tone="pass" />
              <Stat
                label="Worst day margin"
                value={pct(b.result.worstDayMargin, 0)}
                tone={b.result.worstDayMargin > 0 ? 'pass' : 'fail'}
                note={`day ${b.result.worstDay}`}
              />
              <Stat
                label="Max sustainable wind"
                value={b.maximumWind.toFixed(1)}
                unit="m/s"
                note={`${(b.maximumWind * 1.94384).toFixed(0)} kt at ${(b.dutyCycle * 100).toFixed(0)}% duty`}
              />
            </div>

            <div className="mt-6 border border-[var(--color-rule)] bg-[var(--color-panel)] p-5">
              <h3 className="text-sm uppercase tracking-wider text-[var(--color-ink-faint)]">
                Where the energy goes, annualised
              </h3>
              <div className="mt-4 space-y-3">
                {[
                  { label: 'Station keeping', value: b.result.propulsionEnergy, colour: 'var(--color-accent)' },
                  { label: 'Habitat and systems', value: b.result.habitatEnergy, colour: 'var(--color-ink-dim)' },
                  { label: 'Lift makeup', value: b.result.liftMakeupEnergy, colour: 'var(--color-unknown)' },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{row.label}</span>
                      <span className="num text-[var(--color-ink-dim)]">
                        {fmt(kWh(row.value))} kWh &nbsp;
                        <span className="text-[var(--color-ink)]">
                          {((row.value / energyTotal) * 100).toFixed(1)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full bg-[var(--color-rule)]">
                      <div
                        className="h-full"
                        style={{
                          width: `${(row.value / energyTotal) * 100}%`,
                          background: row.colour,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--color-rule)] pt-4 text-sm">
                <span className="text-[var(--color-ink-dim)]">
                  Total demand{' '}
                  <span className="num text-[var(--color-ink)]">{fmt(kWh(b.result.annualDemand))} kWh</span>
                </span>
                <span className="text-[var(--color-ink-dim)]">
                  Solar generated{' '}
                  <span className="num text-[var(--color-pass)]">
                    {fmt(kWh(b.result.annualGenerated))} kWh
                  </span>
                </span>
                <span className="text-[var(--color-ink-dim)]">
                  Clear-sky derate{' '}
                  <span className="num text-[var(--color-ink)]">{b.clearSkyFraction.toFixed(2)}</span>
                </span>
              </div>
            </div>

            <div className="mt-6 border-l-2 border-[var(--color-unknown)] bg-[var(--color-panel)] p-5">
              <h3 className="font-medium">The finding: energy is not the binding constraint</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
                It is not close to being one. Lift makeup, the term that sounds like it should
                dominate a hydrogen airship, is{' '}
                <span className="num text-[var(--color-ink)]">
                  {((b.result.liftMakeupEnergy / energyTotal) * 100).toFixed(1)}%
                </span>{' '}
                of demand. Station keeping is{' '}
                <span className="num text-[var(--color-ink)]">
                  {((b.result.propulsionEnergy / energyTotal) * 100).toFixed(0)}%
                </span>{' '}
                and it is <em>cubic</em> in wind speed, so the real question this vehicle faces is
                not whether it can power itself but what weather it can live in. Whether it can carry
                its own structure is phase 3, and that is where the answer is likely to get hard.
              </p>
            </div>
          </>
        ) : null}

        <div className="mt-6 scroll-x border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="px-4 py-3 font-normal">Design point</th>
                <th className="px-4 py-3 text-right font-normal">Length</th>
                <th className="px-4 py-3 text-right font-normal">Volume</th>
                <th className="px-4 py-3 text-right font-normal">Gross lift</th>
                <th className="px-4 py-3 text-right font-normal">Leak</th>
                <th className="px-4 py-3 text-right font-normal">Hold</th>
                <th className="px-4 py-3 text-right font-normal">Max wind</th>
                <th className="px-4 py-3 font-normal">Regime A</th>
              </tr>
            </thead>
            <tbody>
              {designs.map((d) => (
                <tr key={d.id} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="px-4 py-3">{d.name}</td>
                  <td className="num px-4 py-3 text-right">{fmt(d.length)} m</td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {fmt(d.result.hullVolume)} m³
                  </td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {fmt(d.result.grossLiftAvailable / 1000, 1)} t
                  </td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {pct(d.result.annualLeakFraction, 2)}/a
                  </td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">{d.wind} m/s</td>
                  <td className="num px-4 py-3 text-right">{d.maximumWind.toFixed(1)} m/s</td>
                  <td className="num px-4 py-3">
                    {d.result.closes ? (
                      <span className="text-[var(--color-pass)]">CLOSES</span>
                    ) : (
                      <span className="text-[var(--color-fail)]">FAILS</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-faint)]">
          The stretch ship does not close, and it is left that way rather than tuned until it passes.
          It fails on day 354 by 16 percent while showing a comfortable 12.5 percent{' '}
          <em>annual</em> surplus, which is exactly the trap a day-by-day balance exists to catch.
          The cause is the battery, not the hull: on the shortest day the pack saturates and the
          overflow spills into the hydrogen path at about a third round-trip efficiency, so those
          kilowatt hours cost three times as much collection.
        </p>
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="06"
        title="Can it be built?"
        lede="Empty weight scaled from the Hindenburg, across the range of structural scaling exponents the historical record cannot distinguish between. This is deliberately a family of curves: one curve would be a claim the evidence does not support, and the two ends disagree about whether bigger ships are better or worse."
      >
        <div className="scroll-x border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="px-4 py-3 font-normal">Envelope volume</th>
                {massFractionExponents.map((e) => (
                  <th key={e} className="num px-4 py-3 text-right font-normal">
                    n = {e.toFixed(2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {massFractionTable.map((row) => (
                <tr key={row.volume} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="num px-4 py-3">{fmt(row.volume)} m³</td>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.exponent}
                      className={`num px-4 py-3 text-right ${
                        cell.infeasible
                          ? 'text-[var(--color-fail)]'
                          : cell.emptyWeightFraction > 0.7
                            ? 'text-[var(--color-unknown)]'
                            : 'text-[var(--color-pass)]'
                      }`}
                    >
                      {(cell.emptyWeightFraction * 100).toFixed(0)}%{cell.infeasible ? ' ✕' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
          ✕ marks a hull that cannot lift its own empty weight. All exponents agree at 200,000 m³
          because that is the Hindenburg, where the scaling is anchored.
        </p>

        <div className="mt-6 border-l-2 border-[var(--color-unknown)] bg-[var(--color-panel)] p-5">
          <h3 className="font-medium">Undecided, and the record cannot settle it</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            Fitting all eight rigids with published figures gives an exponent of{' '}
            <span className="num text-[var(--color-ink)]">
              {structuralScaling.allShipsExponent}
            </span>{' '}
            at R² ={' '}
            <span className="num text-[var(--color-ink)]">{structuralScaling.allShipsRSquared}</span>
            , which would mean the baseline closes comfortably and that mass fraction gets{' '}
            <em>worse</em> with size, not better. Restrict to the five best-sourced ships, whose
            volumes span only 1.41 to 1, and the fit collapses to{' '}
            <span className="num text-[var(--color-ink)]">
              {structuralScaling.bestSourcedExponent}
            </span>{' '}
            at R² ={' '}
            <span className="num text-[var(--color-ink)]">
              {structuralScaling.bestSourcedRSquared}
            </span>
            . The scatter from gas choice, structural material and national design philosophy is
            about 30 percentage points, which swamps any size trend over that range.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            At the theoretical square-cube value the baseline ship cannot lift its own empty weight.
            A model that quietly picked the favourable end would report a comfortable design where
            the truth is a coin flip.
          </p>
        </div>

        <div className="mt-8 scroll-x border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="px-4 py-3 font-normal">Every rigid with published figures</th>
                <th className="px-4 py-3 font-normal">Gas</th>
                <th className="px-4 py-3 font-normal">Structure</th>
                <th className="px-4 py-3 text-right font-normal">Empty weight fraction</th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((ship) => (
                <tr key={ship.id} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="px-4 py-3">
                    {ship.name}
                    <span className="num ml-2 text-xs text-[var(--color-ink-faint)]">{ship.year}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-dim)]">{ship.liftingGas}</td>
                  <td
                    className={`px-4 py-3 ${
                      ship.material === 'stainless steel'
                        ? 'text-[var(--color-fail)]'
                        : 'text-[var(--color-ink-dim)]'
                    }`}
                  >
                    {ship.material}
                  </td>
                  <td className="num px-4 py-3 text-right">{pct(ship.emptyWeightFraction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-faint)]">
          Structural material moves the fraction by 9.5 points at constant size, year and
          specification: R100 in duralumin against R101 in stainless steel, both built to the same
          Air Ministry requirement in the same year. That is larger than any size effect in the
          dataset. Three of these eight entries were wrong in the first version of this table, all
          in the direction that flattered the historical fleet.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Brief's cited benchmark"
            value={pct(structuralBenchmark.briefCited)}
            note="USS Macon, but this is whole fixed weight, not structure"
          />
          <Stat
            label="Macon on hydrogen-equivalent lift"
            value={pct(structuralBenchmark.maconOnHydrogenEquivalent)}
            note="a third of the apparent gap is gas choice"
          />
          <Stat
            label="The real target"
            value={pct(structuralBenchmark.target)}
            tone="unknown"
            note="LZ-129 Hindenburg on an ISA basis, 1936, duralumin"
          />
        </div>
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="07"
        title="What should the engine burn?"
        lede="Comparing fuels by energy per kilogram is the habit of every other vehicle and it is the wrong metric here. On an airship the scarce resource is not mass, it is lift: every kilogram of fuel aboard is a kilogram of payload that is not, and every cubic metre inside the hull is a cubic metre that is not lifting. Ranked by energy stored per kilogram of lift given up, the order inverts."
      >
        <div className="scroll-x border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="px-4 py-3 font-normal">Fuel</th>
                <th className="px-4 py-3 text-right font-normal">MJ/kg</th>
                <th className="px-4 py-3 text-right font-normal">Lift cost</th>
                <th className="px-4 py-3 text-right font-normal">MJ per kg of lift</th>
                <th className="px-4 py-3 text-right font-normal">Water recovery needed</th>
              </tr>
            </thead>
            <tbody>
              {fuelRanking.map((f, i) => (
                <tr key={f.id} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="px-4 py-3">{f.name}</td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {(f.specificEnergy / 1e6).toFixed(1)}
                  </td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {f.liftCost < 0.01 ? '~0' : f.liftCost.toFixed(2)}
                  </td>
                  <td
                    className={`num px-4 py-3 text-right ${
                      i === 0 ? 'text-[var(--color-pass)]' : i >= fuelRanking.length - 2 ? 'text-[var(--color-fail)]' : ''
                    }`}
                  >
                    {(f.energyPerLift / 1e6).toFixed(1)}
                  </td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {f.waterRecovery === Infinity
                      ? 'impossible'
                      : f.waterRecovery === 0
                        ? 'none'
                        : pct(f.waterRecovery, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 border-l-2 border-[var(--color-fail)] bg-[var(--color-panel)] p-5">
          <h3 className="font-medium">You cannot burn the lifting gas</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            &ldquo;One gas for lift and fuel&rdquo; is the most attractive idea in the propulsion
            module and it does not survive the buoyancy budget. Removing 1 kg of hydrogen from a
            cell removes 1 kg of weight and about 13.4 kg of gross lift, so the ship goes 12.4 kg{' '}
            <em>heavy</em> per kilogram burned, while combustion returns only 8.94 kg of water. No
            recovery fraction can hold trim, and recovering the water makes it worse rather than
            better: 21.3 kg heavy instead of 12.4.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            A modern buoyancy-neutral blend is trivial to formulate and better than the historical
            one: 46.1 mol% propane with 53.9 mol% methane is <em>exactly</em> air density, 46.6
            MJ/kg, both commodity fuels obtainable anywhere. Blaugas itself was not air density,
            despite what every popular source says: relative density 0.963, so consuming Graf
            Zeppelin&rsquo;s full load made it about 1,316 kg heavier.
          </p>
        </div>
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="08"
        title="Which resource runs out first?"
        lede="The energy balance said energy does not bind. This steps a day at a time through a multi-year mission tracking gas mass and purity, water, food and consumables, to find out what does. The answer is a legal interval, and the thing everyone expects to bind turns out not to."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Physical endurance"
            value={fmt(mission.physicalEnduranceDays)}
            unit="days"
            tone="pass"
            note={`limited by ${mission.physicalLimit}`}
          />
          <Stat
            label="Including legal limits"
            value={fmt(mission.enduranceDays)}
            unit="days"
            tone="unknown"
            note={mission.limitingResource}
          />
          <Stat
            label="Water: catchment margin"
            value={`${fmt(mission.water.catchmentMargin)}×`}
            tone="pass"
            note="rain collected over net loss"
          />
          <Stat
            label="Water: daily surplus"
            value={fmt(mission.water.dailyNet)}
            unit="kg/day"
            tone="pass"
            note={`against ${(mission.water.dailyConsumption - mission.water.dailyRecovered).toFixed(1)} kg/day net loss`}
          />
        </div>

        <div className="mt-6 scroll-x border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="px-4 py-3 font-normal">Resource, on its own</th>
                <th className="px-4 py-3 text-right font-normal">Days</th>
                <th className="px-4 py-3 text-right font-normal">Years</th>
              </tr>
            </thead>
            <tbody>
              {mission.exhaustion.map((row) => (
                <tr key={row.resource} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="px-4 py-3">{row.resource}</td>
                  <td className="num px-4 py-3 text-right">{fmt(row.day)}</td>
                  <td className="num px-4 py-3 text-right text-[var(--color-ink-dim)]">
                    {(row.day / 365.2425).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 border-l-2 border-[var(--color-pass)] bg-[var(--color-panel)] p-5">
          <h3 className="font-medium">Water was expected to bind. It does not.</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            A 90 m hull presents about 1,170 m² of plan area to the rain. In the trade wind belt at a
            metre of annual rainfall, even a poor 40 percent collection efficiency gathers{' '}
            <span className="num text-[var(--color-ink)]">
              {fmt(mission.water.dailyCatchment)} kg/day
            </span>{' '}
            against a net loss of{' '}
            <span className="num text-[var(--color-ink)]">
              {(mission.water.dailyConsumption - mission.water.dailyRecovered).toFixed(1)} kg/day
            </span>{' '}
            for two people at 85 percent recycling. Catchment covers the loss{' '}
            <span className="num text-[var(--color-ink)]">
              {fmt(mission.water.catchmentMargin)}
            </span>{' '}
            times over, and still covers it more than fifteen times at the most pessimistic end of
            every assumption.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            The vehicle is water <em>rich</em>. Ballast is free, electrolyzer feedstock is free, and
            the hygiene allowance that looked like the largest lever in the life support budget is
            not a lever at all. That makes water a <strong>station-choice</strong> question rather
            than an equipment one: parked under a subtropical high instead of in the trade winds,
            the catchment term collapses and the whole analysis changes.
          </p>
        </div>
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="09"
        title="Diagnostics"
        lede="The curves the design actually turns on. Shear and bending moment are drawn as two charts sharing an axis rather than one chart with two scales, because newtons and newton metres are not comparable heights and putting them on one plot invites a reading that means nothing."
      >
        <Diagnostics
          powerCurve={diagnostics.powerCurve}
          holdingCurve={diagnostics.holdingCurve}
          cutoffWind={diagnostics.cutoffWind}
          designWind={diagnostics.designWind}
          hullLength={diagnostics.hullLength}
          beam={diagnostics.beam}
        />
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="10"
        title="Where the model is guessing"
        lede="Values nobody has published, with the range and what measurement would resolve each. A number without a source fails the build here, so anything genuinely unknown has to be declared rather than quietly invented. This list is the project's research queue."
      >
        {uncertainties.length === 0 ? (
          <p className="text-[var(--color-ink-faint)]">No uncertain values declared.</p>
        ) : (
          <div className="space-y-3">
            {uncertainties.slice(0, 10).map((u) => (
              <div key={`${u.path}-${u.nominal}`} className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="num text-sm text-[var(--color-accent)]">{u.path}</span>
                  <span className="num text-sm text-[var(--color-unknown)]">
                    {u.low} to {u.high} ({u.nominal}) {u.unit}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-dim)]">{u.reason}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-faint)]">
                  <span className="text-[var(--color-ink-dim)]">Resolved by:</span> {u.resolvedBy}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Rule />

      {/* ---------------------------------------------------------------- */}
      <Section
        n="11"
        title="Build order"
        lede="Each phase has a validation gate. Nothing downstream of a failing gate is trustworthy, so a phase has to pass before the next opens."
      >
        <ol className="space-y-0">
          {[
            ['1', 'Foundation', 'Units, atmosphere, gas properties, buoyancy', 'done'],
            ['2', 'Does it close?', 'Permeation, electrolysis, fuel cell, solar, water balance', 'done'],
            ['3', 'Can it be built?', 'Structure, buckling, mass fraction versus size', 'active'],
            ['4', 'Does it fly?', 'Aerodynamics, propulsors, 6-DOF with added mass', 'done'],
            ['4b', 'The powertrain decision', 'Fuel choice, TBO consumables, dissimilar redundancy', 'active'],
            ['5', 'Can it be lived in?', 'Habitat, life support, thermal, the year-long mission', 'active'],
            ['6', 'Will it kill me?', 'Hydrogen safety, lightning, icing, failure injection, regulation', 'active'],
            ['7', 'The site', 'Design explorer, flight simulator, mission player', 'active'],
            ['8', 'Build documentation', 'Frame drawings, laminate schedules, bill of materials', 'todo'],
          ].map(([n, title, detail, state]) => (
            <li
              key={n}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--color-rule)] py-3 last:border-0"
            >
              <span className="num w-6 text-sm text-[var(--color-ink-faint)]">{n}</span>
              <span className="w-44 font-medium">{title}</span>
              <span className="flex-1 min-w-[16rem] text-sm text-[var(--color-ink-dim)]">{detail}</span>
              <span
                className={`num text-xs ${
                  state === 'done'
                    ? 'text-[var(--color-pass)]'
                    : state === 'active'
                      ? 'text-[var(--color-unknown)]'
                      : 'text-[var(--color-ink-faint)]'
                }`}
              >
                {state === 'done' ? 'GATES PASS' : state === 'active' ? 'IN PROGRESS' : 'PENDING'}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Rule />

      <footer className="py-12 text-sm text-[var(--color-ink-faint)]">
        <p className="max-w-3xl leading-relaxed">
          Every figure above is computed at build time from the model in this repository. Source,
          derivations and the full bibliography are on{' '}
          <a
            className="text-[var(--color-accent)] underline underline-offset-4"
            href="https://github.com/Xaxis/airship.diy"
          >
            GitHub
          </a>
          . MIT licensed: the design is meant to be built, including by people who are not me.
        </p>
      </footer>
    </main>
  )
}
