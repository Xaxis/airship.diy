/**
 * Historical rigid airships, as validation fixtures.
 *
 * These are the model's contact with reality. Unit tests catch regressions;
 * these catch being wrong. Every ship here actually flew, and the published
 * figures are what the model has to reproduce before any of its predictions
 * about a ship that has not flown are worth reading.
 *
 * A warning that applies to all of them: published airship figures are less
 * precise than they look. "Gross lift" may be quoted at 95 percent fill or 100
 * percent, with pure gas or at service purity, on a standard day or on the day
 * of a particular record flight, and the source usually does not say which. The
 * tolerances below are set accordingly, and where a source is internally
 * inconsistent that is recorded in `discrepancy` rather than quietly resolved.
 */

export interface HistoricalShip {
  readonly id: string
  readonly name: string
  readonly year: number
  readonly source: string

  /** Envelope volume actually occupied by lifting gas, m3. */
  readonly gasVolume: number
  readonly liftingGas: 'hydrogen' | 'helium'
  /**
   * The gas purity that the PUBLISHED LIFT FIGURE is quoted at.
   *
   * This is not the same as the purity the ship flew at, and the distinction is
   * the reason this field exists. Most sources quote gross lift for pure gas at
   * standard conditions, because that is a property of the envelope rather than
   * of any particular day. The US Navy did not: it quoted Akron and Macon at
   * 95 percent fill with "helium of standard purity", which was itself about
   * 95 percent, because helium was expensive and impure and the Navy cared
   * about the lift it actually had.
   *
   * That makes Macon the single most useful fixture here. Modelled with pure
   * helium it over-predicts by 6.3 percent and fails the 3 percent gate; at the
   * stated service purity it lands within 1 percent. Purity is not a refinement
   * to add later, and this is the evidence.
   */
  readonly purity: number

  /** Purity in service, where it differs from the basis of the published figure. */
  readonly servicePurity?: number
  /** Fill fraction at the condition the lift figure is quoted for. */
  readonly fillFraction: number

  readonly length: number
  readonly maxDiameter: number

  /** Published gross (static) lift at ISA sea level, kg. */
  readonly publishedGrossLift?: number
  /** Published empty/deadweight, kg. */
  readonly publishedDeadweight?: number
  /** Published useful (disposable) lift, kg. */
  readonly publishedUsefulLift?: number

  /** Fractional tolerance the model must meet against `publishedGrossLift`. */
  readonly grossLiftTolerance: number

  /** Where the sources disagree with themselves, stated rather than resolved. */
  readonly discrepancy?: string
  readonly validates: string
}

export const HISTORICAL_SHIPS: readonly HistoricalShip[] = [
  {
    id: 'lz129-hindenburg',
    name: 'LZ-129 Hindenburg',
    year: 1936,
    source: 'airships-net-hindenburg',
    gasVolume: 200000,
    liftingGas: 'hydrogen',
    // The published 232 t is only consistent with essentially pure hydrogen:
    // at 98 percent the model gives 223 t, a 3.7 percent miss that would fail
    // the gate. That is not a defect in the model, it is what the convention is.
    // German practice quoted lift for pure gas, unlike US Navy practice.
    purity: 1.0,
    // Zeppelin monitored cell purity continuously and replenished from the
    // ship's own gas plant. 98 percent is the conventional figure for what they
    // held in service, which is about 1.6 t less lift than the published number.
    servicePurity: 0.98,
    fillFraction: 1.0,
    length: 245.0,
    maxDiameter: 41.2,
    publishedGrossLift: 232000,
    grossLiftTolerance: 0.03,
    discrepancy:
      'Wikipedia calls 232 t a "useful lift" while also giving a 215 t gross weight, which cannot both hold: useful lift is gross lift minus empty weight and cannot exceed gross weight. The model treats 232 t as GROSS lift, which is consistent with the volume and with the 8 percent hydrogen advantage the same article cites.',
    validates:
      'Hydrogen lift at scale, and large rigid mass fractions. The single biggest hydrogen airship ever built, so it bounds the extrapolation in the opposite direction from the design point.',
  },

  {
    id: 'zrs5-macon',
    name: 'USS Macon (ZRS-5)',
    year: 1933,
    source: 'airships-net-akron-macon',
    // 6,500,000 cu ft, stated by the source as the 95 percent inflation figure,
    // so this is gas volume and not cell capacity.
    gasVolume: 184059.4,
    liftingGas: 'helium',
    purity: 0.95,
    fillFraction: 0.95,
    length: 239.3,
    maxDiameter: 40.5,
    // 403,000 lb
    publishedGrossLift: 182796.7,
    // 242,356 lb
    publishedDeadweight: 109930.5,
    // 160,644 lb
    publishedUsefulLift: 72866.2,
    grossLiftTolerance: 0.03,
    discrepancy:
      'NavSource gives useful lift as 73,020 kg against 72,866 kg from the pound figure, a 0.2 percent rounding difference. Neither source states the ambient condition the lift was quoted at, which is worth more than the disagreement.',
    validates:
      'Helium lift, and specifically that purity is a first-order term. Also the empty weight fraction of a duralumin rigid: 109,930 / 182,797 = 60.1 percent, which is the number carbon fibre has to beat.',
  },

  {
    id: 'zrs4-akron',
    name: 'USS Akron (ZRS-4)',
    year: 1931,
    source: 'airships-net-akron-macon',
    gasVolume: 184059.4,
    liftingGas: 'helium',
    purity: 0.95,
    fillFraction: 0.95,
    length: 239.3,
    maxDiameter: 40.5,
    publishedGrossLift: 182796.7,
    publishedDeadweight: 109930.5,
    publishedUsefulLift: 72866.2,
    grossLiftTolerance: 0.03,
    validates:
      'Sister ship to Macon, same figures. Kept separate because the Akron bare-hull drag measurement in NACA TR-432 is the aerodynamic validation case and belongs to this hull, and because the two ships failed differently: Akron in a storm, Macon through a fin attachment that had already been identified as under-strength.',
  },

  {
    id: 'lz127-graf-zeppelin',
    name: 'LZ-127 Graf Zeppelin',
    year: 1928,
    source: 'wikipedia-lz127',
    // 75,000 m3 of the 105,000 m3 total is lifting hydrogen. The remaining
    // 30,000 m3 is Blau gas fuel, which lifts nothing because it was blended to
    // the density of air. That is the entire point of it.
    gasVolume: 75000,
    liftingGas: 'hydrogen',
    purity: 1.0,
    servicePurity: 0.97,
    fillFraction: 1.0,
    length: 236.6,
    maxDiameter: 30.5,
    grossLiftTolerance: 0.05,
    discrepancy:
      'No consistent published gross lift, because the ship carried two gas systems and sources vary on whether the Blau gas volume is included in "gas capacity". The model uses the 75,000 m3 hydrogen figure only.',
    validates:
      'The buoyancy-neutral gaseous fuel concept, which is Option B in the fuel decision matrix and the only one of the three options that has actually flown across an ocean. Also long-endurance operation: this ship flew round the world in 1929.',
  },
] as const

/**
 * Zeppelin NT, the only modern airship with published drag and power figures
 * detailed enough to check an aerodynamic model against.
 *
 * Kept separate from the rigids above because it validates something different:
 * not lift, but the drag-power chain. It is also the closest existing vehicle
 * to this project in construction, being a composite-framed semi-rigid with
 * vectored electric-adjacent propulsion.
 */
export const ZEPPELIN_NT = {
  id: 'lz-n07-100',
  name: 'Zeppelin NT LZ N07-100',
  year: 1997,
  source: 'khoury-airship-technology',
  gasVolume: 8225,
  liftingGas: 'helium' as const,
  purity: 0.97,
  fillFraction: 1.0,
  length: 75.0,
  maxDiameter: 14.16,
  /** Total installed shaft power, W. Three Lycoming IO-360 at 149 kW each. */
  installedPower: 447000,
  /** Maximum speed, m/s. 125 km/h. */
  maxSpeed: 34.7,
  /** Cruise speed, m/s. 115 km/h. */
  cruiseSpeed: 31.9,
  /**
   * The gate: predicted drag power at cruise, divided by an assumed propulsive
   * efficiency, must land within 25 percent of installed power. The tolerance is
   * wide on purpose. Installed power is sized for climb, hot-and-high, and
   * one-engine-inoperative, not for level cruise, so agreement closer than this
   * would be luck rather than validation.
   */
  powerTolerance: 0.25,
  validates:
    'The drag to power chain on a real modern airship: volumetric drag coefficient, wetted area from the shape function, and propulsive efficiency.',
} as const
