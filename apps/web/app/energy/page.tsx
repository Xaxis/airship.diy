import {
  Rule,
  Section,
  Stat,
  fmt,
  kWh,
  pct,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
  baseline,
  designs,
  fuelRanking,
  mission,
} from '../../lib/model'

export const metadata = { title: 'Energy' }

export default function Page() {
  const b = baseline
  const energyTotal = b
    ? b.result.propulsionEnergy + b.result.habitatEnergy + b.result.liftMakeupEnergy
    : 1

  return (
    <Shell href="/energy">
      <Section
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

      <Section
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

      <Section
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
    </Shell>
  )
}
