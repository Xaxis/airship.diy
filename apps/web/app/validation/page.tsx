import {
  Section,
  Stat,
  fmt,
  pct,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
  hydrogenAdvantage,
  purityDemonstration,
  referenceLift,
  structuralBenchmark,
  validation,
} from '../../lib/model'

export const metadata = { title: 'Validation' }

export default function Page() {
  return (
    <Shell href="/validation">
      <Section
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
    </Shell>
  )
}
