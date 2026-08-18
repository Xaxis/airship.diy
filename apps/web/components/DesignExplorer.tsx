'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { kg, m, N, W } from '@airship/units'
import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  LANDING_TRIM,
  consumables,
  finPlanform,
  massStatement,
  wingSizing,
} from '@airship/model'
import type { DesignPoint } from '@airship/model'
import {
  atmosphere,
  benchmark,
  hoverCapability,
  hullGeometry,
  hullShapeForPrismatic,
  massFractionAt,
  navigationPolar,
  propulsorOut,
} from '@airship/core'
import {
  energyBalance,
  integrateMission,
  maximumSustainableWind,
  minimumFinAreaForStability,
} from '@airship/solvers'

/**
 * The design explorer.
 *
 * The brief's first priority for the site: every parameter adjustable, with
 * instant recomputation, and infeasible regions VISIBLY infeasible rather than
 * silently wrong.
 *
 * It runs the same solvers as the reports and the tests. A hull length change
 * costs about 300 ms because the solar year has to be integrated again from
 * scratch, and the wind sweep another 700 ms on top; everything else is cached
 * and lands in tens of milliseconds. React's deferred value keeps the sliders
 * responsive while that happens rather than dropping frames, and the panel dims
 * while a result is stale so no number is ever presented as current when it is
 * not.
 */

interface Knob {
  readonly key: string
  readonly group: string
  readonly label: string
  readonly min: number
  readonly max: number
  readonly stepSize: number
  readonly unit: string
  readonly format?: (n: number) => string
  readonly note?: string
}

const KNOBS: readonly Knob[] = [
  {
    key: 'length',
    group: 'Hull',
    label: 'Hull length',
    min: 45,
    max: 140,
    stepSize: 1,
    unit: 'm',
  },
  {
    key: 'finenessRatio',
    group: 'Hull',
    label: 'Fineness ratio',
    min: 3.5,
    max: 7.5,
    stepSize: 0.1,
    unit: '',
    note: 'drag optimum 4.5 to 6',
  },
  {
    key: 'cellCount',
    group: 'Hull',
    label: 'Gas cells',
    min: 4,
    max: 20,
    stepSize: 1,
    unit: '',
    note: 'more cells, more permeating area',
  },
  {
    key: 'wingSpan',
    group: 'Wing',
    label: 'Wing span',
    min: 0,
    max: 70,
    stepSize: 1,
    unit: 'm',
    note: 'the span inside the hull is carry-through, not lift',
  },
  {
    key: 'wingArea',
    group: 'Wing',
    label: 'Wing area',
    min: 0,
    max: 420,
    stepSize: 10,
    unit: 'm²',
  },
  {
    key: 'propulsorDiameter',
    group: 'Propulsion',
    label: 'Propulsor diameter',
    min: 2,
    max: 9,
    stepSize: 0.5,
    unit: 'm',
    note: 'static thrust goes as the 4/3 power of it',
  },
  {
    key: 'landingTrim',
    group: 'Propulsion',
    label: 'Landing trim',
    min: 100,
    max: 2500,
    stepSize: 50,
    unit: 'kg heavy',
    note: 'must survive one propulsor failing',
  },
  {
    key: 'centreboardArea',
    group: 'Water',
    label: 'Centreboard',
    min: 0,
    max: 30,
    stepSize: 0.5,
    unit: 'm²',
    note: 'decides the whole navigable cone',
  },
  {
    key: 'wind',
    group: 'Mission',
    label: 'Station-keeping wind',
    min: 0,
    max: 22,
    stepSize: 0.5,
    unit: 'm/s',
  },
  {
    key: 'dutyCycle',
    group: 'Mission',
    label: 'Holding station',
    min: 0,
    max: 1,
    stepSize: 0.05,
    unit: '',
    format: (n) => `${(n * 100).toFixed(0)}% of the day`,
  },
  {
    key: 'latitude',
    group: 'Mission',
    label: 'Latitude',
    min: 0,
    max: 50,
    stepSize: 1,
    unit: '°',
  },
  {
    key: 'clearSky',
    group: 'Mission',
    label: 'Clear-sky fraction',
    min: 0.25,
    max: 1,
    stepSize: 0.01,
    unit: '',
    note: '0.68 in the trade winds',
  },
  {
    key: 'habitat',
    group: 'Mission',
    label: 'Habitat load',
    min: 200,
    max: 2500,
    stepSize: 50,
    unit: 'W',
  },
]

const GROUPS = ['Hull', 'Wing', 'Propulsion', 'Water', 'Mission'] as const

type Knobs = Record<string, number>

const INITIAL: Knobs = {
  length: BASELINE.hull.length,
  finenessRatio: BASELINE.hull.finenessRatio,
  cellCount: BASELINE.hull.cellCount,
  wingSpan: BASELINE_ARRANGEMENT.wingSpan,
  wingArea: BASELINE_ARRANGEMENT.wingArea,
  // The EQUAL-DISC-AREA diameter, not the first unit's. The baseline mixes 6 m
  // and 5 m units, and one slider has to stand for both: seeding it from the
  // larger one would make the explorer disagree with the rest of the site about
  // what the same vehicle can lift.
  propulsorDiameter:
    2 *
    Math.sqrt(
      BASELINE_ARRANGEMENT.propulsors.reduce((s, p) => s + p.diameter ** 2, 0) /
        BASELINE_ARRANGEMENT.propulsors.length /
        4,
    ),
  landingTrim: LANDING_TRIM,
  centreboardArea: BASELINE_ARRANGEMENT.centreboardArea,
  wind: BASELINE.mission.stationKeepingWind,
  dutyCycle: BASELINE.mission.stationKeepingDutyCycle,
  latitude: (BASELINE.mission.latitude * 180) / Math.PI,
  clearSky: BASELINE.mission.clearSkyFraction,
  habitat: BASELINE.loads.habitatPower,
}

/** The scaling exponents the historical record cannot distinguish between. */
const EXPONENTS = [1.13, 1.0, 0.9, 0.8, 2 / 3]

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

export function DesignExplorer() {
  const [knobs, setKnobs] = useState<Knobs>(INITIAL)
  const deferred = useDeferredValue(knobs)
  const stale = deferred !== knobs

  const result = useMemo(() => {
    const design: DesignPoint = {
      ...BASELINE,
      hull: {
        ...BASELINE.hull,
        length: deferred['length'] ?? BASELINE.hull.length,
        finenessRatio: deferred['finenessRatio'] ?? BASELINE.hull.finenessRatio,
        cellCount: Math.round(deferred['cellCount'] ?? BASELINE.hull.cellCount),
      },
      loads: { ...BASELINE.loads, habitatPower: deferred['habitat'] ?? 900 },
      mission: {
        ...BASELINE.mission,
        stationKeepingWind: deferred['wind'] ?? 8,
        stationKeepingDutyCycle: deferred['dutyCycle'] ?? 0.65,
        latitude: ((deferred['latitude'] ?? 15) * Math.PI) / 180,
        clearSkyFraction: deferred['clearSky'] ?? 0.68,
      },
    }

    const shape = hullShapeForPrismatic(design.hull.prismaticCoefficient)
    const hull = hullGeometry(design.hull.length as never, design.hull.finenessRatio, shape)
    const energy = energyBalance(design)
    const maxWind = maximumSustainableWind(design)
    const mission = integrateMission(
      design,
      // What is actually aboard, from the arrangement's own stores bays. An
      // integrator fed a guess reports an endurance for a vehicle nobody built.
      consumables(BASELINE_ARRANGEMENT),
      design.loads.habitatPower,
    )

    const finArm = design.hull.length * 0.42
    const finArea = minimumFinAreaForStability(hull, finArm, 2.8)

    const massFractions = EXPONENTS.map((exponent) => massFractionAt(hull.volume, exponent))

    // ------------------------------------------------ the four new levers
    // These live in the ARRANGEMENT rather than the design point, because they
    // are things bolted to the hull rather than properties of it.
    const diameter = deferred['propulsorDiameter'] ?? 5.5
    const trim = deferred['landingTrim'] ?? LANDING_TRIM
    const config = {
      ...BASELINE_ARRANGEMENT,
      wingSpan: deferred['wingSpan'] ?? 40,
      wingArea: deferred['wingArea'] ?? 200,
      centreboardArea: deferred['centreboardArea'] ?? 18,
      propulsors: BASELINE_ARRANGEMENT.propulsors.map((p) => ({
        ...p,
        diameter,
      })),
    }
    const mass = massStatement(design, config)
    const power = config.propulsors.reduce((s, p) => s + p.ratedPower, 0)
    const hover = hoverCapability(
      config.propulsors.length,
      diameter,
      W(power),
      config.propulsors.every((p) => p.ducted),
      kg(mass.total),
      trim,
    )
    const out = propulsorOut(config.propulsors, trim)

    const hullWidth = design.hull.length / design.hull.finenessRatio
    const seaLevel = atmosphere(m(0))
    // From the model, so the wing here is the wing the mass statement carries.
    const { wing, payload: envelope } = wingSizing(design, config)

    const fitted = finPlanform(design, config)
    const maxRadius = hullWidth / 2
    const lateralOffset =
      Math.max(...config.propulsors.map((p) => Math.abs(p.lateralOffset))) * maxRadius
    const polar = navigationPolar(
      hull,
      seaLevel,
      10,
      N(hover.staticThrust),
      kg(trim),
      m(12),
      config.propulsors.length,
      m(lateralOffset),
      // The fins actually FITTED, not the minimum for stability. Those are
      // different quantities and the readout below reports the minimum: feeding
      // it here would model a vehicle with half the tail it has, and the cone
      // this returns is set by how hard the tail weathervanes against the
      // differential thrust.
      {
        verticalArea: fitted.area / 2,
        momentArm:
          (config.finStation - mass.centreOfBuoyancy.x / design.hull.length) * design.hull.length,
        aspectRatio: fitted.span ** 2 / (fitted.area / 4),
      },
      config.centreboardArea,
    )

    return {
      design,
      hull,
      energy,
      maxWind,
      mission,
      finArea,
      massFractions,
      hover,
      out,
      wing,
      envelope,
      polar,
      trim,
      installedPower: power,
    }
  }, [deferred])

  const {
    hull,
    energy,
    maxWind,
    mission,
    finArea,
    massFractions,
    hover,
    out,
    wing,
    envelope,
    polar,
    trim,
    installedPower,
  } = result
  const feasibleCount = massFractions.filter((m) => !m.infeasible).length

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      {/* ------------------------------------------------------ the knobs */}
      <div className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group} className="space-y-4">
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              {group}
            </div>
            {KNOBS.filter((k) => k.group === group).map((knob) => {
              const value = knobs[knob.key] ?? 0
              return (
                <label key={knob.key} className="block">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm">{knob.label}</span>
                    <span className="num shrink-0 text-sm text-[var(--color-accent)]">
                      {knob.format
                        ? knob.format(value)
                        : `${fmt(value, knob.stepSize < 1 ? 2 : 0)}${knob.unit ? ` ${knob.unit}` : ''}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={knob.min}
                    max={knob.max}
                    step={knob.stepSize}
                    value={value}
                    onChange={(e) =>
                      setKnobs((k) => ({
                        ...k,
                        [knob.key]: Number(e.target.value),
                      }))
                    }
                    className="mt-2 w-full accent-[var(--color-accent)]"
                  />
                  {knob.note ? (
                    <div className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
                      {knob.note}
                    </div>
                  ) : null}
                </label>
              )
            })}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setKnobs(INITIAL)}
          className="w-full border border-[var(--color-rule)] px-3 py-2 text-sm text-[var(--color-ink-dim)] hover:border-[var(--color-rule-bright)] hover:text-[var(--color-ink)]"
        >
          Reset to baseline
        </button>
      </div>

      {/* ---------------------------------------------------- the results */}
      <div
        className={`space-y-4 transition-opacity duration-150 ${stale ? 'opacity-40' : 'opacity-100'}`}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Readout label="Envelope volume" value={`${fmt(hull.volume)} m³`} />
          <Readout label="Gross lift" value={`${fmt(energy.grossLiftAvailable / 1000, 1)} t`} />
          <Readout label="Array area" value={`${fmt(energy.arrayArea)} m²`} />
          <Readout
            label="Array mass"
            value={`${fmt(energy.arrayMass)} kg`}
            tone={energy.arrayMass > energy.grossLiftAvailable * 0.25 ? 'fail' : 'ink'}
          />
        </div>

        {/* the three verdicts */}
        <div className="grid gap-2 sm:grid-cols-3">
          <Verdict
            label="Energy, Regime A"
            pass={energy.closes}
            headline={energy.closes ? 'CLOSES' : 'DOES NOT CLOSE'}
            detail={`${(energy.annualMargin * 100).toFixed(0)}% annual, worst day ${(energy.worstDayMargin * 100).toFixed(0)}%`}
          />
          <Verdict
            label="Structure"
            pass={feasibleCount === EXPONENTS.length}
            partial={feasibleCount > 0 && feasibleCount < EXPONENTS.length}
            headline={
              feasibleCount === EXPONENTS.length
                ? 'CLOSES AT EVERY EXPONENT'
                : feasibleCount === 0
                  ? 'CANNOT LIFT ITSELF'
                  : `CLOSES AT ${feasibleCount} OF ${EXPONENTS.length}`
            }
            detail="the record cannot say which exponent applies"
          />
          <Verdict
            label="Endurance"
            pass={mission.physicalEnduranceDays >= 365}
            headline={`${fmt(mission.physicalEnduranceDays)} days`}
            detail={`physical limit: ${mission.physicalLimit}`}
          />
        </div>

        {/* mass fraction across the exponent range */}
        <div className="border border-[var(--color-rule)] bg-[var(--color-panel)] p-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Empty weight fraction, across the scaling exponents the record cannot distinguish
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {massFractions.map((mf) => (
              <div key={mf.exponent} className="text-center">
                <div className="num text-[11px] text-[var(--color-ink-faint)]">
                  n = {mf.exponent.toFixed(2)}
                </div>
                <div
                  className={`num mt-1 text-lg ${
                    mf.infeasible
                      ? 'text-[var(--color-fail)]'
                      : mf.emptyWeightFraction > 0.7
                        ? 'text-[var(--color-unknown)]'
                        : 'text-[var(--color-pass)]'
                  }`}
                >
                  {(mf.emptyWeightFraction * 100).toFixed(0)}%
                </div>
                {mf.infeasible ? (
                  <div className="text-[10px] text-[var(--color-fail)]">cannot fly</div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-[var(--color-rule)] pt-3 text-xs text-[var(--color-ink-faint)]">
            Benchmark to beat: {(benchmark().target * 100).toFixed(1)}%, LZ-129 Hindenburg on an ISA
            basis, the best any large rigid ever achieved.
          </div>
        </div>

        {/* what the wing, the propulsors and the centreboard buy */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Readout
            label="Vertical landing"
            value={`${fmt(out.remainingHeaviness)} kg`}
            tone={out.stillLands ? 'pass' : 'fail'}
            note={
              out.stillLands
                ? `three of four, against a ${fmt(trim)} kg trim`
                : `three of four cannot lift the ${fmt(trim)} kg trim`
            }
          />
          <Readout
            label="Hover power"
            value={`${(hover.powerAtTrim / 1000).toFixed(0)} kW`}
            tone={hover.powerAtTrim <= installedPower ? 'pass' : 'fail'}
            note={`of ${(installedPower / 1000).toFixed(0)} kW installed`}
          />
          <Readout
            label="Wing payload"
            value={`+${fmt(envelope.bestPayload)} kg`}
            tone={envelope.bestPayload > wing.mass ? 'pass' : 'fail'}
            note={`at ${envelope.bestSpeed.toFixed(0)} m/s, for ${fmt(wing.mass)} kg of wing`}
          />
          <Readout
            label="Navigable cone"
            value={`${((polar.widestUsefulHeading * 180) / Math.PI).toFixed(0)}°`}
            tone={polar.widestUsefulHeading > 0.5 ? 'pass' : 'fail'}
            note={`in 10 m/s, upwind at ${polar.upwindSpeed.toFixed(1)} m/s`}
          />
        </div>

        {/* the operational numbers */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Readout
            label="Max sustainable wind"
            value={`${maxWind.toFixed(1)} m/s`}
            tone={maxWind < (deferred['wind'] ?? 8) ? 'fail' : 'pass'}
            note={`${(maxWind * 1.94384).toFixed(0)} kt`}
          />
          <Readout
            label="Station-keeping power"
            value={`${(energy.stationKeepingPower / 1000).toFixed(1)} kW`}
            note="cubic in wind speed"
          />
          <Readout
            label="Annual gas loss"
            value={`${(energy.annualLeakFraction * 100).toFixed(2)}%`}
            tone={energy.annualLeakFraction > 0.05 ? 'fail' : 'pass'}
            note={`${energy.dailyHydrogenLeak.toFixed(2)} kg/day`}
          />
          <Readout
            label="Minimum fin area"
            value={`${fmt(finArea)} m²`}
            note="independent of speed"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Readout
            label="Water surplus"
            value={`${fmt(mission.waterBalance.dailyNet)} kg/day`}
            tone={mission.waterBalance.dailyNet > 0 ? 'pass' : 'fail'}
            note={`catchment covers loss ${fmt(mission.waterBalance.catchmentMargin)}×`}
          />
          <Readout
            label="Station keeping share"
            value={`${(
              (energy.propulsionEnergy /
                (energy.propulsionEnergy + energy.habitatEnergy + energy.liftMakeupEnergy)) *
              100
            ).toFixed(0)}%`}
            note="of annual demand"
          />
          <Readout
            label="Lift makeup share"
            value={`${(
              (energy.liftMakeupEnergy /
                (energy.propulsionEnergy + energy.habitatEnergy + energy.liftMakeupEnergy)) *
              100
            ).toFixed(1)}%`}
            note="smaller than anyone expects"
          />
          <Readout
            label="Wetted area"
            value={`${fmt(hull.wettedArea)} m²`}
            note={`Cw ${hull.wettedAreaCoefficient.toFixed(2)}`}
          />
        </div>

        <p className="text-xs leading-relaxed text-[var(--color-ink-faint)]">
          Every figure recomputed by the same solvers the tests and the reports use. A hull length
          change costs about 300 ms because the solar year is integrated again from scratch, so the
          panel dims while a result is stale rather than showing a number that is no longer current.
        </p>
      </div>
    </div>
  )
}

function Readout({
  label,
  value,
  note,
  tone = 'ink',
}: {
  label: string
  value: string
  note?: string
  tone?: 'ink' | 'pass' | 'fail'
}) {
  const colour = {
    ink: 'text-[var(--color-ink)]',
    pass: 'text-[var(--color-pass)]',
    fail: 'text-[var(--color-fail)]',
  }[tone]

  return (
    <div className="border border-[var(--color-rule)] bg-[var(--color-panel)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        {label}
      </div>
      <div className={`num mt-1 ${colour}`}>{value}</div>
      {note ? <div className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">{note}</div> : null}
    </div>
  )
}

function Verdict({
  label,
  pass,
  partial,
  headline,
  detail,
}: {
  label: string
  pass: boolean
  partial?: boolean
  headline: string
  detail: string
}) {
  const tone = pass
    ? 'border-[var(--color-pass)] text-[var(--color-pass)]'
    : partial
      ? 'border-[var(--color-unknown)] text-[var(--color-unknown)]'
      : 'border-[var(--color-fail)] text-[var(--color-fail)]'

  return (
    <div className={`border-l-2 bg-[var(--color-panel)] px-4 py-3 ${tone}`}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        {label}
      </div>
      <div className="num mt-1 text-sm">{headline}</div>
      <div className="mt-1 text-[11px] text-[var(--color-ink-faint)]">{detail}</div>
    </div>
  )
}
