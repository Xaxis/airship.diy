import {
  Section,
  fmt,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
  architectures,
} from '../../lib/model'

export const metadata = { title: 'Architecture' }

export default function Page() {
  return (
    <Shell href="/architecture">
      <Section
        title="Why this architecture and not another"
        lede="Rigid, semi-rigid, non-rigid, hybrid-lift and variable-buoyancy, each calibrated on a vehicle that actually flew and each run through the same gates. The comparison is the point: three of them are lighter than the one chosen, and each is lighter for a reason that costs something a liveaboard cannot pay."
      >
        <div className="overflow-x-auto border border-[var(--color-rule)]">
          <table className="num w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-xs text-[var(--color-ink-faint)]">
                <th className="p-2.5 font-normal">Architecture</th>
                <th className="p-2.5 text-right font-normal">Structure</th>
                <th className="p-2.5 text-right font-normal">kg/m³</th>
                <th className="p-2.5 text-right font-normal">Ballast system</th>
                <th className="p-2.5 font-normal">Can hover</th>
                <th className="p-2.5 font-normal">A torn cell</th>
              </tr>
            </thead>
            <tbody>
              {architectures.comparison.map((a) => (
                <tr key={a.id} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="sans p-2.5">
                    {a.name}
                    {a.id === 'rigid' ? (
                      <span className="ml-2 text-xs text-[var(--color-accent)]">chosen</span>
                    ) : null}
                  </td>
                  <td className="p-2.5 text-right">{fmt(a.structure.total)} kg</td>
                  <td className="p-2.5 text-right text-[var(--color-ink-dim)]">
                    {a.structure.perVolume.toFixed(3)}
                  </td>
                  <td className="p-2.5 text-right">{fmt(a.ballastMass)} kg</td>
                  <td
                    className={`sans p-2.5 text-xs ${a.canHover ? 'text-[var(--color-pass)]' : 'text-[var(--color-fail)]'}`}
                  >
                    {a.canHover ? 'yes' : `no, needs ${a.minimumFlyingSpeed.toFixed(1)} m/s`}
                  </td>
                  <td className="sans p-2.5 text-xs text-[var(--color-ink-dim)]">
                    {a.containment === 'independent-cells'
                      ? 'costs one cell'
                      : 'costs the ship'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 border-l-2 border-[var(--color-accent)] bg-[var(--color-panel)] p-5">
          <h3 className="font-medium">The hull girder is sized by a gust, and the gust gets worse as the ship slows down</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            {architectures.girder.note}
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            That number then decides whether a pressure-stabilised hull is available at all, and it
            turns out not to be the binding criterion:{' '}
            {architectures.comparison.find((a) => a.pressure)?.pressure?.reason}
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {architectures.comparison.map((a) => (
            <div
              key={a.id}
              className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-4"
            >
              <p className="font-medium">{a.name}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                {a.description}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-faint)]">
                Calibrated on {a.calibratedOn}.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                {a.verdict}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </Shell>
  )
}
