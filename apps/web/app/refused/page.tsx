import {
  Callout,
  Prose,
  Section,
  Stat,
  StatGrid,
  fmt,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import { refused, wings, navigation } from '../../lib/model'

export const metadata = { title: 'Refused' }

export default function Page() {
  return (
    <Shell href="/refused">
      <Section
        title="A refusal written in prose stops being checked"
        lede="Each of these is a function that computes its own no from the same constants the rest of the model uses. If a storage technology improves or a material arrives, the answer changes by itself. That is the only kind of refusal worth recording, because the alternative is a paragraph that nobody re-reads when the world moves."
      >
        <ol className="space-y-4">
          {refused.map((r, i) => (
            <li
              key={r.id}
              className={`border-l-2 ${r.refused ? 'border-[var(--color-fail)]' : 'border-[var(--color-pass)]'} border-y border-r border-y-[var(--color-rule)] border-r-[var(--color-rule)] bg-[var(--color-panel)] p-5`}
            >
              <p className="flex items-baseline gap-3">
                <span className="num text-xs text-[var(--color-ink-faint)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className={`num text-xs uppercase tracking-wider ${r.refused ? 'text-[var(--color-fail)]' : 'text-[var(--color-pass)]'}`}
                >
                  {r.refused ? 'refused' : 'reopens'}
                </span>
              </p>
              <p className="mt-2 max-w-3xl font-medium">{r.requirement}</p>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
                {r.detail}
              </p>
              <div className="mt-4 border-t border-[var(--color-rule)] pt-3">
                <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                  What would reopen it
                </p>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
                  {r.whatWouldReopenIt}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="The one that is scale invariant"
        lede="Almost every no in engineering is a no at this size. This one is not, and that is what makes it worth writing down carefully."
      >
        <Callout tone="fail" title="Tank mass over gross lift does not mention the vehicle">
          <p className="num text-[var(--color-ink)]">
            tank mass / gross lift = [ρ<sub>H2</sub> / (ρ<sub>air</sub> − ρ<sub>H2</sub>)] × (1 −
            f) / f
          </p>
          <p>
            THE VOLUME CANCELS. Every term is a property of the gases and of the tank, and none is a
            property of the ship, so no size of ship changes the answer and neither does the choice
            of pressure once the storage fraction f is fixed. At ISA sea level the bracket is 0.0748.
          </p>
          <p>
            Break-even, where the tanks weigh exactly what the gas they hold would lift, needs f =
            6.96 percent by mass. The US Department of Energy&rsquo;s <em>ultimate</em> target for
            onboard hydrogen storage, the one nobody has met, is 6.5 percent. Production Type IV
            systems reach about 5.5.
          </p>
          <p>
            So the tanks to hold the lifting gas weigh more than the gas lifts, at every possible
            size of ship, for every storage system anyone has built or targeted. Venting instead is
            mass-free and costs about 150 days of re-electrolysing, which is a third of a year aloft
            for one trip on the water.
          </p>
        </Callout>
      </Section>

      <Section
        title="One of these caught me overclaiming"
        lede="The second refusal was written before it was computed, which is exactly the failure this repository exists to prevent, and it survived long enough to be committed."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout tone="unknown" title="What I wrote">
            <p>
              &ldquo;Pressurising a buoyant lobe destroys its buoyancy in exact proportion, so the
              wing requirement and the lift requirement pull in opposite directions.&rdquo;
            </p>
            <p>
              The proportionality is real. Raising the pressure inside a lobe raises the gas density
              by the same ratio, and the buoyancy falls with it. It reads like a clean kill.
            </p>
          </Callout>

          <Callout tone="pass" title="What the model said when it was made to compute it">
            <p>
              At the 2.5 kPa a lobe actually needs to hold its shape against this vehicle&rsquo;s
              airstream, the loss is <strong className="text-[var(--color-ink)]">0.18 percent</strong>
              . A few kilopascals is a few percent of an atmosphere, and a proportional loss on a
              small term is a small number.
            </p>
            <p>
              The mechanism that <em>does</em> cost lift is the one that gets confused with it: a
              ballonet. Reshaping a lobe by inflating air inside it displaces lifting gas one for one
              by volume, so a tenth of the volume is a tenth of the lift. Three orders of magnitude
              worse, and a different thing entirely.
            </p>
          </Callout>
        </div>

        <div className="mt-6">
          <Prose>
            <p>
              The test now asserts that the module does <em>not</em> refuse on buoyancy, which is the
              only way to stop the tidier and wronger version coming back. The idea still dies, on
              the structural objection: vectored thrust needs a member in compression and fabric has
              none, so a propulsor mount on a pressure-stabilised lobe is a local buckle waiting for
              a gust. That forces a rigid keel, and once there is a rigid keel the lobes are a
              heavier way to hold gas than cells in a frame.
            </p>
          </Prose>
        </div>
      </Section>

      <Section
        title="What survived instead"
        lede="Two of the three requirements were refused and the third was redirected. The redirection is the useful part."
      >
        <StatGrid columns={4}>
          <Stat
            label="Wings, not lobes"
            value={fmt(wings.span)}
            unit="m span"
            tone="pass"
            note={`${fmt(wings.bestPayload)} kg of extra payload at ${wings.bestSpeed.toFixed(0)} m/s`}
          />
          <Stat
            label="For a wing mass of"
            value={fmt(wings.mass)}
            unit="kg"
            note={`Net gain ${fmt(wings.netGain)} kg`}
          />
          <Stat
            label="Centreboard, not folding"
            value={fmt(navigation.centreboardArea)}
            unit="m²"
            tone="pass"
            note="Turns a 5° cone into the whole compass"
          />
          <Stat
            label="Wing station penalty"
            value={(wings.stationPenalty * 100).toFixed(1)}
            unit="%"
            tone="unknown"
            note="Of station-keeping power, every hour it is not carrying"
          />
        </StatGrid>

        <div className="mt-6">
          <Prose>
            <p>
              The requirement was for an envelope that is also a wing and that folds away to become a
              boat. Both halves are refused. What replaces them costs less and works: induced drag
              goes as span <em>squared</em> and not as area, so a real wing outboard of the hull is
              worth about ten times what fattening the envelope into lobes is worth, and a
              retractable board of {fmt(navigation.centreboardArea)} m² does what collapsing 32,000
              m³ of envelope was supposed to do.
            </p>
            <p>
              Neither is what was asked for. Both are what the arithmetic allows, and the difference
              between those two sentences is the whole value of building the model before building
              the vehicle.
            </p>
          </Prose>
        </div>
      </Section>
    </Shell>
  )
}
