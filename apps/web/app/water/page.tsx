import { MarineSimulator } from '../../components/MarineSimulator'
import {
  Section,
  fmt,
  pct,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
  hullProfile,
  marine,
} from '../../lib/model'

export const metadata = { title: 'Water' }

export default function Page() {
  return (
    <Shell href="/water">
      <Section
        title="Land it on water"
        lede="Flotation is trivial and it is not the problem. The load resting on the water is the STATIC HEAVINESS, not the weight: trimmed 800 kg heavy this vehicle displaces 0.8 m³ under a 31,657 m³ envelope. It is a cork with a 115 m sail on it, and every consequence is the opposite of boat intuition."
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
              altitude by 30 tonnes of buoyancy and an enormous added mass, so the whole relative
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
    </Shell>
  )
}
