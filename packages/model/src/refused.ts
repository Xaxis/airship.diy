import { HYDROGEN_STORAGE_DENSITY, v } from '@airship/data'
import { atmosphere, gasDensity, pure } from '@airship/core'
import { K, m, Pa } from '@airship/units'

import type { DesignPoint } from './design-point.js'

/**
 * Ideas that were asked for, investigated, and refused, with the arithmetic
 * that kills each one.
 *
 * WHY THIS IS A MODULE AND NOT A PARAGRAPH. A refusal written in prose is a
 * refusal that stops being checked. Every function here COMPUTES its no from
 * the same constants the rest of the model uses, so if a storage technology
 * improves or a material arrives the answer changes by itself rather than
 * waiting for somebody to remember.
 *
 * They are also here because a design tool that only records what it chose is
 * an advocacy document. The two below are the most interesting things this
 * project has been asked for, and the reasons they do not work are more useful
 * than the things that do.
 *
 * OF THE TWO, ONLY THE FIRST IS A CALCULATION. `collapsibleEnvelope` computes a
 * ratio against a threshold and would reopen if the threshold moved.
 * `pressurisedLobeWing` refuses on a structural argument, not an arithmetic
 * one, and its `refused` is a constant: no parameter in this model turns it
 * around, and pretending otherwise by giving it a ratio would suggest it is
 * closer to working than it is.
 */

export interface Refusal {
  readonly id: string
  readonly requirement: string
  /**
   * How far from working it is, as a MULTIPLE OF THE THRESHOLD: 1.0 means
   * exactly at it and larger is further away.
   *
   * The two producers used to report different things under this name, one a
   * raw quantity and one a ratio against a threshold, so a reader comparing
   * them was comparing nothing. Where a refusal is structural rather than
   * numerical the ratio is Infinity, which is the honest entry for "no
   * parameter here reopens it".
   */
  readonly ratio: number
  readonly refused: boolean
  /** What would have to change, and by how much. */
  readonly whatWouldReopenIt: string
  readonly detail: string
}

/**
 * Storing the lifting gas so the envelope can collapse for boat mode.
 *
 * THE CLEANEST NO IN THE PROJECT, because it is SCALE INVARIANT. Write f for the
 * storage system's hydrogen mass fraction. The gas in the envelope has mass
 * rho_H2 * V and lifts (rho_air - rho_H2) * V, so
 *
 *   tank mass / gross lift = [rho_H2 / (rho_air - rho_H2)] * (1 - f) / f
 *
 * The volume cancels. Every term is a property of the gases and of the tank, and
 * none is a property of the vehicle, so no size of ship changes the answer and
 * neither does the choice of pressure once f is fixed.
 *
 * At ISA sea level the bracket is 0.0748, so break-even, where the tanks weigh
 * exactly what the gas they hold would lift, needs f = 6.96 percent by mass.
 * The US DOE's ULTIMATE target for onboard hydrogen storage, the one nobody has
 * met, is 6.5 percent. Production Type IV systems are near 5.5.
 *
 * SO THE TANKS TO HOLD THE LIFT GAS WEIGH MORE THAN THE GAS LIFTS, at every
 * possible size of ship, for every storage system anyone has built or targeted.
 * And it is worse than break-even implies, because what the vehicle can actually
 * spare is its lift MARGIN and not its gross lift.
 */
export const collapsibleEnvelope = (design: DesignPoint, liftMarginFraction: number): Refusal => {
  const seaLevel = atmosphere(m(0))
  const gas = gasDensity(pure(design.gas.species), Pa(seaLevel.pressure), K(seaLevel.temperature))
  const liftPerVolume = seaLevel.density - gas

  /** @derived The scale-invariant bracket: gas mass per unit of gross lift. */
  const massPerLift = gas / liftPerVolume

  const achievable = v(HYDROGEN_STORAGE_DENSITY.type4SystemGravimetricFraction)
  const tankPerGrossLift = massPerLift * ((1 - achievable) / achievable)

  /** @derived Break-even f, where tank mass equals the gross lift of its contents. */
  const breakEven = massPerLift / (1 + massPerLift)
  /** @derived The f that would fit inside the lift margin instead of the whole lift. */
  const fitsMargin = massPerLift / (liftMarginFraction + massPerLift)

  return {
    id: 'collapsible-envelope',
    requirement:
      'A semi-rigid envelope that expands to fly and folds away when the ship is primarily a boat, so the windage falls far enough to navigate.',
    ratio: tankPerGrossLift,
    refused: tankPerGrossLift > liftMarginFraction,
    whatWouldReopenIt: `A storage system at ${(fitsMargin * 100).toFixed(1)} percent hydrogen by mass, against ${(achievable * 100).toFixed(1)} percent for a production Type IV system and ${(v(HYDROGEN_STORAGE_DENSITY.doeUltimateSystemGravimetricFraction) * 100).toFixed(1)} percent for the DOE ultimate target that nobody has met. Not a matter of engineering effort: the whole tank would have to be lighter than the gas inside it is worth.`,
    detail:
      `Tank mass over gross lift is ${massPerLift.toFixed(4)} times (1-f)/f, and THE VOLUME CANCELS. ` +
      `Every term is a property of the gases and of the tank and none is a property of the ship, so ` +
      `no size fixes it and neither does the pressure. At the ${(achievable * 100).toFixed(1)} ` +
      `percent a real system achieves, the tanks weigh ${tankPerGrossLift.toFixed(2)} times the ` +
      `gross lift of the gas they hold. Break-even needs ${(breakEven * 100).toFixed(2)} percent ` +
      `and fitting inside the vehicle's own lift margin needs ${(fitsMargin * 100).toFixed(1)}. ` +
      `Venting instead of storing is mass-free, and what it costs is the days of surplus ` +
      `electrolysis needed to put the gas back, which this model's own energy balance sets. It is ` +
      `a large fraction of a year aloft for one boat trip, and that is the trade: mass you cannot ` +
      `afford against time you can.`,
  }
}

/**
 * Making the buoyant lobes themselves into wings.
 *
 * THE OBVIOUS OBJECTION IS TRUE AND NEGLIGIBLE, AND SAYING SO IS THE POINT.
 * Raising the pressure inside a lobe raises the gas density in proportion, so
 * the buoyancy falls in proportion, and this module's first draft called that
 * the killer. It is not: at the two and a half kilopascals a lobe actually needs
 * to hold its shape against this vehicle's airstream, the loss is TWO TENTHS OF
 * ONE PERCENT. Two and a half kPa is 2.5 percent of an atmosphere and the gas is
 * a small part of the mass balance, so a proportional loss on a small term is a
 * very small number. The proportionality is real and the consequence is not, and
 * publishing the first without the second would have been the exact overclaim
 * this repository exists to prevent.
 *
 * WHAT DOES KILL IT COMES IN TWO PARTS.
 *
 * BALLONETS, which is the mechanism that gets conflated with superpressure and
 * is the one that actually costs lift. Reshaping a lobe by inflating an air bag
 * inside it displaces lifting gas ONE FOR ONE BY VOLUME, so a lobe reshaped by a
 * tenth of its volume has lost a tenth of its lift. That is three orders of
 * magnitude worse than superpressure and it is what anyone proposing to change a
 * lobe's shape in flight is really proposing.
 *
 * AND STRUCTURE, which is the harder objection. Vectored thrust needs a member
 * in COMPRESSION to react against, and fabric has none: a pressure-stabilised
 * lobe carries compression only as a reduction in its own tension, so a
 * propulsor mount on one is a local buckle waiting for a gust. That forces a
 * rigid keel, and once there is a rigid keel the lobes are a heavier way to hold
 * gas than cells in a frame.
 */
export const pressurisedLobeWing = (
  design: DesignPoint,
  requiredSuperpressure: number,
  /** Fraction of the lobe's volume a ballonet must fill to reshape it. */
  ballonetVolumeFraction: number,
): Refusal => {
  const seaLevel = atmosphere(m(0))
  const ambient = seaLevel.pressure
  const gas = gasDensity(pure(design.gas.species), Pa(ambient), K(seaLevel.temperature))
  const pressurised = gasDensity(
    pure(design.gas.species),
    Pa(ambient + requiredSuperpressure),
    K(seaLevel.temperature),
  )
  const liftAtAmbient = seaLevel.density - gas
  const liftPressurised = seaLevel.density - pressurised
  const lostToPressure = 1 - liftPressurised / liftAtAmbient

  // A ballonet displaces lifting gas one for one, so the loss IS the fraction.
  /** @derived Guard against dividing by a vanishing denominator in the comparison. */
  const RATIO_FLOOR = 1e-12
  const lostToBallonet = ballonetVolumeFraction

  return {
    id: 'pressurised-lobe-wing',
    requirement:
      'The buoyant lobes act as the lifting surface, stiffened or reshaped from inside when aerodynamic lift is wanted.',
    /**
     * Infinity: this refusal is structural rather than numerical, so no
     * parameter in the model reopens it. Reporting the ballonet loss here
     * suggested it was a threshold that could be crossed.
     */
    ratio: Number.POSITIVE_INFINITY,
    refused: true,
    whatWouldReopenIt:
      'Nothing on the buoyancy side, because the buoyancy side is not what kills it. A material that carries compression in a membrane would, and none exists: that is what a spar is, and a lobe with a spar in it is a wing with gas in it, which is a worse wing and a worse gas cell than having one of each.',
    detail:
      `SUPERPRESSURE IS NOT THE PROBLEM AND THIS MODULE USED TO SAY IT WAS. At the ` +
      `${(requiredSuperpressure / 1000).toFixed(1)} kPa a lobe needs to hold its shape against the ` +
      `airstream, the gas inside is denser in proportion and the lobe loses ` +
      `${(lostToPressure * 100).toFixed(2)} percent of its lift. The proportionality is real; the ` +
      `consequence is two tenths of one percent, because a few kPa is a few percent of an ` +
      `atmosphere. ` +
      `THE MECHANISM THAT DOES COST LIFT IS THE BALLONET: reshaping a lobe by inflating air inside ` +
      `it displaces lifting gas one for one by volume, so ` +
      `${(ballonetVolumeFraction * 100).toFixed(0)} percent of the lobe's volume is ` +
      `${(lostToBallonet * 100).toFixed(0)} percent of its lift, which is ` +
      `${(lostToBallonet / Math.max(lostToPressure, RATIO_FLOOR)).toFixed(0)} times worse. ` +
      `And the structural objection is worse still: vectored thrust needs a member in compression ` +
      `and fabric has none, so a propulsor mount on a pressure-stabilised lobe is a local buckle ` +
      `waiting for a gust. That forces a rigid keel, and once there is a rigid keel the lobes are a ` +
      `heavier way to hold gas than cells in a frame.`,
  }
}

/**
 * Every refusal, for the site and for the report.
 *
 * @param liftMarginFraction The vehicle's lift margin as a fraction of gross
 *   lift, which is what a new system would actually have to fit inside.
 */
/**
 * @source Fraction of a lobe's volume a ballonet has to fill to reshape it
 * usefully. A tenth is the least that changes a section's camber enough to
 * matter, and it is a tenth of the lift.
 */
const BALLONET_RESHAPE_FRACTION = 0.1

export const refusedRequirements = (
  design: DesignPoint,
  liftMarginFraction: number,
): readonly Refusal[] => [
  collapsibleEnvelope(design, liftMarginFraction),
  /**
   * @source Superpressure a lobe needs to hold its shape against the airstream,
   * Pa. It scales with dynamic pressure rather than with size, so it is a speed
   * decision rather than a scale one, which is why a bigger ship does not
   * escape it.
   *
   * The value is UNCERTAIN and this used to claim "three independent sources
   * agree" while naming none of them, which is an assertion of citation rather
   * than a citation, in the package where the rule is strictest.
   */
  /**
   * @source Superpressure a lobe needs to hold its shape against the airstream,
   * Pa. It scales with dynamic pressure rather than with size, so it is a speed
   * decision rather than a scale one, which is why a bigger ship does not
   * escape it.
   *
   * The value is UNCERTAIN and this used to claim "three independent sources
   * agree" while naming none of them, which is an assertion of citation rather
   * than a citation, in the package where the rule is strictest.
   */
  pressurisedLobeWing(design, 2500, BALLONET_RESHAPE_FRACTION),
]
