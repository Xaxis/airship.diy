import { BASELINE } from '@airship/model'
import { DesignExplorer } from '../../components/DesignExplorer'
import { FlightSimulator } from '../../components/FlightSimulator'
import {
  Callout,
  Rule,
  Section,
  Stat,
  StatGrid,
  fmt,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import { flightConfiguration, vectoring } from '../../lib/model'

export const metadata = { title: 'Flight' }

export default function Page() {
  return (
    <Shell href="/flight">
      <Section
        title="Fly it"
        lede="This runs the project's own 6-DOF solver at 100 Hz, not a simplified version for the browser. The same step function the validation gates exercise is called here, so if the vehicle feels wrong there is no second implementation to blame. Expect it to be slow to respond and slow to stop: the displaced air nearly doubles the effective mass in sway and heave."
      >
        <FlightSimulator
          tail={flightConfiguration.tail}
          wing={flightConfiguration.wing}
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
        title="Putting it down, and picking it up again"
        lede="A buoyant vehicle does not lift its weight on vectored thrust. It lifts its residual HEAVINESS, which is a couple of percent of the weight, so the thrust needed is two orders of magnitude below a helicopter of the same mass. Zeppelin NT is certified to 400 kg of static heaviness at take-off on an 8,050 kg vehicle, and lifts it on tilting propellers."
      >
        <StatGrid columns={4}>
          <Stat
            label="Liftable heaviness"
            value={fmt(vectoring.liftable)}
            unit="kg"
            tone={vectoring.liftsItsTrim ? 'pass' : 'fail'}
            note={`${(vectoring.heavinessFraction * 100).toFixed(1)}% of the vehicle`}
          />
          <Stat
            label="At the landing trim"
            value={(vectoring.powerAtTrim / 1000).toFixed(0)}
            unit="kW"
            note={`Of ${(vectoring.power / 1000).toFixed(0)} kW installed`}
          />
          <Stat
            label="With one propulsor out"
            value={fmt(vectoring.outRemaining)}
            unit="kg"
            tone={vectoring.stillLands ? 'pass' : 'fail'}
            note={`Against a ${fmt(vectoring.landingTrim)} kg trim, which is what sets the trim`}
          />
          <Stat
            label="Holds itself bow-on in"
            value={vectoring.headwindHold.toFixed(0)}
            unit="m/s"
            tone="pass"
            note={`Broadside, ${vectoring.crosswindHold.toFixed(1)} m/s`}
          />
        </StatGrid>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Callout title="Diameter is the only variable that matters">
            <p>
              Momentum theory gives static thrust proportional to (ρAP²)<sup>1/3</sup>, so at fixed
              power it goes as the <em>four-thirds</em> power of diameter. Doubling it is worth 2.5
              times the thrust for the same kilowatt, and a duct is worth a further factor of two
              because the shroud carries a suction load of its own and stops the wake contracting.
            </p>
            <div className="scroll-x">
              <table className="num w-full min-w-[22rem] text-xs">
                <thead>
                  <tr className="text-left text-[var(--color-ink-faint)]">
                    <th className="py-1 font-normal">Diameter</th>
                    <th className="py-1 text-right font-normal">Open</th>
                    <th className="py-1 text-right font-normal">Ducted</th>
                  </tr>
                </thead>
                <tbody>
                  {[3, 4, 5, 6, 8].map((d) => {
                    const open = vectoring.diameterSweep.find(
                      (x) => x.diameter === d && !x.ducted,
                    )
                    const duct = vectoring.diameterSweep.find((x) => x.diameter === d && x.ducted)
                    return (
                      <tr key={d} className="border-t border-[var(--color-rule)]">
                        <td className="py-1">{d} m</td>
                        <td className="py-1 text-right text-[var(--color-ink-dim)]">
                          {fmt(open?.liftable ?? 0)} kg
                        </td>
                        <td
                          className={`py-1 text-right ${duct?.lifts ? 'text-[var(--color-pass)]' : 'text-[var(--color-ink-dim)]'}`}
                        >
                          {fmt(duct?.liftable ?? 0)} kg
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p>
              Momentum theory alone would have promised 2.7 times these figures. The realisation
              factor against certified airship installations is 0.37: tip losses, non-uniform
              inflow, the download on the body under the wake, and a propulsor sized for cruise
              working at zero airspeed.
            </p>
          </Callout>

          <Callout tone="pass" title="Losing one is not the helicopter case">
            <p>
              A heavier-than-air VTOL that loses a rotor in the hover is descending immediately and
              the only question is how hard it lands. This one is still buoyant. It loses the
              ability to <em>place</em> itself and keeps the ability to stay up.
            </p>
            <p>
              That is what sets the landing trim. Four propulsors lift{' '}
              {fmt(vectoring.liftable)} kg and three lift {fmt(vectoring.outRemaining)}, so the
              vehicle is trimmed to {fmt(vectoring.landingTrim)} kg rather than to whatever keeps
              it still in a chop. A trim it can only leave with every propulsor running turns one
              failure into a vehicle that cannot take off again.
            </p>
            <p>
              On the ground it holds itself bow-on in {vectoring.headwindHold.toFixed(0)} m/s, above
              the {(6.3).toFixed(1)} m/s the US Navy would dock a ZPG-3W in with a mobile mast, two
              mechanical mules and eighteen trained people. It does <em>not</em> help broadside,
              where it manages {vectoring.crosswindHold.toFixed(1)}, and no plausible installation
              would: the broadside force is an order of magnitude larger and thrust scales with
              power. What it removes is the crew, not the need to weathervane.
            </p>
          </Callout>
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
