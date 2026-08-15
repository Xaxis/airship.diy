import type { CubicMeters, Meters, SquareMeters } from '@airship/units'
import { m, m2, m3 } from '@airship/units'

/**
 * Parametric hull shape, as a body of revolution.
 *
 * The sizing loop needs volume, wetted area, cross-sectional area distribution
 * and prismatic coefficient from a handful of parameters, and it needs them
 * thousands of times per sweep. It also needs the SAME shape to feed the
 * renderer, so that the picture on the website is the hull the numbers describe
 * rather than an artist's impression of it.
 *
 * The representation is a class-shape transformation (CST), which is the modern
 * standard for parametric bodies and has three properties that matter here:
 *
 *   1. The class function fixes the nose and tail behaviour exactly. A round
 *      nose is N1 = 0.5 and a pointed tail is N2 = 1.0, and those are not
 *      approximations, they are the analytic leading and trailing edge shapes.
 *   2. The shape function is a Bernstein polynomial, so the coefficients are
 *      well conditioned and a small change in one does not produce a wobble
 *      three metres away.
 *   3. Adding a coefficient refines the shape without invalidating the ones
 *      already chosen.
 *
 *   r(x) = R_max * C(x) * S(x) / max(C*S),   x in [0, 1] along the hull
 *   C(x) = x^N1 * (1 - x)^N2
 *   S(x) = sum_i A_i * binom(n, i) * x^i * (1 - x)^(n - i)
 *
 * The alternative was the Gertler Series 58 polynomials, which are the
 * traditional airship choice and are tabulated rather than parametric. They
 * describe a fixed family; this describes a continuum, and the fineness ratio
 * sweep the brief asks for needs a continuum.
 */

export interface HullShape {
  /** Nose exponent. 0.5 gives a rounded nose, which is what a real hull has. */
  readonly noseExponent: number
  /** Tail exponent. 1.0 gives a pointed tail for a clean pressure recovery. */
  readonly tailExponent: number
  /** Bernstein coefficients. More coefficients means finer control. */
  readonly coefficients: readonly number[]
}

export interface HullGeometry {
  readonly length: Meters
  readonly maxDiameter: Meters
  /** Length over maximum diameter. The drag optimum sits around 4.5 to 6.0. */
  readonly finenessRatio: number
  readonly volume: CubicMeters
  /** External surface area. Drives skin friction, solar collection, and cover mass. */
  readonly wettedArea: SquareMeters
  /** Maximum cross-sectional area, at the station of maximum diameter. */
  readonly maxCrossSection: SquareMeters
  /** V / (A_max * L). About 0.65 to 0.72 for a well-formed airship hull. */
  readonly prismaticCoefficient: number
  /**
   * Wetted area divided by V^(2/3). The figure of merit for skin friction: for
   * a fixed volume, the shape with the smaller value has less surface to drag
   * through the air, and also less area to permeate through and less cover to
   * carry. A sphere is the minimum at 4.836.
   */
  readonly wettedAreaCoefficient: number
  /** Fractional station of maximum diameter, 0 at the nose. */
  readonly maxDiameterStation: number
}

/**
 * The two ends of the fullness family, blended by `hullShapeForPrismatic`.
 *
 * Hand-picking Bernstein coefficients to hit a target hull volume is a bad
 * idea: they are not independently meaningful, the mapping to prismatic
 * coefficient is not obvious (raising the tail coefficients makes a hull
 * FINER, not fuller, which is the opposite of the intuition), and any hand-tuned
 * set becomes a magic number the moment somebody sweeps fineness ratio.
 *
 * So fullness is one solved parameter instead. `FINE` is the bare class
 * function, which gives Cp = 0.5625. `FULL` is a U-shaped coefficient set that
 * counteracts the class function to produce a parallel midbody, giving
 * Cp = 0.722. Blending between them spans every prismatic coefficient a real
 * airship hull has ever had.
 * @derived Endpoints of a blend; the physically meaningful parameter is the
 *   prismatic coefficient the blend is solved to hit.
 */
const FINE_COEFFICIENTS = [1, 1, 1, 1, 1] as const
/** @derived Companion endpoint to FINE_COEFFICIENTS; see the note above. */
const FULL_COEFFICIENTS = [1.3, 0.9, 0.9, 1.2, 2.5] as const

/**
 * Prismatic coefficients of real airship hulls, back-computed from published
 * dimensions and envelope volumes:
 *
 *   Zeppelin NT   8,225 m3 / (pi * 7.08^2 * 75)     = 0.696
 *   USS Macon     209,580 m3 / (pi * 20.25^2 * 239.3) = 0.680
 *
 * 0.69 is the default. It is a real design variable and the sizing sweep moves
 * it, because a fuller hull buys volume for the same length and wetted area,
 * and pays for it in pressure drag and in a worse bending moment distribution.
 * @source Back-computed from the Zeppelin NT and Akron-class fixtures in
 *   packages/data/src/validation/historical-ships.ts.
 */
export const CONVENTIONAL_PRISMATIC_COEFFICIENT = 0.69

/** Blend the fullness family at t, where 0 is FINE and 1 is FULL. */
const blend = (t: number): HullShape => ({
  noseExponent: 0.5,
  tailExponent: 1.0,
  coefficients: FINE_COEFFICIENTS.map(
    (fine, i) => fine + t * ((FULL_COEFFICIENTS[i] ?? fine) - fine),
  ),
})

const binomial = (n: number, k: number): number => {
  let result = 1
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1)
  return result
}

/** Unnormalised radius profile, r(x)/R_max before the peak is scaled to 1. */
const profile = (shape: HullShape, x: number): number => {
  if (x <= 0 || x >= 1) return 0

  const classFunction = x ** shape.noseExponent * (1 - x) ** shape.tailExponent

  const n = shape.coefficients.length - 1
  let shapeFunction = 0
  for (let i = 0; i <= n; i += 1) {
    shapeFunction += (shape.coefficients[i] ?? 0) * binomial(n, i) * x ** i * (1 - x) ** (n - i)
  }

  return classFunction * shapeFunction
}

/**
 * Composite Simpson's rule.
 *
 * The integrands here have a square-root singularity in the derivative at the
 * nose, which is what a rounded nose IS, so the wetted area integrand goes to
 * infinity there even though its integral is finite. Simpson converges on it
 * slowly, which is why the panel count is high rather than clever. At 4000
 * panels the volume is converged to better than 1e-6 relative, checked against
 * Richardson extrapolation in the tests.
 * @derived Standard quadrature, no physical constant involved.
 */
const integrate = (f: (x: number) => number, panels: number): number => {
  const h = 1 / panels
  let sum = f(0) + f(1)
  for (let i = 1; i < panels; i += 1) {
    sum += f(i * h) * (i % 2 === 0 ? 2 : 4)
  }
  return (sum * h) / 3
}

/** @derived Panel count chosen for 1e-6 convergence; see the note on integrate. */
const PANELS = 4000

/**
 * Peak of the unnormalised profile, found by golden section search.
 *
 * Needed because the CST coefficients set the shape but not the scale, so the
 * profile has to be normalised by its own maximum before the maximum diameter
 * parameter means anything.
 * @derived Golden section constant, pure numerics.
 */
const peakCache = new WeakMap<HullShape, { station: number; value: number }>()

const findPeak = (shape: HullShape): { station: number; value: number } => {
  /** @derived Golden section ratio. Pure numerics. */
  const GOLDEN = (Math.sqrt(5) - 1) / 2
  /** @derived Iteration count, well past double precision convergence. */
  const ITERATIONS = 200

  // Memoised. The search is 200 profile evaluations, and the solar integrator
  // asks for a hull radius tens of millions of times per annual balance. Without
  // this cache the peak search alone dominates the entire runtime of the model.
  const cached = peakCache.get(shape)
  if (cached) return cached

  const phi = GOLDEN
  let a = 0
  let b = 1
  for (let i = 0; i < ITERATIONS; i += 1) {
    const c = b - phi * (b - a)
    const d = a + phi * (b - a)
    if (profile(shape, c) > profile(shape, d)) b = d
    else a = c
  }
  const station = (a + b) / 2
  const peak = { station, value: profile(shape, station) }
  peakCache.set(shape, peak)
  return peak
}

/**
 * Prismatic coefficient of a shape, independent of length and diameter.
 *
 * @derived Cp = V / (A_max * L). With the profile normalised so its peak is 1,
 * both the pi and the R^2 cancel and Cp is just the integral of the squared
 * normalised profile. That is why fullness can be solved once and reused at
 * every hull size.
 */
export const prismaticCoefficientOf = (shape: HullShape): number => {
  const peak = findPeak(shape)
  return integrate((x) => (profile(shape, x) / peak.value) ** 2, PANELS)
}

/**
 * Cache of solved shapes, keyed by target prismatic coefficient.
 *
 * The solve is 60 bisections, each of which runs a 4,000 panel integration and
 * a peak search, and callers ask for the SAME target over and over: once per
 * compartment, once per station, once per bisection step of an outer loop. An
 * earlier version told the caller to cache it, and the caller reasonably did
 * not, which turned an arrangement mass statement into a two-second call.
 */
const shapeCache = new Map<number, HullShape>()

/**
 * Solve the fullness blend for a target prismatic coefficient.
 *
 * Bisection, because the mapping is monotonic in the blend parameter but has no
 * closed form. Memoised on the target, because it is expensive and pure.
 */
export const hullShapeForPrismatic = (target: number): HullShape => {
  const cached = shapeCache.get(target)
  if (cached) return cached
  const solved = solveShapeForPrismatic(target)
  shapeCache.set(target, solved)
  return solved
}

const solveShapeForPrismatic = (target: number): HullShape => {
  const lowest = prismaticCoefficientOf(blend(0))
  const highest = prismaticCoefficientOf(blend(1))

  if (target < lowest || target > highest) {
    throw new RangeError(
      `Prismatic coefficient ${target} is outside the family this shape can produce ` +
        `(${lowest.toFixed(3)} to ${highest.toFixed(3)}). Real airship hulls sit near 0.69.`,
    )
  }

  /** @derived 60 bisection steps resolves the blend parameter far past double precision need. */
  const BISECTION_STEPS = 60
  let lo = 0
  let hi = 1
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2
    if (prismaticCoefficientOf(blend(mid)) < target) lo = mid
    else hi = mid
  }
  return blend((lo + hi) / 2)
}

/**
 * A conventional airship hull: rounded nose, pointed tail, maximum diameter
 * forward of midships, prismatic coefficient 0.69.
 */
export const CONVENTIONAL_HULL: HullShape = hullShapeForPrismatic(
  CONVENTIONAL_PRISMATIC_COEFFICIENT,
)

/**
 * Compute the full geometry of a hull.
 *
 * @param length Overall hull length.
 * @param finenessRatio Length over maximum diameter.
 */
export const hullGeometry = (
  length: Meters,
  finenessRatio: number,
  shape: HullShape = CONVENTIONAL_HULL,
): HullGeometry => {
  if (finenessRatio <= 1) {
    throw new RangeError(
      `Fineness ratio ${finenessRatio} is not a hull. Airship practice spans about 3 to 8; ` +
        `below 4 pressure drag climbs steeply and above 7 skin friction dominates.`,
    )
  }

  const maxDiameter = length / finenessRatio
  const maxRadius = maxDiameter / 2
  const peak = findPeak(shape)

  /** Normalised radius, in metres, at fractional station x. */
  const radiusAt = (x: number): number => (maxRadius * profile(shape, x)) / peak.value

  // Volume of revolution: V = integral of pi * r^2 dx, with dx in metres.
  const volume = Math.PI * length * integrate((x) => radiusAt(x) ** 2, PANELS)

  // Wetted area of revolution: A = integral of 2*pi*r*sqrt(1 + (dr/dz)^2) dz.
  // The derivative is taken with respect to the physical axial coordinate, so
  // the chain rule brings in a factor of 1/length.
  const dx = 1 / PANELS
  const wettedArea =
    2 *
    Math.PI *
    length *
    integrate((x) => {
      const r = radiusAt(x)
      // Central difference, clamped away from the endpoints where the profile
      // is zero and the slope is unbounded.
      const xl = Math.max(x - dx, 0)
      const xr = Math.min(x + dx, 1)
      const slope = ((radiusAt(xr) - radiusAt(xl)) / ((xr - xl) * length)) as number
      return r * Math.sqrt(1 + slope * slope)
    }, PANELS)

  const maxCrossSection = Math.PI * maxRadius ** 2

  return {
    length,
    maxDiameter: m(maxDiameter),
    finenessRatio,
    volume: m3(volume),
    wettedArea: m2(wettedArea),
    maxCrossSection: m2(maxCrossSection),
    prismaticCoefficient: volume / (maxCrossSection * length),
    wettedAreaCoefficient: wettedArea / volume ** (2 / 3),
    maxDiameterStation: peak.station,
  }
}

/**
 * Radius at a fractional station along the hull. For the renderer, for the
 * structural beam model's station spacing, and for placing gas cells.
 */
export const hullRadiusAt = (
  length: Meters,
  finenessRatio: number,
  station: number,
  shape: HullShape = CONVENTIONAL_HULL,
): Meters => {
  const peak = findPeak(shape)
  return m((length / finenessRatio / 2) * (profile(shape, station) / peak.value))
}

/**
 * Cross-sectional area distribution, sampled at `stations` equally spaced
 * points. The structural model integrates buoyancy against this, and it does
 * NOT match the weight distribution, which is what produces hogging and sagging.
 */
export const crossSectionDistribution = (
  length: Meters,
  finenessRatio: number,
  stations: number,
  shape: HullShape = CONVENTIONAL_HULL,
): ReadonlyArray<{ station: number; x: Meters; area: SquareMeters }> => {
  const peak = findPeak(shape)
  const maxRadius = length / finenessRatio / 2

  return Array.from({ length: stations }, (_, i) => {
    const station = i / (stations - 1)
    const r = (maxRadius * profile(shape, station)) / peak.value
    return { station, x: m(station * length), area: m2(Math.PI * r * r) }
  })
}

/**
 * Solve for the hull length that yields a target volume at a fixed fineness
 * ratio.
 *
 * Volume scales as length cubed at constant fineness, so this inverts
 * analytically rather than iterating. The sizing loop calls it on every pass.
 * @derived V proportional to L^3 at fixed L/D, so L = L_ref * (V/V_ref)^(1/3).
 */
export const lengthForVolume = (
  targetVolume: CubicMeters,
  finenessRatio: number,
  shape: HullShape = CONVENTIONAL_HULL,
): Meters => {
  const reference = hullGeometry(m(100), finenessRatio, shape)
  return m(100 * (targetVolume / reference.volume) ** (1 / 3))
}
