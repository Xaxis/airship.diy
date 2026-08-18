// Generate docs/OPERATIONS.md from the model.
//
// WHY THIS IS GENERATED AND NOT WRITTEN. An operating limit is a number the
// model computes, and a manual that restates it by hand is a manual that will
// eventually disagree with the vehicle. Every figure below comes from the same
// functions the tests call, so the day the propulsors change size the wind
// limits change with them.
//
// The PROSE is written here and the NUMBERS are interpolated. That is the right
// split: procedures are judgement and cannot be derived, limits are arithmetic
// and must not be typed twice.
import { writeFileSync } from 'node:fs'

import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  LANDING_TRIM,
  consumables,
  dumpableInventory,
  failureModes,
  massStatement,
  validateArrangement,
} from '../packages/model/dist/index.js'
import {
  atmosphere,
  ballastLoop,
  emergence,
  heaveResponse,
  hoverCapability,
  effectiveHeaveInertia,
  hullGeometry,
  hullShapeForPrismatic,
  navigationPolar,
  propulsorOut,
  superheatHeavinessExcursion,
  pure,
  vectoredControl,
  DRAG_COEFFICIENT_BOW_ON,
  SIDE_FORCE_COEFFICIENT_BEAM_ON,
} from '../packages/core/dist/index.js'
import { finPlanform } from '../packages/model/dist/index.js'

const design = BASELINE
const config = BASELINE_ARRANGEMENT
const mass = massStatement(design, config)
const shape = hullShapeForPrismatic(design.hull.prismaticCoefficient)
const hull = hullGeometry(design.hull.length, design.hull.finenessRatio, shape)
const seaLevel = atmosphere(0)
const fins = finPlanform(design, config)
const aboard = consumables(config)

const propulsors = config.propulsors
const installedPower = propulsors.reduce((s, p) => s + p.ratedPower, 0)
const discArea = propulsors.reduce((s, p) => s + (Math.PI * p.diameter ** 2) / 4, 0)
const effectiveDiameter = 2 * Math.sqrt(discArea / propulsors.length / Math.PI)
const ducted = propulsors.every((p) => p.ducted)

const hover = hoverCapability(
  propulsors.length,
  effectiveDiameter,
  installedPower,
  ducted,
  mass.total,
  LANDING_TRIM,
)
const out = propulsorOut(propulsors, LANDING_TRIM)
const control = vectoredControl(
  hover.staticThrust,
  mass.gasVolume,
  SIDE_FORCE_COEFFICIENT_BEAM_ON,
  DRAG_COEFFICIENT_BOW_ON,
)

const maxRadius = design.hull.length / design.hull.finenessRatio / 2
const lateralOffset = Math.max(...propulsors.map((p) => Math.abs(p.lateralOffset))) * maxRadius
const finSet = {
  verticalArea: fins.area / 2,
  momentArm:
    (config.finStation - mass.centreOfBuoyancy.x / design.hull.length) * design.hull.length,
  aspectRatio: fins.span ** 2 / (fins.area / 4),
  rudderChordFraction: config.rudderChordFraction,
}
const WATERLINE = 12
const polarAt = (wind) =>
  navigationPolar(
    hull,
    seaLevel,
    wind,
    hover.staticThrust,
    LANDING_TRIM,
    WATERLINE,
    propulsors.length,
    lateralOffset,
    finSet,
    config.centreboardArea,
  )

const GONDOLA_HEAVE_MASS = 4000
const WATERPLANE = 24
const SUSPENSION = 1e6
const ENVELOPE_INERTIA = effectiveHeaveInertia(mass.total, mass.gasVolume)

const excursion = superheatHeavinessExcursion(
  mass.seaLevelGrossLift,
  20,
  pure(design.gas.species),
  seaLevel,
  design.gas.seaLevelFillFraction,
)
const ballast = ballastLoop(excursion, LANDING_TRIM, design.loads.habitatPower)

/** @derived Draught at the landing trim, m. */
const seaLevelDraught = heaveResponse(4, GONDOLA_HEAVE_MASS, SUSPENSION, WATERPLANE, ENVELOPE_INERTIA, LANDING_TRIM).draught
const naturalPeriodAtFour = heaveResponse(4, GONDOLA_HEAVE_MASS, SUSPENSION, WATERPLANE, ENVELOPE_INERTIA, LANDING_TRIM).naturalPeriod
/** @derived Suspension design load, N: the gondola's weight at the water-impact factor. */
const suspensionDesign = GONDOLA_HEAVE_MASS * 9.80665 * 2.5

const modes = failureModes(design, config)
const findings = validateArrangement(design, config)

const n = (x, d = 0) =>
  x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const winds = [5, 8, 10, 12, 15]
const polarRows = winds
  .map((w) => {
    const p = polarAt(w)
    return `| ${w} | ${p.upwindSpeed.toFixed(1)} | ${((p.beamLeeway * 180) / Math.PI).toFixed(0)} | ${((p.widestUsefulHeading * 180) / Math.PI).toFixed(0)} |`
  })
  .join('\n')

const seaRows = [2, 3, 4, 5, 6]
  .map((code) => {
    const r = heaveResponse(code, GONDOLA_HEAVE_MASS, SUSPENSION, WATERPLANE, ENVELOPE_INERTIA, LANDING_TRIM)
    const e = emergence(code, LANDING_TRIM, GONDOLA_HEAVE_MASS, SUSPENSION, WATERPLANE, ENVELOPE_INERTIA)
    return `| ${code} | ${(r.waveAmplitude * 2).toFixed(2)} | ${r.wavePeriod.toFixed(1)} | ${r.frequencyRatio.toFixed(2)} | ${(r.quasiStaticLoad / 1000).toFixed(0)} to ${(r.fullImmersionLoad / 1000).toFixed(0)} | ${e.reentryVelocity.toFixed(2)} |`
  })
  .join('\n')

const failureRows = modes
  .map(
    (m) =>
      `| ${m.name} | ${m.severity} | ${m.detection.replace(/\|/g, '/')} | ${m.response.split('. ')[0]}. |`,
  )
  .join('\n')

const doc = `# Operating limits and procedures

GENERATED BY \`make operations\`. Do not edit: every number here comes from the
same functions the tests call, so the day the propulsors change size the wind
limits change with them. The prose lives in \`tools/generate-operations.mjs\`.

This is the document for somebody who has to fly the thing, not the argument for
building it. The reasoning is on the site; the limits are here.

## The vehicle

| | |
|---|---|
| Length | ${n(design.hull.length)} m at fineness ${design.hull.finenessRatio} |
| Envelope | ${n(mass.gasVolume)} m³, ${design.hull.cellCount} cells |
| Gross weight | ${n(mass.total)} kg |
| Gross lift | ${n(mass.grossLift)} kg |
| Lift margin | ${n(mass.liftMargin)} kg (${((mass.liftMargin / mass.grossLift) * 100).toFixed(1)} %) |
| Dumpable water ballast | ${n(dumpableInventory(config))} kg |
| Propulsion | ${propulsors.length} × ${effectiveDiameter.toFixed(1)} m ${ducted ? 'ducted' : 'open'}, ${n(installedPower / 1000)} kW |
| Food aboard | ${n(aboard.food)} kg |

## Trim

**Land at ${n(LANDING_TRIM)} kg heavy and no more.** That number is not about the
sea state. It is what THREE of the four propulsors can lift: ${n(out.remainingHeaviness)} kg.
A trim you can only leave with every unit running turns one failure into a
vehicle that cannot take off again.

All four lift ${n(hover.liftableHeaviness)} kg, which needs
${n(hover.powerAtTrim / 1000)} kW of the ${n(installedPower / 1000)} installed.

**Heavy is the safe direction.** Static heaviness is signed and positive means
heavy: a vehicle that drifts light leaves without you.

## Taking off and landing vertically

1. Trim to ${n(LANDING_TRIM)} kg heavy or less. Confirm from the tank gauges, not
   from the feel of the ship.
2. Tilt all four propulsors to vertical. Check the tilt feedback on each: a unit
   that has not tilted is a unit that will yaw you when you apply power.
3. Apply power symmetrically. The vehicle is slow: expect tens of seconds before
   anything happens, and do not chase it.
4. Above the surface, tilt forward progressively rather than in one movement.
   The wing makes lift that grows with the square of speed, so the trim changes
   as you accelerate.

**Going down is the same in reverse, with one rule: establish the hover well
above the surface, trim to near neutral, then descend at a rate you could arrest
in the height you have.** Added mass makes the vertical response about three
times more sluggish than the ship's own mass suggests; you are stopping the
displaced air as well as the vehicle.

## Wind limits

| Condition | Limit | Why |
|---|---|---|
| Holds itself bow-on | ${control.headwindHold.toFixed(0)} m/s | Vectored thrust at zero airspeed |
| Holds itself broadside | ${control.crosswindHold.toFixed(1)} m/s | The broadside force is an order of magnitude larger |
| Two people, bow-on | see the build chapter | Ground handling by hand |
| Two people, broadside | under 1 m/s | Do not attempt it |

**The vehicle must be free to weathervane at every moment it is on the surface,
and must never be held across the wind.** That is the whole marine and ground
survival strategy. It is safe in a gale on a mast and helpless in a breeze
across one.

## On the water

Boat mode is a cone, not a compass, and the cone is set by the centreboard.

| True wind, m/s | Upwind speed, m/s | Leeway at the beam, ° | Usable cone from dead upwind, ° |
|---|---|---|---|
${polarRows}

**Lower the centreboard before you try to hold any heading off the wind.** With
it up the vehicle points where the fins say and goes where the wind says: the
usable cone collapses to a few degrees and no amount of thrust recovers it,
because the speed through the water is the same either way.

**Above about 12 m/s of true wind, stop trying to navigate.** The upwind speed
has collapsed to a walking pace, the leeway has reached the point where the
heading means nothing, and the cone shuts. Stream the drogue, let the vehicle
weathervane, and go where the weather goes until it eases. That is not a
failure: it is the same decision a sailing vessel makes, and this one has the
option of flying away from it instead.

### Seakeeping

| Sea state | Hs, m | Period, s | Frequency ratio | Suspension load, kN | Re-entry, m/s |
|---|---|---|---|---|---|
${seaRows}

**The load is a bracket, not a number, and the reason is that the float leaves
the water.** rho g A is the restoring force of a continuously immersed float.
This one draws about ${(seaLevelDraught * 1000).toFixed(0)} mm, because the
vehicle is nearly neutrally buoyant, and the relative motion is hundreds. It is
clear of the surface for part of every cycle in every sea state, so the contact
is one-sided: water can push and it cannot pull. The low figure is the vehicle
following the surface, the high figure is the vehicle holding station while the
crest comes to it, and closing the gap needs a time-domain solve nobody has
written.

**Until then, size against the high figure and treat sea state 2 as the limit
for sitting on the water.** The suspension design load is
${(suspensionDesign / 1000).toFixed(0)} kN, which covers the upper bound at sea
state 2 and nothing above it.

**The resonance is in a SMOOTH sea, which is backwards from every intuition.**
The whole vehicle oscillates on the waterplane, not the gondola alone: the
suspension is stiff against the envelope's inertia at wave frequencies, so it
drags the envelope along and the heave period is
${naturalPeriodAtFour.toFixed(1)} s. Short waves excite that; long ones do not.
The vehicle rides a gale and is worst in a chop, and no suspension stiffness
puts the resonance below about half a metre of significant height.

The float comes clear of the water on every wave in every sea state and re-enters
at tenths of a metre per second. That is well under a seaplane, which arrives at
several, so it does not slam. It is not nothing either.

## The ballast loop

**Run it whenever you are on the surface in daylight.** Twenty kelvin of solar
superheat moves the lift by ${n(excursion)} kg against a ${n(LANDING_TRIM)} kg
trim: without the loop the vehicle takes itself off by mid-afternoon and presses
${(excursion / 1000).toFixed(1)} tonnes onto its gear before dawn.

| | |
|---|---|
| Bladder | ${ballast.tankVolume.toFixed(1)} m³ |
| Transfer rate | ${ballast.transferRate.toFixed(0)} kg/min |
| Pump power | ${ballast.pumpPower.toFixed(0)} W |
| Daily energy | ${(ballast.dailyEnergy / 3.6e6).toFixed(2)} kWh (${(ballast.shareOfHabitatLoad * 100).toFixed(2)} % of the habitat) |

The pump is sized for a clearing overcast rather than for the day, because the
envelope's thermal time constant is tens of minutes and the superheat arrives
with the sunshine.

**It works only afloat.** In the air there is nothing to pump from: ballast can
be dumped and not recovered, so in flight the trim is a decision you make before
you leave rather than a control you hold.

## Failures

| Mode | Severity | How you know | First action |
|---|---|---|---|
${failureRows}

**Dump the aft water tank first.** The pair sits forward of the centre of
buoyancy to balance the tail, so dumping both equally trims the ship nose-up.

## Gates

${findings.filter((f) => f.severity === 'fail').length === 0 ? 'Every gate passes at this design point.' : `FAILING: ${findings.filter((f) => f.severity === 'fail').map((f) => f.id).join(', ')}`}
${
  findings.filter((f) => f.severity === 'warn').length > 0
    ? `\nWarnings: ${findings
        .filter((f) => f.severity === 'warn')
        .map((f) => f.id)
        .join(', ')}.`
    : ''
}
`

const target = new URL('../docs/OPERATIONS.md', import.meta.url).pathname
writeFileSync(target, doc)
console.log(`wrote ${target} (${doc.split('\n').length} lines)`)
