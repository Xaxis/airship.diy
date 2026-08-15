import { ArrangementViewer } from '../../components/ArrangementViewer'
import { InboardProfile } from '../../components/InboardProfile'
import {
  Rule,
  Section,
  Stat,
  fmt,
  pct,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
  arrangement,
  baseline,
  hullProfile,
} from '../../lib/model'

export const metadata = { title: 'The ship' }

export default function Page() {
  return (
    <Shell href="/ship">
      <Section
        title="The ship"
        lede="Not a concept render. Every box below is placed and sized from the same station, extent, width and height the mass statement integrated to get its volume, and every one of those volumes went into the lift figure and the habitability check. The fins are the planform the yaw stability was computed from. The gas cells occupy exactly the volume the buoyancy came from, minus the keel corridor they give up."
      >
        <div className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <ArrangementViewer data={arrangement} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Length" value={fmt(hullProfile.length)} unit="m" />
          <Stat label="Max diameter" value={fmt(hullProfile.maxDiameter, 1)} unit="m" />
          <Stat label="Envelope volume" value={fmt(hullProfile.volume)} unit="m³" />
          <Stat
            label="Gas volume"
            value={fmt(arrangement.mass.gasVolume)}
            unit="m³"
            note={`${fmt(arrangement.mass.keelEnvelope)} m³ given to the keel`}
          />
          <Stat label="Gross weight" value={fmt(arrangement.mass.total)} unit="kg" />
          <Stat
            label="Lift margin"
            value={fmt(arrangement.mass.liftMargin)}
            unit="kg"
            note={`${pct(arrangement.mass.marginFraction)} of gross`}
          />
        </div>

        <div className="mt-6 border-l-2 border-[var(--color-unknown)] bg-[var(--color-panel)] p-5">
          <h3 className="font-medium">Drawing this made the ship 25 metres longer</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            The baseline was 90 m for as long as the mass budget was a{' '}
            <em>fraction</em>. Giving the compartments, the machinery, the tanks and the array real
            positions and real masses turned it into a <em>statement</em>, and the statement was
            that 90 m comes out {fmt(-arrangement.sizing.marginAt90)} kg heavy at the fill fraction
            that gives it pressure height. It closes at{' '}
            {arrangement.sizing.closesExactly?.toFixed(1)} m and needs{' '}
            {arrangement.sizing.withGrowthAllowance?.toFixed(1)} m to carry the 15 percent growth
            that every preliminary mass estimate suffers between concept and first flight.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            An aeroplane that comes out heavy loses range and still flies. An airship has no such
            trade: the buoyancy is fixed by the envelope. A design that closes exactly is a design
            that will not close.
          </p>
        </div>
      </Section>

      <Rule />

      <Section
        title="Where everything is"
        lede="The drawing an airship is actually designed on. Every habitable space is below the gas cells, because a leak rises: the gondola hangs under the hull and the keel corridor runs along its bottom, and nothing a person occupies is inside the cell volume. The engine is aft and low because the exhaust must leave below and downstream of the whole envelope, which costs trim and is worth it."
      >
        <InboardProfile data={arrangement} />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">Mass by group</h3>
            <table className="num mt-3 w-full border border-[var(--color-rule)] text-sm">
              <tbody>
                {Object.entries(arrangement.mass.byCategory)
                  .filter(([, kg]) => kg > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, kg]) => (
                    <tr key={category} className="border-b border-[var(--color-rule)] last:border-0">
                      <td className="sans p-2.5 capitalize">{category}</td>
                      <td className="p-2.5 text-right">{fmt(kg)} kg</td>
                      <td className="p-2.5 text-right text-[var(--color-ink-faint)]">
                        {pct(kg / arrangement.mass.total)}
                      </td>
                    </tr>
                  ))}
                <tr className="border-t border-[var(--color-rule)]">
                  <td className="sans p-2.5 font-medium">Gross weight</td>
                  <td className="p-2.5 text-right font-medium">
                    {fmt(arrangement.mass.total)} kg
                  </td>
                  <td className="p-2.5" />
                </tr>
                <tr>
                  <td className="sans p-2.5 text-[var(--color-ink-dim)]">
                    Gross lift, {arrangement.mass.bindingCondition}
                  </td>
                  <td className="p-2.5 text-right text-[var(--color-ink-dim)]">
                    {fmt(arrangement.mass.grossLift)} kg
                  </td>
                  <td className="p-2.5" />
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-faint)]">
              Lift is computed at both ends of the operating band and the binding one is used. At
              sea level the cells are at {pct(0.85, 0)} fill on dense air; at the design altitude
              they have expanded to fill completely on thin air, which is what pressure height
              means.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium">What the arrangement has to obey</h3>
            <ul className="mt-3 space-y-2">
              {arrangement.findings.map((f) => (
                <li
                  key={f.id}
                  className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-3"
                >
                  <p className="flex items-baseline gap-2 text-sm">
                    <span
                      className={`num shrink-0 text-xs ${
                        f.severity === 'pass'
                          ? 'text-[var(--color-pass)]'
                          : f.severity === 'warn'
                            ? 'text-[var(--color-unknown)]'
                            : 'text-[var(--color-fail)]'
                      }`}
                    >
                      {f.severity === 'pass' ? 'PASS' : f.severity === 'warn' ? 'WARN' : 'FAIL'}
                    </span>
                    <span>{f.rule}</span>
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                    {f.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </Shell>
  )
}
