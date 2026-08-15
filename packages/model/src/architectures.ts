import type { Architecture, ArchitectureId } from './architecture.js'

/**
 * The five named architectures.
 *
 * Separate from `architecture.ts` for the same reason `designs.ts` is separate
 * from the rest of the model: the numbers in here are CHOICES and observations
 * about other people's vehicles, not physics. "The Zeppelin NT holds 5 mbar" is
 * a fact with a source; "this architecture shall hold 5 mbar" is a decision.
 * The physics that turns these into masses and verdicts still has to cite.
 */

export const RIGID: Architecture = {
  id: 'rigid',
  name: 'Rigid',
  description:
    'A carbon frame carrying independent gas cells behind a weatherproof cover. The Hindenburg arrangement, in a material it did not have. Heaviest primary structure of the five, and the only one where a torn cell costs a twelfth of the lift instead of all of it.',
  hullForm: 'body-of-revolution',
  lobes: 1,
  containment: 'independent-cells',
  ballonetFraction: 0,
  envelopeOverpressure: 0,
  buoyancyControl: 'water-ballast',
  landingGear: 'pneumatic-cushion',
  aerodynamicLiftFraction: 0,
  calibratedOn: 'LZ-129 Hindenburg, 200,000 m3, 118,000 kg empty on an ISA basis',
}

export const SEMI_RIGID: Architecture = {
  id: 'semi-rigid',
  name: 'Semi-rigid',
  description:
    'A keel truss carrying the gondola, engines and fins into a pressure-stabilised envelope. Much lighter primary structure, at the price of a single gas volume, a blower that must never stop, and a hull size limit set by the pressure the fabric can hold.',
  hullForm: 'body-of-revolution',
  lobes: 1,
  containment: 'single-volume-with-ballonets',
  /** @source The Zeppelin NT's 2,000 m3 of ballonets in 8,255 m3 of envelope. */
  ballonetFraction: 0.242,
  /** @source The Zeppelin NT holds about 5 mbar. */
  envelopeOverpressure: 500,
  buoyancyControl: 'ballonet-air',
  landingGear: 'pneumatic-cushion',
  aerodynamicLiftFraction: 0,
  calibratedOn: 'Zeppelin NT, 8,255 m3, 1,000 kg truss, 5 mbar, 2,000 m3 ballonets',
}

export const NON_RIGID: Architecture = {
  id: 'non-rigid',
  name: 'Non-rigid',
  description:
    'A blimp. No primary structure at all: every load goes through the envelope and its catenary curtains. Lightest on paper and the least suited to hanging a habitat, a workshop and four propulsors off, because there is nothing to hang them from.',
  hullForm: 'body-of-revolution',
  lobes: 1,
  containment: 'single-volume-with-ballonets',
  ballonetFraction: 0.25,
  envelopeOverpressure: 500,
  buoyancyControl: 'ballonet-air',
  landingGear: 'pneumatic-cushion',
  aerodynamicLiftFraction: 0,
  calibratedOn: 'Zeppelin NT envelope practice with the truss deleted',
}

export const HYBRID_LIFT: Architecture = {
  id: 'hybrid-lift',
  name: 'Hybrid-lift',
  description:
    'A flattened three-lobe hull that flies heavy, carrying part of its weight on the hull as a very low aspect ratio wing. It solves ground handling and it cannot hover, which for a vehicle whose figure of merit is days aloft is the wrong trade in the wrong direction.',
  hullForm: 'multi-lobe',
  lobes: 3,
  containment: 'single-volume-with-ballonets',
  ballonetFraction: 0.25,
  envelopeOverpressure: 500,
  buoyancyControl: 'ballonet-air',
  landingGear: 'pneumatic-cushion',
  /** @source Airlander 10 is 60 to 80 percent buoyant, so 0.2 to 0.4 aerodynamic. */
  aerodynamicLiftFraction: 0.3,
  calibratedOn: 'Airlander 10, 38,000 m3 in 98 by 50 by 30 m, three lobes',
}

export const VARIABLE_BUOYANCY: Architecture = {
  id: 'variable-buoyancy',
  name: 'Variable buoyancy',
  description:
    'A rigid with a gas plant: compress lifting gas into tanks to become heavy, release it to become light. It never runs out of ballast, which matters over a desert and not at all over an ocean, and it pays for that in tankage that outweighs the water it replaces by a factor of forty.',
  hullForm: 'body-of-revolution',
  lobes: 1,
  containment: 'independent-cells',
  ballonetFraction: 0,
  envelopeOverpressure: 0,
  buoyancyControl: 'gas-compression',
  landingGear: 'pneumatic-cushion',
  aerodynamicLiftFraction: 0,
  calibratedOn:
    'Aeros Aeroscraft COSH, which has no published engineering figures, so the numbers here are derived from compression thermodynamics and published COPV mass fractions',
}

export const ARCHITECTURES: readonly Architecture[] = [
  RIGID,
  SEMI_RIGID,
  NON_RIGID,
  HYBRID_LIFT,
  VARIABLE_BUOYANCY,
]

export const architecture = (id: ArchitectureId): Architecture => {
  const found = ARCHITECTURES.find((a) => a.id === id)
  if (!found) throw new Error(`Unknown architecture "${id}".`)
  return found
}

