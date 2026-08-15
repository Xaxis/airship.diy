import { RankedBars } from '../../components/RankedBars'
import { ShedScale } from '../../components/ShedScale'
import {
  Callout,
  DataTable,
  Prose,
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
import { arrangement, build, hullProfile } from '../../lib/model'

export const metadata = { title: 'Build' }

const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${fmt(n / 1e3)}k`)
const hours = (n: number) => `${fmt(n / 1000, 1)} kh`

export default function Page() {
  return (
    <Shell href="/build">
      <Section
        title="The answer on this page is no"
        lede="Every other page asks whether the vehicle works. This one asks whether it can exist, and it is the only chapter that ends in a refusal. The refusal is not about the airship."
      >
        <Callout tone="fail" title="Not buildable by one or two people as drawn">
          <p>{build.verdict}</p>
        </Callout>

        <div className="mt-6">
          <StatGrid columns={4}>
            <Stat
              label="Materials"
              value={usd(build.materialsTotal)}
              note={`${usd(build.materialsLow)} to ${usd(build.materialsHigh)}`}
            />
            <Stat
              label="The building"
              value={usd(build.facility.rigidHangarCost)}
              tone="fail"
              note={`${build.buildingMultiple.toFixed(1)}x everything that goes inside it`}
            />
            <Stat
              label="Labour"
              value={hours(build.labourHours)}
              note={`${build.yearsForTwo.toFixed(0)} years for two people, full time`}
            />
            <Stat
              label="Held broadside by two"
              value={build.handling.broadside.toFixed(2)}
              unit="m/s"
              tone="fail"
              note={`${(build.handling.broadside * 1.944).toFixed(1)} knots. Not a wind, a draught.`}
            />
          </StatGrid>
        </div>

        <div className="mt-8 grid gap-3 lg:grid-cols-2">
          {build.blockers.map((blocker) => {
            const [head, ...rest] = blocker.split('. ')
            return (
              <div
                key={blocker.slice(0, 24)}
                className="border-l-2 border-[var(--color-fail)] bg-[var(--color-panel)] p-4"
              >
                <p className="num text-xs tracking-wider text-[var(--color-fail)]">{head}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                  {rest.join('. ')}
                </p>
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        title="What it is made of"
        lede="Priced at what an individual is actually charged, in August 2026. Wholesale is not available to one person, and quoting it would flatter the largest line by a factor of seven."
      >
        <RankedBars
          items={build.lines.map((l) => ({
            id: l.id,
            label: l.name,
            value: l.cost,
            low: l.low,
            high: l.high,
            display: usd(l.cost),
            rangeDisplay: `${usd(l.low)} to ${usd(l.high)}`,
            annotation: `${fmt(l.quantity)} ${l.unit}`,
            note: `${fmt(l.quantity)} ${l.unit} at ${l.unitPrice < 10 ? l.unitPrice.toFixed(2) : fmt(l.unitPrice)} ${l.unitPriceUnit}. ${l.note}`,
          }))}
          caption="Quantities come from the same mass statement that sizes the ship, so the bill cannot describe a different vehicle from the one in the cutaway."
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Callout title="It is mostly surface, and surface is sold by the metre">
            <p>
              The intuition is that the powertrain is the expensive part. It is not. The three
              largest lines are {build.concentration.lines.join(', ').toLowerCase()}, together{' '}
              {pct(build.concentration.share, 0)} of the named subtotal, while the fuel cell, the
              electrolyzer and the battery come to less than a fifth between them.
            </p>
            <p>
              The whole vehicle is {usd(build.perKilogram)} per kilogram of gross weight. A business
              jet is about $1,500/kg and a cruising yacht about $50/kg, and an aerospace structure
              built out of retail materials belongs exactly where this lands.
            </p>
          </Callout>

          <Callout tone="unknown" title="The largest line has no published price">
            <p>
              Nobody lists a price for 15,000 m&sup2; of 0.21 kg/m&sup2; para-aramid and metallised
              PET airship cell laminate, because nobody has bought any this century. It is priced
              off a Dyneema composite sailcloth matched on areal mass, which is a proxy for how hard
              it is to make and not for what it does.
            </p>
            <p>
              The range on that one line spans a factor of six, which is wider than the gap between
              first place and fourth. A quotation from a barrier film converter is the single most
              valuable phone call anyone could make about this project.
            </p>
          </Callout>
        </div>

        <div className="mt-6">
          <DataTable
            head={
              <>
                <Th>Line</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">Unit price</Th>
                <Th align="right">Nominal</Th>
                <Th align="right">Low</Th>
                <Th align="right">High</Th>
              </>
            }
            caption={`Named lines total ${usd(build.namedSubtotal)}. A further ${usd(build.unnamedAllowance)} is allowed for everything not itemised: fasteners, wire, fittings, valves, plumbing, wiring, instruments, avionics, tooling and the several hundred things a build discovers.`}
            minWidth={720}
          >
            {build.lines.map((l) => (
              <Tr key={l.id}>
                <Td sans>{l.name}</Td>
                <Td align="right">
                  {fmt(l.quantity)} {l.unit}
                </Td>
                <Td align="right">
                  {l.unitPrice < 10 ? l.unitPrice.toFixed(2) : fmt(l.unitPrice)}{' '}
                  <span className="text-[var(--color-ink-faint)]">{l.unitPriceUnit}</span>
                </Td>
                <Td align="right">{usd(l.cost)}</Td>
                <Td align="right" tone="unknown">
                  {usd(l.low)}
                </Td>
                <Td align="right" tone="unknown">
                  {usd(l.high)}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </div>
      </Section>

      <Section
        title="How long it takes"
        lede="Two independent estimates: task by task from the areas and joint counts the model already knows, and hours per kilogram of empty weight from composite homebuilt aircraft, which is the only body of experience there is for a small number of people building an aircraft structure out of carbon in a shed."
      >
        <RankedBars
          items={build.tasks.map((t) => ({
            id: t.id,
            label: t.name,
            value: t.hours,
            low: t.low,
            high: t.high,
            display: hours(t.hours),
            rangeDisplay: `${hours(t.low)} to ${hours(t.high)}`,
            note: t.basis,
          }))}
          tone="unknown"
        />

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Task by task"
            value={hours(build.labourHours)}
            note={`${hours(build.labourLow)} to ${hours(build.labourHigh)}`}
          />
          <Stat
            label="Per kilogram cross check"
            value={hours(build.crossCheckHours)}
            tone={build.crossCheckAgrees ? 'pass' : 'fail'}
            note={`Ratio ${(build.labourHours / build.crossCheckHours).toFixed(2)}. ${build.crossCheckAgrees ? 'Two routes, one number.' : 'They disagree, so one is missing a task.'}`}
          />
          <Stat
            label="Two people, full time"
            value={build.yearsForTwo.toFixed(1)}
            unit="years"
            tone="fail"
            note="Full time is not what two people building in their own lives do"
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Callout title="Labour is per ply placed, not per part made">
            <p>
              A 1.5 mm frame wall is six plies of the fabric an individual can buy. Estimating the
              layup on the surface area of the finished part rather than on the area of ply actually
              cut, wetted, placed and debulked understates it by that factor, and it is the
              commonest way a composite build schedule goes wrong.
            </p>
            <p>
              The frame assembly line is worse and does not go away by buying anything: roughly{' '}
              {build.tasks.find((t) => t.id === 'frame-assemble')?.basis.match(/(\d+) thousand/)?.[1] ??
                '75'}{' '}
              thousand lattice joints, each fitted, jigged, bonded and inspected.
            </p>
          </Callout>

          <Callout tone="unknown" title="Calibrate against the only comparable programme">
            <p>
              Pathfinder 1 is 124 m against this hull&rsquo;s {fmt(hullProfile.length)} m. LTA
              Research began work at Moffett Field in 2017, in a hangar that already existed, with a
              professional workforce and funding from a Google founder, and first flew untethered on
              24 October 2024. Seven years.
            </p>
            <p>
              Any two-person schedule that comes out shorter than that is wrong, and this one does
              not: {build.yearsForTwo.toFixed(0)} years at hours nobody actually works, and roughly
              double that in evenings and weekends.
            </p>
          </Callout>
        </div>
      </Section>

      <Section
        title="Where you would do it"
        lede="A rigid airship is assembled indoors and cannot be assembled anywhere else. The frame is a lattice with no skin on it for most of the build and will not survive weather, and the finished hull is a sail that two people cannot hold in a breeze."
      >
        <ShedScale
          length={hullProfile.length}
          radii={hullProfile.radii}
          finStation={arrangement.fins.station}
          finSpan={arrangement.fins.span}
          clearLength={build.facility.clearLength}
          clearWidth={build.facility.clearWidth}
          clearHeight={build.facility.clearHeight}
          vehicleHeight={build.facility.vehicleHeight}
        />

        <div className="mt-6">
          <StatGrid columns={4}>
            <Stat
              label="Clear internal"
              value={`${build.facility.clearLength.toFixed(0)}×${build.facility.clearWidth.toFixed(0)}×${build.facility.clearHeight.toFixed(0)}`}
              unit="m"
              note={`${fmt(build.facility.floorArea)} m² of floor`}
            />
            <Stat
              label="Steel hangar"
              value={usd(build.facility.rigidHangarCost)}
              tone="fail"
              note="Escalated from the only costed airship hangar in the literature"
            />
            <Stat
              label="Complete base"
              value={usd(build.facility.completeBaseCost)}
              tone="fail"
              note="Hangar, mast, tractor, two mules, ballast and mooring circle"
            />
            <Stat
              label="Air supported"
              value={usd(build.facility.airSupportedCost)}
              tone="unknown"
              note="A quarter the price, and the blower must never stop"
            />
          </StatGrid>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Callout tone="fail" title="The airship is the cheap part">
            <p>
              {usd(build.materialsTotal)} of materials goes inside a{' '}
              {usd(build.facility.rigidHangarCost)} building, a factor of{' '}
              {build.buildingMultiple.toFixed(1)}. The long wall carries{' '}
              {(build.facility.lateralWindLoad / 1e6).toFixed(1)} MN at the 1926 Air Ministry design
              wind, and that load rather than the span is why airship sheds cost like cathedrals.
            </p>
            <p>
              You also cannot rent one. About six buildings of this size exist and every one of them
              is a museum, a film studio, or in use. The last purpose-built airship hangar cost EUR
              78 million and its owner went bankrupt before the ship flew.
            </p>
          </Callout>

          <Callout title="And 12 hectares outside it">
            <p>
              A moored airship weathervanes around its mast, so the entire riding-out circle must be
              clear and level: {build.facility.mooringCircleArea.toFixed(0)} hectares at the radius
              Akron and Macon used at Lakehurst. The 1926 Air Ministry standard asked for 800 yards
              square for a mast with no shed at all.
            </p>
            <p>
              This is what the water landing requirement buys back. A ship that never comes ashore
              needs no circle, no mules and no ground crew, and it weathervanes off a bow drogue by
              itself.
            </p>
          </Callout>
        </div>
      </Section>

      <Section
        title="And then you have to hold on to it"
        lede="The most counterintuitive result in the build chapter. This vehicle is safe in a gale and helpless in a breeze, and every ground operation has to be designed around that inversion."
      >
        <StatGrid columns={4}>
          <Stat
            label="Side area"
            value={fmt(build.handling.sideArea)}
            unit="m²"
            note="Hull profile plus the vertical fins"
          />
          <Stat
            label="Two people, broadside"
            value={build.handling.broadside.toFixed(2)}
            unit="m/s"
            tone="fail"
            note={`${(build.handling.broadside * 1.944).toFixed(1)} knots`}
          />
          <Stat
            label="Two people, bow on"
            value={build.handling.bowOn.toFixed(1)}
            unit="m/s"
            tone="pass"
            note={`${(build.handling.bowOn / build.handling.broadside).toFixed(0)}x better, and it is the whole case for a mast`}
          />
          <Stat
            label="Crew to hold it at the Navy limit"
            value={fmt(build.handling.unmechanisedCrew)}
            unit="people"
            tone="fail"
            note="The Navy used 18, with a mobile mast and two mechanical mules"
          />
        </StatGrid>

        <div className="mt-6">
          <ul className="space-y-3">
            {build.handling.findings.map((f) => (
              <li
                key={f.slice(0, 24)}
                className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-4 text-sm leading-relaxed text-[var(--color-ink-dim)]"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        title="What would change the answer"
        lede="A well-supported no is worth more than an optimistic yes, and it is only worth anything at all if it says where to push."
      >
        <ol className="space-y-3">
          {build.mitigations.map((mitigation, i) => {
            const [head, ...rest] = mitigation.split('. ')
            return (
              <li
                key={mitigation.slice(0, 24)}
                className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-4"
              >
                <p className="flex items-baseline gap-3">
                  <span className="num text-xs text-[var(--color-ink-faint)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="num text-xs tracking-wider text-[var(--color-accent)]">
                    {head}
                  </span>
                </p>
                <p className="mt-2 max-w-3xl pl-8 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                  {rest.join('. ')}
                </p>
              </li>
            )
          })}
        </ol>

        <div className="mt-8">
          <Prose>
            <p>
              None of those four makes this a two-person build. The first one is still worth doing
              on its own terms: buying the frame members instead of laminating them is cheaper per
              kilogram than the fabric once the resin, the consumables, the oven and the hours are
              counted, and the bought tube arrives at nearly double the modulus because it was cured
              in a heated die at a fibre volume fraction no hand layup reaches.
            </p>
            <p>
              The second is the reason the water landing requirement is in the brief at all. It is
              not a feature bolted on to a flying machine. It is what replaces{' '}
              {usd(build.facility.completeBaseCost - build.facility.rigidHangarCost)} of ground
              equipment and the crew to work it.
            </p>
            <p>
              The third is the only route that removes the building, and it is a real proposal with
              a real weather risk rather than a way of avoiding the conclusion. The fourth is the
              honest one: everything on this page scales, and the endurance figure is what a smaller
              ship gives up.
            </p>
          </Prose>
        </div>
      </Section>
    </Shell>
  )
}
