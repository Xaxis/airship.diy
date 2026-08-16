import { Diagnostics } from '../../components/Diagnostics'
import {
  Rule,
  Section,
  Stat,
  fmt,
  pct,
  Callout,
  DataTable,
  Th,
  Td,
  Tr,
  StatGrid,
} from '../../components/site/primitives'
import { Shell } from '../../components/site/Shell'
import {
  diagnostics,
  fleet,
  massFractionExponents,
  massFractionTable,
  structuralBenchmark,
  structuralScaling,
  frame,
} from '../../lib/model'

export const metadata = { title: 'Structure' }

export default function Page() {
  return (
    <Shell href="/structure">
      <Section
        title="Can it be built?"
        lede="Empty weight scaled from the Hindenburg, across the range of structural scaling exponents the historical record cannot distinguish between. This is deliberately a family of curves: one curve would be a claim the evidence does not support, and the two ends disagree about whether bigger ships are better or worse."
      >
        <div className="scroll-x border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="px-4 py-3 font-normal">Envelope volume</th>
                {massFractionExponents.map((e) => (
                  <th key={e} className="num px-4 py-3 text-right font-normal">
                    n = {e.toFixed(2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {massFractionTable.map((row) => (
                <tr key={row.volume} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="num px-4 py-3">{fmt(row.volume)} m³</td>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.exponent}
                      className={`num px-4 py-3 text-right ${
                        cell.infeasible
                          ? 'text-[var(--color-fail)]'
                          : cell.emptyWeightFraction > 0.7
                            ? 'text-[var(--color-unknown)]'
                            : 'text-[var(--color-pass)]'
                      }`}
                    >
                      {(cell.emptyWeightFraction * 100).toFixed(0)}%{cell.infeasible ? ' ✕' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
          ✕ marks a hull that cannot lift its own empty weight. All exponents agree at 200,000 m³
          because that is the Hindenburg, where the scaling is anchored.
        </p>

        <div className="mt-6 border-l-2 border-[var(--color-unknown)] bg-[var(--color-panel)] p-5">
          <h3 className="font-medium">Undecided, and the record cannot settle it</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            Fitting all eight rigids with published figures gives an exponent of{' '}
            <span className="num text-[var(--color-ink)]">
              {structuralScaling.allShipsExponent}
            </span>{' '}
            at R² ={' '}
            <span className="num text-[var(--color-ink)]">{structuralScaling.allShipsRSquared}</span>
            , which would mean the baseline closes comfortably and that mass fraction gets{' '}
            <em>worse</em> with size, not better. Restrict to the five best-sourced ships, whose
            volumes span only 1.41 to 1, and the fit collapses to{' '}
            <span className="num text-[var(--color-ink)]">
              {structuralScaling.bestSourcedExponent}
            </span>{' '}
            at R² ={' '}
            <span className="num text-[var(--color-ink)]">
              {structuralScaling.bestSourcedRSquared}
            </span>
            . The scatter from gas choice, structural material and national design philosophy is
            about 30 percentage points, which swamps any size trend over that range.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
            At the theoretical square-cube value the baseline ship cannot lift its own empty weight.
            A model that quietly picked the favourable end would report a comfortable design where
            the truth is a coin flip.
          </p>
        </div>

        <div className="mt-8 scroll-x border border-[var(--color-rule)] bg-[var(--color-panel)]">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-rule)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="px-4 py-3 font-normal">Every rigid with published figures</th>
                <th className="px-4 py-3 font-normal">Gas</th>
                <th className="px-4 py-3 font-normal">Structure</th>
                <th className="px-4 py-3 text-right font-normal">Empty weight fraction</th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((ship) => (
                <tr key={ship.id} className="border-b border-[var(--color-rule)] last:border-0">
                  <td className="px-4 py-3">
                    {ship.name}
                    <span className="num ml-2 text-xs text-[var(--color-ink-faint)]">{ship.year}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-dim)]">{ship.liftingGas}</td>
                  <td
                    className={`px-4 py-3 ${
                      ship.material === 'stainless steel'
                        ? 'text-[var(--color-fail)]'
                        : 'text-[var(--color-ink-dim)]'
                    }`}
                  >
                    {ship.material}
                  </td>
                  <td className="num px-4 py-3 text-right">{pct(ship.emptyWeightFraction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-ink-faint)]">
          Structural material moves the fraction by 9.5 points at constant size, year and
          specification: R100 in duralumin against R101 in stainless steel, both built to the same
          Air Ministry requirement in the same year. That is larger than any size effect in the
          dataset, which is why the material choice decides the mass fraction and the hull size does
          not.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Brief's cited benchmark"
            value={pct(structuralBenchmark.briefCited)}
            note="USS Macon, but this is whole fixed weight, not structure"
          />
          <Stat
            label="Macon on hydrogen-equivalent lift"
            value={pct(structuralBenchmark.maconOnHydrogenEquivalent)}
            note="a third of the apparent gap is gas choice"
          />
          <Stat
            label="The real target"
            value={pct(structuralBenchmark.target)}
            tone="unknown"
            note="LZ-129 Hindenburg on an ISA basis, 1936, duralumin"
          />
        </div>
      </Section>

      <Rule />

      <Section
        title="Diagnostics"
        lede="The curves the design actually turns on. Shear and bending moment are drawn as two charts sharing an axis rather than one chart with two scales, because newtons and newton metres are not comparable heights and putting them on one plot invites a reading that means nothing."
      >
        <Diagnostics
          powerCurve={diagnostics.powerCurve}
          holdingCurve={diagnostics.holdingCurve}
          cutoffWind={diagnostics.cutoffWind}
          designWind={diagnostics.designWind}
          hullLength={diagnostics.hullLength}
          beam={diagnostics.beam}
        />
      </Section>

      <Rule />

      <Section
        title="The frame, member by member"
        lede="Everywhere else the frame mass is a scaling estimate: the Hindenburg's framework share of empty weight, corrected for carbon. That sizes a concept, and it is not a structure. This sizes the actual members against the gust moment and the buckling allowable, and then compares the two."
      >
        <Callout title="The laminate you can actually lay up" tone="unknown">
          <p>{frame.material.note}</p>
          <p>
            Leaving the vacuum bag off costs a further {pct(frame.withoutVacuumBag.penalty, 0)} of
            compressive strength. The bag is not optional, and this is the number that says so.
          </p>
        </Callout>

        <div className="mt-4">
          <StatGrid columns={5}>
            <Stat
              label="Fibre volume"
              value={pct(frame.material.fibreVolumeFraction, 0)}
              note="57.4% for prepreg autoclave"
            />
            <Stat label="Voids" value={pct(frame.material.voidContent, 1)} note="under 1% prepreg" />
            <Stat
              label="Compressive"
              value={fmt(frame.material.compressiveStrength / 1e6)}
              unit="MPa"
              note={`${pct(frame.material.prepregFraction, 0)} of prepreg`}
            />
            <Stat label="Modulus" value={fmt(frame.material.modulus / 1e9)} unit="GPa" />
            <Stat
              label="Ply thickness"
              value={(frame.material.plyThickness * 1000).toFixed(2)}
              unit="mm"
              note="from 200 g/m² twill"
            />
          </StatGrid>
        </div>

        <div className="mt-8">
          <DataTable
            minWidth={860}
            head={
              <>
                <Th>Longitudinals</Th>
                <Th align="right">Bay</Th>
                <Th align="right">a/s</Th>
                <Th align="right">Section</Th>
                <Th align="right">Plies</Th>
                <Th align="right">Allowable</Th>
                <Th align="right">Reserve</Th>
                <Th align="right">Frame mass</Th>
              </>
            }
            caption={`Every configuration lands on the four ply minimum practical laminate. THE HULL GIRDER MOMENT DOES NOT SIZE THIS FRAME: what you can lay up does, so each of these masses is a floor rather than an estimate. a/s is the panel aspect ratio, ring spacing over longitudinal spacing, and it is the invariant R38 violated: every rigid airship that did not break sat between 1.31 and 1.81, and R38 was at 4.59 when it broke in half on acceptance trials killing 44. More longitudinals demand SHORTER bays to stay in band, which is why the mass climbs so fast: the rings outweigh the longitudinals by more than two to one.`}
          >
            {frame.schedules.map((s) => (
              <Tr key={`${s.longitudinals}-${s.spacing}`}>
                <Td sans>
                  {s.longitudinals}
                  {s === frame.chosen ? (
                    <span className="ml-2 text-xs text-[var(--color-accent)]">chosen</span>
                  ) : null}
                </Td>
                <Td align="right">{s.spacing} m</Td>
                <Td
                  align="right"
                  tone={
                    s.panelAspectRatio >= 1.31 && s.panelAspectRatio <= 1.81 ? 'pass' : 'fail'
                  }
                >
                  {s.panelAspectRatio.toFixed(2)}
                </Td>
                <Td align="right">
                  {(s.diameter * 1000).toFixed(0)} × {(s.wall * 1000).toFixed(1)} mm
                </Td>
                <Td align="right" tone={s.minimumGauge ? 'unknown' : 'ink'}>
                  {s.plies}
                </Td>
                <Td align="right">{fmt(s.allowable / 1e6)} MPa</Td>
                <Td align="right">{s.reserveFactor.toFixed(1)}×</Td>
                <Td align="right">{fmt(s.totalMass)} kg</Td>
              </Tr>
            ))}
          </DataTable>
        </div>

        <div className="mt-6">
          <Callout
            title="Two routes to the frame mass, and they do not agree"
            tone={frame.agreement.agrees ? 'pass' : 'unknown'}
          >
            <p>{frame.agreement.verdict}</p>
          </Callout>
        </div>
      </Section>
    </Shell>
  )
}
