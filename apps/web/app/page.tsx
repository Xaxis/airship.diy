import Link from 'next/link'

import { ArrangementViewer } from '../components/ArrangementViewer'
import { Callout, Prose, Stat, StatGrid, fmt, pct } from '../components/site/primitives'
import { ROUTES } from '../lib/routes'
import {
  arrangement,
  ballast,
  baseline,
  build,
  hullProfile,
  marine,
  mission,
} from '../lib/model'

/**
 * The landing page.
 *
 * It has one job: say what the vehicle is, say whether it works, and get out of
 * the way. Everything that used to be here is a page of its own now, because a
 * fourteen section scroll is a document rather than a site, and nobody arrives
 * at a document from a link and reads it from the top.
 *
 * THE VERDICT GOES ABOVE THE FOLD AND IT INCLUDES THE FAILING GATE. A landing
 * page that shows only the passes is marketing.
 */
export default function Home() {
  const margin = arrangement.mass.marginFraction
  const closes = baseline?.result.closes ?? false
  const days = mission.physicalEnduranceDays

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-8">
      <header className="pt-14 pb-10 sm:pt-20">
        <h1 className="max-w-4xl text-3xl font-medium leading-[1.12] tracking-tight sm:text-5xl">
          A hydrogen airship you can build in a shop and then never have to land.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[var(--color-ink-dim)]">
          Powered by sunlight, fuel cells and engines so that no single technology failure ends the
          flight. Sized to be lived aboard by two people for a year. Able to land on water and
          operate as a boat.
        </p>
        <p className="mt-4 max-w-3xl leading-relaxed text-[var(--color-ink-faint)]">
          This is an open engineering notebook, not a concept renderer. Every number was computed
          by the model at build time, by the same functions the tests call. Where the model is
          guessing, it says so, and where a gate fails it is left failing rather than tuned away.
        </p>
      </header>

      <div className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
        <ArrangementViewer data={arrangement} />
      </div>

      <div className="mt-4">
        <StatGrid columns={6}>
          <Stat label="Length" value={fmt(hullProfile.length)} unit="m" />
          <Stat label="Envelope" value={fmt(hullProfile.volume)} unit="m³" />
          <Stat label="Gross weight" value={fmt(arrangement.mass.total)} unit="kg" />
          <Stat
            label="Lift margin"
            value={fmt(arrangement.mass.liftMargin)}
            unit="kg"
            note={`${pct(margin)} of gross`}
            tone={margin > 0.15 ? 'pass' : 'fail'}
          />
          <Stat
            label="Energy loop"
            value={closes ? 'closes' : 'open'}
            note={baseline ? `${pct(baseline.result.annualMargin)} annual margin` : ''}
            tone={closes ? 'pass' : 'fail'}
          />
          <Stat
            label="Endurance"
            value={fmt(days)}
            unit="days"
            note={mission.physicalLimit}
            tone={days >= 365 ? 'pass' : 'unknown'}
          />
        </StatGrid>
      </div>

      <section className="py-14">
        <h2 className="text-xl font-medium tracking-tight">Four things that decide the design</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--color-ink-dim)]">
          Each is a constraint the vehicle has to be built around, and each is counterintuitive
          enough that a design drawn without it looks fine and is not.
        </p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Callout title="There is no trade against being heavy" tone="unknown">
            <p>
              An aeroplane that comes out overweight loses range and still flies. An airship has no
              such trade: the buoyancy is fixed by the envelope, so a kilogram over is a kilogram
              that does not leave the ground. At 90 m this arrangement is{' '}
              {fmt(-arrangement.sizing.marginAt90)} kg heavy and there is nothing to give up. The
              hull is {fmt(hullProfile.length)} m because that is the length at which the masses
              fit.
            </p>
          </Callout>
          <Callout title="A sealed pneumatic float is stiffer than the water" tone="fail">
            <p>
              Its stiffness goes with ABSOLUTE pressure and not gauge, so it is nearly sixty times
              stiffer than the waterplane it replaces. It limits force only if it VENTS. A rigid
              hull is held to sea state {marine.maximumSeaStateRigid}; a vented bag reaches{' '}
              {marine.maximumSeaStateVented}; a sealed one reaches{' '}
              {marine.maximumSeaStateSealed ?? 'none at all'}.
            </p>
          </Callout>
          <Callout title="The ocean is the ballast" tone="pass">
            <p>
              {ballast.superheat} kelvin of superheat moves lift by {fmt(ballast.excursion)} kg
              against a {fmt(ballast.landingTrim)} kg landing trim. The vehicle takes itself off by
              mid-afternoon and presses that onto its gear before dawn, and no passive device can be
              sized for a load that swings by {(ballast.excursion / ballast.landingTrim).toFixed(1)}{' '}
              times the trim, twice a day.
            </p>
            <p>
              A vehicle afloat is sitting on unlimited ballast, and moving water costs about a
              three-thousandth of what compressing lifting gas does. A {ballast.tankVolume.toFixed(1)}{' '}
              m&sup3; bladder and a {ballast.pumpPower.toFixed(0)} W pump track the swing, which is
              the cheapest fix in the design and closed the last gate that was failing.
            </p>
          </Callout>
          <Callout title="The building costs more than the airship" tone="fail">
            <p>
              ${(build.materialsTotal / 1e6).toFixed(1)}M of materials has to be assembled inside a{' '}
              {build.facility.clearLength.toFixed(0)} m shed that costs{' '}
              {build.buildingMultiple.toFixed(1)} times as much, cannot be rented, and is required
              because a rigid airship cannot be assembled in weather. Two people can hold the
              finished ship broadside in {build.handling.broadside.toFixed(2)} m/s. This is the page
              where the answer is no, and the reason is not the airship.
            </p>
          </Callout>
        </div>
      </section>

      <section className="border-t border-[var(--color-rule)] py-14">
        <h2 className="text-xl font-medium tracking-tight">The case, in order</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-[var(--color-ink-dim)]">
          Read top to bottom it is the argument for the design. Jumped into anywhere it is a
          reference.
        </p>
        <ol className="mt-7 grid gap-3 sm:grid-cols-2">
          {ROUTES.map((route, i) => (
            <li key={route.href}>
              <Link
                href={route.href}
                className="group flex h-full flex-col border border-[var(--color-rule)] bg-[var(--color-panel)] p-5 transition-colors hover:border-[var(--color-rule-bright)]"
              >
                <span className="num text-xs text-[var(--color-ink-faint)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="mt-2 text-lg font-medium tracking-tight group-hover:text-[var(--color-accent)]">
                  {route.title}
                </span>
                <span className="num mt-1 text-xs text-[var(--color-ink-faint)]">
                  {route.question}
                </span>
                <span className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                  {route.summary}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-[var(--color-rule)] py-14">
        <h2 className="text-xl font-medium tracking-tight">The rules everything follows from</h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <Prose>
            <p>
              <strong className="text-[var(--color-ink)]">There is one model.</strong> The site
              reads it, the simulator integrates it, the documentation renders from it. If a number
              appears in prose and also in the solver, that is a bug.
            </p>
            <p>
              The corollary that governs day to day work is that{' '}
              <strong className="text-[var(--color-ink)]">
                the figure of merit is days aloft
              </strong>
              . Not speed, not range, not payload. When two designs conflict the one that stays up
              longer wins, and it is why hybrid lift loses here and wins nearly everywhere else.
            </p>
          </Prose>
          <Prose>
            <p>
              <strong className="text-[var(--color-ink)]">Never invent a number.</strong> A lint
              rule fails any numeric literal in the physics packages that lacks a source or a
              derivation. Values that are genuinely unknown are encoded as uncertain, with a reason
              and with what would resolve them, and they appear in the research queue sorted by how
              much each one moves the endurance figure.
            </p>
            <p>
              The baseline is stationed at {(baseline?.latitude ?? 15).toFixed(0)}° latitude and{' '}
              {fmt(baseline?.altitude ?? 2000)} m, holding station against{' '}
              {baseline?.wind ?? 8} m/s for {pct(baseline?.dutyCycle ?? 0.65, 0)} of the day and
              drifting the rest.
            </p>
          </Prose>
        </div>
      </section>
    </main>
  )
}
