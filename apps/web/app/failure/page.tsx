import {
  Callout,
  Prose,
  Section,
  Stat,
  StatGrid,
  fmt,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import { arrangement, failure } from '../../lib/model'

export const metadata = { title: 'Failure' }

const SEVERITY_TONE = {
  nuisance: 'text-[var(--color-ink-faint)]',
  degraded: 'text-[var(--color-ink-dim)]',
  serious: 'text-[var(--color-unknown)]',
  catastrophic: 'text-[var(--color-fail)]',
} as const

const SEVERITY_BORDER = {
  nuisance: 'border-[var(--color-rule)]',
  degraded: 'border-[var(--color-rule)]',
  serious: 'border-[var(--color-unknown)]',
  catastrophic: 'border-[var(--color-fail)]',
} as const

export default function Page() {
  return (
    <Shell href="/failure">
      <Section
        title="Eight ways this vehicle fails"
        lede="What happens, how you find out, what you do about it, and whether the design already answers it. The consequences are computed from the same mass statement that sizes the ship, so they move when the ship does."
      >
        <StatGrid columns={4}>
          <Stat label="Modes considered" value={fmt(failure.total)} />
          <Stat
            label="Survivable as drawn"
            value={fmt(failure.survivable)}
            tone="pass"
            note="With the crew aboard and the ship recoverable"
          />
          <Stat
            label="Not survivable"
            value={fmt(failure.total - failure.survivable)}
            tone="fail"
            note={failure.catastrophic.join(', ')}
          />
          <Stat
            label="Ballast to answer with"
            value={fmt(failure.ballastAvailable)}
            unit="kg"
            note="Water in the two tanks, droppable in seconds"
          />
        </StatGrid>

        <div className="mt-6">
          <Callout tone={failure.catastrophic.length > 0 ? 'fail' : 'pass'}>
            <p>{failure.verdict}</p>
          </Callout>
        </div>

        <ul className="mt-8 space-y-3">
          {failure.modes.map((mode) => (
            <li
              key={mode.id}
              className={`border-l-2 ${SEVERITY_BORDER[mode.severity]} border-y border-r border-y-[var(--color-rule)] border-r-[var(--color-rule)] bg-[var(--color-panel)] p-5`}
            >
              <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-medium">{mode.name}</span>
                <span className={`num text-xs uppercase tracking-wider ${SEVERITY_TONE[mode.severity]}`}>
                  {mode.severity}
                  {mode.survivable ? '' : ' · not survivable'}
                </span>
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
                {mode.effect}
              </p>

              <dl className="mt-4 grid gap-x-8 gap-y-3 border-t border-[var(--color-rule)] pt-4 sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                    Consequence
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                    {mode.consequence}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                    Detection
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                    {mode.detection}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                    What you do
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                    {mode.response}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                    What the design does about it
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                    {mode.designAnswer}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="The electrical architecture"
        lede="Two segregated direct current buses joined by a tie that opens on a fault. Every source divides between them and every critical load is fed from both, so no single node in the schematic can isolate the habitat, the ventilation or the propulsors from every source."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout title="Two halves, segregated to the cable routing">
            <p>
              The array strings divide between the halves on separate converters and separate runs.
              The fuel cell and the generator each have two output contactors. The battery is two
              strings rather than one. The four propulsors are two on each half, diagonally
              opposite, so losing a half leaves a yaw couple the survivors trim out rather than a
              pair on one side.
            </p>
            <p>
              Two buses sharing a conduit are one bus with extra contactors, so the segregation runs
              all the way down: separate routes, separate penetrations, separate fire zones.
            </p>
          </Callout>

          <Callout title="One deliberate exception">
            <p>
              The electrolyzer hangs on one half only. It is the largest load and the most
              interruptible: it exists to turn surplus daylight into hydrogen, so it is the first
              thing shed and it misses nothing. Duplicating its feed would be mass spent on the one
              load that does not need it.
            </p>
            <p>
              Fault energy is bounded at every node for a separate reason. 4.3 kJ is enough to
              initiate a hydrogen detonation directly rather than a deflagration, and a capacitor
              bank or an arcing contactor reaches it.
            </p>
          </Callout>
        </div>

        <div className="mt-8">
          <Prose>
            <p>
              The other pattern worth naming is how much of the survivability is bought with water.
              The cell tears, the cover tear and the loss of a propulsor are all answered partly by
              dropping ballast, and the ballast is {fmt(failure.ballastAvailable)} kg of the same
              water the habitat drinks and the electrolyzer splits. The ship carries{' '}
              {fmt(arrangement.cellCount)} gas cells so that no single tear is more than a twelfth
              of the lift, and the water is what covers the second one.
            </p>
            <p>
              Nothing here is a probability. This is a consequence analysis: what happens, how you
              find out, what you do, and whether the design already answers it. Rates would need a
              fleet, and the fleet is one ship that has not been built.
            </p>
          </Prose>
        </div>
      </Section>

    </Shell>
  )
}
