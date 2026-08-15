import { BASELINE } from '@airship/model'
import { DesignExplorer } from '../../components/DesignExplorer'
import { FlightSimulator } from '../../components/FlightSimulator'
import {
  Rule,
  Section,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
} from '../../lib/model'

export const metadata = { title: 'Flight' }

export default function Page() {
  return (
    <Shell href="/flight">
      <Section
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

      <Section
        title="Move a parameter and watch what breaks"
        lede="Every figure here is recomputed by the same solvers the tests and the reports use. Infeasible regions are shown as infeasible rather than as a small number: a hull that cannot lift its own structure says so, and a wind the vehicle cannot hold against turns the verdict red."
      >
        <DesignExplorer />
      </Section>
    </Shell>
  )
}
