import {
  Rule,
  Section,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
  uncertainties,
} from '../../lib/model'

export const metadata = { title: 'Open questions' }

export default function Page() {
  return (
    <Shell href="/open">
      <Section
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

      <Section
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
    </Shell>
  )
}
