import { ArrangementViewer } from '../../components/ArrangementViewer'
import { InboardProfile } from '../../components/InboardProfile'
import { InteriorPlan } from '../../components/InteriorPlan'
import {
  Rule,
  Section,
  Stat,
  fmt,
  pct,
  Callout,
  StatGrid,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
  arrangement,
  ballast,
  hullProfile,
  habitat,
  navigation,
  vectoring,
  wings,
} from '../../lib/model'

export const metadata = { title: 'The ship' }

export default function Page() {
  return (
    <Shell href="/ship">
      <Section
        title="The ship"
        lede="Not a concept render. Every box below is placed and sized from the same station, extent, width and height the mass statement integrated to get its volume, and every one of those volumes went into the lift figure and the habitability check. The fins are the planform the yaw stability was computed from. The gas cells occupy exactly the volume the buoyancy came from, minus the keel corridor they give up."
      >
        <div className="border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <ArrangementViewer data={arrangement} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Length" value={fmt(hullProfile.length)} unit="m" />
          <Stat label="Max diameter" value={fmt(hullProfile.maxDiameter, 1)} unit="m" />
          <Stat label="Envelope volume" value={fmt(hullProfile.volume)} unit="m³" />
          <Stat
            label="Gas volume"
            value={fmt(arrangement.mass.gasVolume)}
            unit="m³"
            note={`${fmt(arrangement.mass.keelEnvelope)} m³ given to the keel`}
          />
          <Stat label="Gross weight" value={fmt(arrangement.mass.total)} unit="kg" />
          <Stat
            label="Lift margin"
            value={fmt(arrangement.mass.liftMargin)}
            unit="kg"
            note={`${pct(arrangement.mass.marginFraction)} of gross`}
          />
        </div>

        <div className="mt-6 border-l-2 border-[var(--color-unknown)] bg-[var(--color-panel)] p-5">
          <h3 className="font-medium">Drawing this made the ship 25 metres longer</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            The baseline was 90 m for as long as the mass budget was a{' '}
            <em>fraction</em>. Giving the compartments, the machinery, the tanks and the array real
            positions and real masses turned it into a <em>statement</em>, and the statement was
            that 90 m comes out {fmt(-arrangement.sizing.marginAt90)} kg heavy at the fill fraction
            that gives it pressure height. It closes at{' '}
            {arrangement.sizing.closesExactly?.toFixed(1)} m and needs{' '}
            {arrangement.sizing.withGrowthAllowance?.toFixed(1)} m to carry the 15 percent growth
            that every preliminary mass estimate suffers between concept and first flight.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            An aeroplane that comes out heavy loses range and still flies. An airship has no such
            trade: the buoyancy is fixed by the envelope. A design that closes exactly is a design
            that will not close.
          </p>
        </div>
      </Section>

      <Rule />

      <Section
        title="Where everything is"
        lede="The drawing an airship is actually designed on. Every habitable space is below the gas cells, because a leak rises: the gondola hangs under the hull and the keel corridor runs along its bottom, and nothing a person occupies is inside the cell volume. The engine is aft and low because the exhaust must leave below and downstream of the whole envelope, which costs trim and is worth it."
      >
        <InboardProfile data={arrangement} />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">Mass by group</h3>
            <div className="scroll-x mt-3">
            <table className="num w-full min-w-[26rem] border border-[var(--color-rule)] text-sm">
              <tbody>
                {Object.entries(arrangement.mass.byCategory)
                  .filter(([, kg]) => kg > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, kg]) => (
                    <tr key={category} className="border-b border-[var(--color-rule)] last:border-0">
                      <td className="sans p-2.5 capitalize">{category}</td>
                      <td className="p-2.5 text-right">{fmt(kg)} kg</td>
                      <td className="p-2.5 text-right text-[var(--color-ink-faint)]">
                        {pct(kg / arrangement.mass.total)}
                      </td>
                    </tr>
                  ))}
                <tr className="border-t border-[var(--color-rule)]">
                  <td className="sans p-2.5 font-medium">Gross weight</td>
                  <td className="p-2.5 text-right font-medium">
                    {fmt(arrangement.mass.total)} kg
                  </td>
                  <td className="p-2.5" />
                </tr>
                <tr>
                  <td className="sans p-2.5 text-[var(--color-ink-dim)]">
                    Gross lift, {arrangement.mass.bindingCondition}
                  </td>
                  <td className="p-2.5 text-right text-[var(--color-ink-dim)]">
                    {fmt(arrangement.mass.grossLift)} kg
                  </td>
                  <td className="p-2.5" />
                </tr>
              </tbody>
            </table>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-faint)]">
              Lift is computed at both ends of the operating band and the binding one is used. At
              sea level the cells are at {pct(0.85, 0)} fill on dense air; at the design altitude
              they have expanded to fill completely on thin air, which is what pressure height
              means.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium">What the arrangement has to obey</h3>
            <ul className="mt-3 space-y-2">
              {arrangement.findings.map((f) => (
                <li
                  key={f.id}
                  className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-3"
                >
                  <p className="flex items-baseline gap-2 text-sm">
                    <span
                      className={`num shrink-0 text-xs ${
                        f.severity === 'pass'
                          ? 'text-[var(--color-pass)]'
                          : f.severity === 'warn'
                            ? 'text-[var(--color-unknown)]'
                            : 'text-[var(--color-fail)]'
                      }`}
                    >
                      {f.severity === 'pass' ? 'PASS' : f.severity === 'warn' ? 'WARN' : 'FAIL'}
                    </span>
                    <span>{f.rule}</span>
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                    {f.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Rule />

      <Section
        title="The four parts that are not an airship's"
        lede="A conventional rigid airship is a hull, a keel, a gondola, an engine and a tail. This one has four things that are not on that list, and each of them exists because a number said so rather than because it looked right."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout title={`Wings, ${fmt(wings.span)} m span`}>
            <p>
              NOT for efficiency.{' '}
              {wings.crossoverExists ? (
                <>
                  A wing only makes this vehicle more efficient above{' '}
                  {wings.crossoverSpeed.toFixed(0)} m/s, where it would need{' '}
                  {(wings.crossoverPower / 1000).toFixed(0)} kW against{' '}
                  {(vectoring.power / 1000).toFixed(0)} installed.
                </>
              ) : (
                <>
                  There is no speed at which it does. The trade a wing normally wins is taking
                  weight off something that pays induced drag to carry it, and buoyancy does not:
                  the gas carries the whole weight at zero speed and for free. So the wing adds
                  profile and induced drag at every airspeed and takes nothing away, and no
                  crossover exists at any speed the vehicle could reach.
                </>
              )}{' '}
              It is for <em>carrying</em>: {fmt(wings.bestPayload)} kg of extra weight at{' '}
              {wings.bestSpeed.toFixed(0)} m/s on the power the vehicle already has, for{' '}
              {fmt(wings.mass)} kg of structure.
            </p>
            <p>
              Outboard rather than a fatter hull, because induced drag goes as span{' '}
              <em>squared</em> and not as area, so area at the extremities is worth about ten times
              area in the envelope. At the centre of buoyancy, so the lift split can change without
              a trim excursion. And it costs {(wings.stationPenalty * 100).toFixed(1)} percent of
              the station-keeping power every hour it is not carrying anything, which is the
              argument for folding it.
            </p>
          </Callout>

          <Callout title={`Centreboard, ${fmt(navigation.centreboardArea)} m²`}>
            <p>
              The part that decides whether boat mode exists. Holding a heading and travelling along
              it are different things: at an angle to the wind the envelope makes an enormous side
              force and a hull sitting centimetres into the water resists almost none of it.
            </p>
            <p>
              On bare hulls the usable cone from dead upwind is five degrees, because the vehicle
              points where the fins say and goes where the wind says. At this area it is the whole
              compass, and no amount of thrust substitutes: the speed through the water is identical
              either way.
            </p>
          </Callout>

          <Callout
            title={`A ${ballast.tankVolume.toFixed(1)} m³ seawater bladder and a ${ballast.pumpPower.toFixed(0)} W pump`}
          >
            <p>
              {ballast.swing.toFixed(1)} kelvin of diurnal swing moves the lift by{' '}
              {fmt(ballast.excursion)} kg against a {fmt(ballast.landingTrim)} kg landing trim, so
              the vehicle takes itself off by mid-afternoon and presses that onto its gear before
              dawn. No passive device can be sized for a load that swings by{' '}
              {(ballast.excursion / ballast.landingTrim).toFixed(1)} times the trim, twice a day.
            </p>
            <p>
              That swing is computed rather than assumed, and it is not the number this project
              used to carry. It was graded against a flat 20 K of superheat, described as the
              standard figure for a dark envelope. This envelope is not dark: the cover is
              reflective by design and only the array is optically black, so the clear-sky peak is
              nearer {ballast.superheat.toFixed(1)} K. The half that was missing entirely is
              supercooling. On a clear night the sky radiates as though it were 25 K colder than
              the air, the hull follows it down, and the gas goes {ballast.supercooling.toFixed(1)} K
              BELOW ambient. That is the excursion that puts the ship on its float, and it adds to
              the superheat rather than cancelling it.
            </p>
            <p>
              The worst superheat case is also not the obvious one. It arrives at{' '}
              {(ballast.superheatCloudCover * 100).toFixed(0)} percent cloud, not a clear sky,
              because cloud turns beam into diffuse and diffuse lands on half a convex hull where a
              beam lands on a quarter of it, while the total irradiance barely moves until the sky
              is mostly covered.
            </p>
            <p>
              A vehicle afloat is sitting on unlimited ballast, and moving water costs about a
              three-thousandth of what compressing lifting gas does. The pump moves{' '}
              {ballast.transferRate.toFixed(0)} kg a minute for {pct(ballast.shareOfHabitatLoad, 2)}{' '}
              of what the habitat draws in a day, and it tracks the superheat instead of fighting
              it. It works only afloat: in the air there is nothing to pump from.
            </p>
          </Callout>

          <Callout title={`Four ducted propulsors at ${vectoring.diameter.toFixed(1)} m`}>
            <p>
              Sized to lift the vehicle&rsquo;s residual heaviness rather than its weight, which on
              a buoyant ship is a few percent and two orders of magnitude less thrust than a
              helicopter of the same mass would need. They lift {fmt(vectoring.liftable)} kg on{' '}
              {(vectoring.powerAtTrim / 1000).toFixed(0)} kW of the{' '}
              {(vectoring.power / 1000).toFixed(0)} installed.
            </p>
            <p>
              Ducted because the shroud is worth a factor of two in static thrust, and{' '}
              {vectoring.diameter.toFixed(1)} m because thrust goes as the four-thirds power of
              diameter and nothing else in the propulsion group comes close. Three of them lift{' '}
              {fmt(vectoring.outRemaining)} kg, which is what sets the landing trim.
            </p>
          </Callout>
        </div>
      </Section>

      <Section
        title="Living in it"
        lede="The arrangement gives each room a size and a mass. That is enough to check whether the vehicle flies and not nearly enough to check whether a person can live in it. A galley with 18 cubic metres and 260 kilograms is a number; a galley with a two-zone induction hob, a 120 litre fridge and 1.4 metres of worktop is a room."
      >
        <InteriorPlan rooms={habitat.rooms} />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div>
            <StatGrid columns={2}>
              <Stat
                label="Floor area"
                value={fmt(habitat.totalFloorArea)}
                unit="m²"
                note="for two people"
              />
              <Stat label="Stowage" value={habitat.totalStowage.toFixed(1)} unit="m³" />
              <Stat
                label="Headroom, lowest room"
                value={fmt(habitat.minimumHeadroom * 1000)}
                unit="mm"
                note={`${fmt(habitat.headroomStandard * 1000)} is the MLC floor for a year aboard`}
                tone={habitat.minimumHeadroom >= habitat.headroomStandard ? 'pass' : 'fail'}
              />
              <Stat
                label="Fitout"
                value={fmt(habitat.totalFitoutMass)}
                unit="kg"
                note={`${fmt(habitat.arrangementMass)} kg carried`}
              />
            </StatGrid>
          </div>
          <Callout title="What the volume figure does not tell you">
            {habitat.findings.map((f) => (
              <p key={f}>{f}</p>
            ))}
          </Callout>
        </div>
      </Section>
    </Shell>
  )
}
