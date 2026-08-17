import { MarineSimulator } from '../../components/MarineSimulator'
import { NavigationPolar } from '../../components/NavigationPolar'
import {
  Callout,
  DataTable,
  Section,
  Stat,
  StatGrid,
  Td,
  Th,
  Tr,
  fmt,
  pct,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import { build, heave, hullProfile, marine, navigation } from '../../lib/model'

export const metadata = { title: 'Water' }

export default function Page() {
  return (
    <Shell href="/water">
      <Section
        title="Land it on water"
        lede={`Flotation is trivial and it is not the problem. The load resting on the water is the STATIC HEAVINESS, not the weight: trimmed ${fmt(marine.landingHeaviness)} kg heavy this vehicle displaces ${(marine.landingHeaviness / 1025).toFixed(2)} m³ under a ${fmt(marine.envelopeVolume)} m³ envelope. It is a cork with a ${fmt(hullProfile.length)} m sail on it, and every consequence is the opposite of boat intuition.`}
      >
        <div className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <MarineSimulator data={marine} radii={hullProfile.radii} length={hullProfile.length} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="border-l-2 border-[var(--color-fail)] bg-[var(--color-panel)] p-5">
            <h3 className="font-medium">It does not slam. It gets picked up.</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-dim)]">
              A floatplane is limited to about 0.3 m of wave because it is heavy: several tonnes
              have to be stopped in a hull length and the deceleration breaks things. This vehicle
              puts {fmt(marine.landingHeaviness)} kg on the water. It is far too light to slam.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">
              What happens instead is that a crest tries to LIFT it. The envelope above is fixed in
              altitude by {fmt(marine.grossLift / 1000)} tonnes of buoyancy and an enormous added
              mass, so the whole relative
              motion goes into the suspension. A rigid hull is a hydrostatic spring with no ceiling:
              in a 0.3 m sea it feeds{' '}
              {fmt((marine.seakeepingComparison[1]?.rigid.load ?? 0) / 1000)} kN up the cables
              against a {fmt(marine.suspensionDesignLoad / 1000)} kN flight design load.
            </p>
          </div>

          <div>
            <div className="scroll-x">
            <table className="num w-full min-w-[26rem] border border-[var(--color-rule)] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-rule)] text-left text-xs text-[var(--color-ink-faint)]">
                  <th className="p-2.5 font-normal">Sea state</th>
                  <th className="p-2.5 text-right font-normal">Hs</th>
                  <th className="p-2.5 text-right font-normal">Rigid hull</th>
                  <th className="p-2.5 text-right font-normal">Sealed bag</th>
                  <th className="p-2.5 text-right font-normal">Vented bag</th>
                </tr>
              </thead>
              <tbody>
                {marine.seakeepingComparison.map((s) => (
                  <tr key={s.code} className="border-b border-[var(--color-rule)] last:border-0">
                    <td className="sans p-2.5">
                      {s.code} <span className="text-[var(--color-ink-faint)]">{s.description}</span>
                    </td>
                    <td className="p-2.5 text-right text-[var(--color-ink-dim)]">
                      {s.significantWaveHeight} m
                    </td>
                    <td
                      className={`p-2.5 text-right ${s.rigid.ok ? 'text-[var(--color-pass)]' : 'text-[var(--color-fail)]'}`}
                    >
                      {pct(s.rigid.utilisation, 0)}
                    </td>
                    <td
                      className={`p-2.5 text-right ${s.sealed.ok ? 'text-[var(--color-pass)]' : 'text-[var(--color-fail)]'}`}
                    >
                      {pct(s.sealed.utilisation, 0)}
                    </td>
                    <td
                      className={`p-2.5 text-right ${s.vented.ok ? 'text-[var(--color-pass)]' : 'text-[var(--color-fail)]'}`}
                    >
                      {pct(s.vented.utilisation, 0)}
                      {s.vented.forceLimited ? ' *' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-faint)]">
              Suspension load as a fraction of its flight design load, with the dynamic
              amplification from the {' '}
              {marine.heaveInertia.toLocaleString('en-US', { maximumFractionDigits: 0 })} kg
              effective heave inertia included: the wave has to accelerate the ship AND the air it
              drags with it. A rigid hull is limited to sea state{' '}
              {marine.maximumSeaStateRigid}. A SEALED bag reaches sea state{' '}
              {marine.maximumSeaStateSealed ?? 'none at all'}, because it is a gas spring at
              absolute pressure and nearly sixty times stiffer than the water. Only the VENTED bag,
              relieving at {(marine.reliefPressure / 1000).toFixed(2)} kPa through{' '}
              {marine.ventArea.toFixed(2)} m² of vent, reaches sea state{' '}
              {marine.maximumSeaStateVented}. An asterisk marks where it is venting rather than
              transmitting.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium">Motoring to windward</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            The question that decides whether marine mode is an escape or a trap. The hull could be
            towed at hull speed by a rowing boat; what has to be pushed through the air is the
            entire envelope.
          </p>
          <div className="scroll-x mt-3">
          <table className="num w-full min-w-[30rem] border border-[var(--color-rule)] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-xs text-[var(--color-ink-faint)]">
                <th className="p-2.5 font-normal">Wind</th>
                <th className="p-2.5 text-right font-normal">Speed made good</th>
                <th className="p-2.5 text-right font-normal">Of the drag, air is</th>
                <th className="p-2.5 font-normal" />
              </tr>
            </thead>
            <tbody>
              {marine.windward.map((w) => (
                <tr key={w.wind} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="p-2.5">{w.wind} m/s</td>
                  <td
                    className={`p-2.5 text-right ${w.overpowered ? 'text-[var(--color-fail)]' : ''}`}
                  >
                    {w.speed.toFixed(2)} m/s
                  </td>
                  <td className="p-2.5 text-right text-[var(--color-ink-dim)]">
                    {pct(w.aerodynamicFraction, 0)}
                  </td>
                  <td className="sans p-2.5 text-xs text-[var(--color-ink-faint)]">
                    {w.overpowered
                      ? 'blown backwards'
                      : w.porpoisingLimited
                        ? 'limited by porpoising, not power'
                        : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-faint)]">
            Above {marine.stallWind.toFixed(0)} m/s the vehicle goes wherever the wind goes. That is
            not a failure of the propulsion, it is the ratio of a {fmt(marine.envelopeVolume)} m³
            envelope to {fmt(marine.staticThrust / 1000, 1)} kN of thrust, and the answer to it is
            the bow drogue rather than more power.
          </p>
        </div>
      </Section>

      <Section
        title="It does not slam, and it does not load its suspension"
        lede={`Every intuition about seakeeping comes from hulls that carry their own weight. This one carries ${fmt(marine.landingHeaviness)} kg of a ${fmt(marine.totalMass / 1000)} tonne vehicle and floats on ${(heave.draught * 1000).toFixed(0)} mm of draught, so almost any wave lifts it clear and sets it down again at a speed you could not feel.`}
      >
        <DataTable
          head={
            <>
              <Th>Sea state</Th>
              <Th align="right">Hs</Th>
              <Th align="right">Wave period</Th>
              <Th align="right">Relative motion</Th>
              <Th align="right">Suspension</Th>
              <Th align="right">Re-entry</Th>
            </>
          }
          caption={`The gondola's own heave period is ${(heave.bySeaState[2]?.naturalPeriod ?? 1).toFixed(1)} s against wave periods of four to nine, so the forcing is far slower than the vehicle can respond and it rides quasi-statically. The load is then the gondola's mass times the wave's ACCELERATION, and a fully developed sea has a modal period going as the square root of its height, so that acceleration is nearly constant. Sea state 6 loads the suspension no harder than sea state 2.`}
          minWidth={620}
        >
          {heave.bySeaState.map((s) => (
            <Tr key={s.code}>
              <Td>{s.code}</Td>
              <Td align="right">{s.significantWaveHeight.toFixed(2)} m</Td>
              <Td align="right">{s.wavePeriod.toFixed(1)} s</Td>
              <Td align="right">{(s.relativeMotion * 1000).toFixed(0)} mm</Td>
              <Td align="right" tone="pass">
                {(s.suspensionLoad / 1000).toFixed(1)} kN
              </Td>
              <Td align="right">{(s.reentryVelocity * 1000).toFixed(0)} mm/s</Td>
            </Tr>
          ))}
        </DataTable>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Callout tone="pass" title="A seaplane slams because it is heavy">
            <p>
              A floatplane is limited to about 0.3 m of wave because several tonnes have to be
              stopped in a hull length and the deceleration breaks things. This vehicle puts{' '}
              {fmt(heave.landingTrim)} kg on {fmt(heave.waterplaneArea)} m² of waterplane, which is{' '}
              {(heave.draught * 1000).toFixed(0)} mm of draught. It comes clear of the water on
              every wave in every sea state, and re-enters at millimetres per second.
            </p>
            <p>
              The peak impact pressure that produces is under a pascal. The load case on a vehicle
              this light is not immersion and it is not impact.
            </p>
          </Callout>

          <Callout tone="unknown" title="So stiffen the suspension, not soften it">
            <p>
              Vibration isolation says soften the mount to put the natural frequency below the
              forcing. Here every wave frequency is already <em>below</em> the gondola&rsquo;s
              natural one, so softening drags the resonance <em>up</em> into the sea states the
              vehicle will actually meet.
            </p>
            <ul className="num space-y-1 text-xs">
              {heave.stiffnessSweep.map((k) => (
                <li key={k.stiffness} className="flex justify-between gap-4">
                  <span>{(k.stiffness / 1e6).toFixed(2)} MN/m</span>
                  <span
                    className={
                      k.resonantWaveHeight > 0.2
                        ? 'text-[var(--color-fail)]'
                        : 'text-[var(--color-ink-dim)]'
                    }
                  >
                    resonates at {(k.resonantWaveHeight * 1000).toFixed(0)} mm
                  </span>
                </li>
              ))}
            </ul>
            <p>
              A soft suspension puts the resonance on a common chop. A stiff one puts it on a
              ripple whose amplitude is nothing. The cables are sized by flight loads and by
              handling, and the sea does not enter.
            </p>
          </Callout>
        </div>
      </Section>

      <Section
        title="Where it can actually go"
        lede={`Everyone answers this with the side area: ${fmt(build.handling.sideArea)} m² of sail against a few tonnes of displacement, so obviously it cannot make way. That reasoning is wrong by a factor of ${(marine.beamOnEquivalentArea / marine.bowOnEquivalentArea).toFixed(0)}. BOW ON THE HULL IS NOT A SAIL: the complete vehicle's drag coefficient is 0.045 on volume to the two thirds, an equivalent area of ${fmt(marine.bowOnEquivalentArea)} m². Beam-on it is ${fmt(marine.beamOnEquivalentArea)}. The vehicle that cannot make way is the one lying across the wind, and one with enough tail never is.`}
      >
        <NavigationPolar
          polars={navigation.polars}
          caption={`Speed made good against heading, at the ${fmt(navigation.centreboardArea)} m² of immersed centreboard the arrangement carries. Wind from the top. ${navigation.weathervanesUnaided ? 'The fins hold the vehicle bow-on by themselves, so the propulsors are free to drive rather than to steer.' : 'The fins do not hold it bow-on and the propulsors must, which is most of what they have.'}`}
        />

        <div className="mt-6">
          <StatGrid columns={4}>
            <Stat
              label="Upwind in 10 m/s"
              value={(navigation.polars[2]?.upwindSpeed ?? 0).toFixed(1)}
              unit="m/s"
              tone="pass"
              note="Against a 3 m/s requirement"
            />
            <Stat
              label="Leeway at the beam"
              value={(((navigation.polars[2]?.beamLeeway ?? 0) * 180) / Math.PI).toFixed(0)}
              unit="°"
              note="The angle between where it points and where it goes"
            />
            <Stat
              label="Centreboard"
              value={fmt(navigation.centreboardArea)}
              unit="m²"
              note="Immersed, retractable. The part that decides it."
            />
            <Stat
              label="Static thrust"
              value={(navigation.staticThrust / 1000).toFixed(1)}
              unit="kN"
              note="Four ducted propulsors at zero airspeed"
            />
          </StatGrid>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Callout tone="pass" title="Fixing the flight stability fixed the boat">
            <p>
              The tail on this vehicle grew from 405 m² to 825 m² when the yaw stability check was
              corrected, and the marine consequence was not the point of that change. With the small
              tail the propulsors had to hold the heading and had nothing left to drive with. With
              the corrected one the fins weathervane it unaided and the whole installed thrust goes
              into making way.
            </p>
          </Callout>

          <Callout tone="unknown" title="One part decides whether boat mode exists at all">
            <p>
              Holding a heading and travelling along it are different things. At an angle to the
              wind the envelope makes an enormous side force, and a hull sitting centimetres into
              the water resists almost none of it. The sensitivity to immersed lateral area is
              brutal and then it saturates.
            </p>
          </Callout>
        </div>

        <div className="mt-6">
          <DataTable
            head={
              <>
                <Th>Immersed lateral area</Th>
                <Th align="right">Leeway at the beam</Th>
                <Th align="right">Usable cone from dead upwind</Th>
                <Th align="right">Upwind speed</Th>
              </>
            }
            caption="At 10 m/s of wind. No amount of thrust substitutes: the speed through the water is identical at every row, and what changes is where the vehicle ends up. A retractable board of about 18 m² is what turns a thing that goes upwind or drifts into a boat."
            minWidth={520}
          >
            {navigation.lateralAreaSweep.map((row) => {
              const cone = (row.usefulCone * 180) / Math.PI
              return (
                <Tr key={row.area}>
                  <Td>
                    {row.area} m²
                    {row.area === navigation.centreboardArea ? (
                      <span className="ml-2 text-xs text-[var(--color-accent)]">fitted</span>
                    ) : null}
                  </Td>
                  <Td align="right">{((row.beamLeeway * 180) / Math.PI).toFixed(0)}°</Td>
                  <Td align="right" tone={cone > 90 ? 'pass' : cone > 30 ? 'unknown' : 'fail'}>
                    {cone.toFixed(0)}°
                  </Td>
                  <Td align="right">{row.upwindSpeed.toFixed(1)} m/s</Td>
                </Tr>
              )
            })}
          </DataTable>
        </div>
      </Section>
    </Shell>
  )
}
