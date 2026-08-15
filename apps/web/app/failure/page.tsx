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
        lede="The consequence column is computed from the same mass statement that sizes the ship rather than written down. That is the difference between an FMEA and a document: change the design and a mode that used to be survivable stops being survivable, and the page says so."
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
        title="The one that is not survivable is a wiring diagram"
        lede="Seven of the eight modes are answered by margin: lift margin, ballast, a spare propulsor, a second way out. The eighth is answered by drawing the schematic differently, which makes it the cheapest fix on this site and the only one that has to happen before anything else is trusted."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout tone="fail" title="Everything meets on one bus">
            <p>
              The photovoltaic array, the fuel cell, the engine and generator, the battery and the
              electrolyzer all deliver to a single direct current bus, and propulsion, life support,
              water treatment and the interstitial ventilation all draw from it. Counting sources
              says the ship has five. Counting independent PATHS says it has one.
            </p>
            <p>
              A fault at the bus takes out ventilation in a hull containing{' '}
              {fmt(arrangement.cellCount)} cells of hydrogen at the same moment it takes out the
              means of doing anything about it. No amount of generating capacity upstream helps,
              because none of it can reach a load.
            </p>
          </Callout>

          <Callout tone="pass" title="Split it, and tie it">
            <p>
              Two half buses, each with its own share of the sources and its own share of the loads,
              joined by a tie that opens on a fault. Every critical load is fed from whichever half
              survives. This is standard marine and aircraft practice and it is not expensive: it
              costs a contactor, a second set of bars, and the discipline to keep the halves
              genuinely independent all the way down to the cable routing.
            </p>
            <p>
              The reason it is worth a whole section is that the redundancy check in the systems
              model only found it because it counts paths rather than sources. Counting sources is
              the mistake, and it is the one almost every schematic makes.
            </p>
          </Callout>
        </div>

        <div className="mt-8">
          <Prose>
            <p>
              The other pattern worth naming is how much of the survivability is bought with water.
              The two cell tears, the cover tear and the loss of a propulsor are all answered partly
              by dropping ballast, and the ballast is {fmt(failure.ballastAvailable)} kg of the same
              water the habitat drinks and the electrolyzer splits. Run the model with none aboard
              and the answers get worse, which is the argument for carrying it stated as a result
              rather than as a preference.
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
