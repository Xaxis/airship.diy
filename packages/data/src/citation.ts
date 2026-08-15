/**
 * Provenance types.
 *
 * Two kinds of number live in this repository and they must not look alike.
 *
 * A `Measured<T>` is a value somebody published. It carries the source, and a
 * relative uncertainty which is usually the published tolerance and occasionally
 * an honest estimate of how much the published figure can be trusted.
 *
 * An `Uncertain<T>` is a value we do not know. It carries a range and a reason,
 * and it is deliberately awkward: you cannot use it without deciding what to do
 * about the range. Every one of them is enumerated in the uncertainty report,
 * sorted by how much it moves the endurance number, and that sorted list is the
 * research to-do list for the project.
 *
 * The failure mode this exists to prevent is the plausible constant. A model
 * full of reasonable-looking coefficients produces a reasonable-looking answer
 * and there is no way to tell, afterwards, which parts of it were real.
 */

export interface Source {
  /** Stable key. Referenced from code, docs, and the website bibliography. */
  readonly id: string
  readonly title: string
  readonly author?: string
  readonly year?: number
  readonly url?: string
  /** What this source is good for, and where it should not be trusted. */
  readonly note?: string
}

export interface Measured<T extends number> {
  readonly kind: 'measured'
  readonly value: T
  /** SI unit string, for display and for the generated reference tables. */
  readonly unit: string
  /** `Source.id`. */
  readonly source: string
  /**
   * Relative standard uncertainty, as a fraction. `0` means exact by
   * definition, which is true of more constants than people expect: the SI
   * 2019 redefinition made the gas constant and Boltzmann's constant exact,
   * and the international foot and pound have been exact since 1959.
   */
  readonly relativeUncertainty: number
  readonly note?: string
}

export interface Uncertain<T extends number> {
  readonly kind: 'uncertain'
  readonly low: T
  /** Best current guess. Used when the model runs a single point. */
  readonly nominal: T
  readonly high: T
  readonly unit: string
  /** Why this is unknown, and what would resolve it. */
  readonly reason: string
  /** What measurement, datasheet, or test would turn this into a `Measured`. */
  readonly resolvedBy: string
  readonly source?: string
}

export type Provenanced<T extends number> = Measured<T> | Uncertain<T>

// The registry. Every provenanced value constructed anywhere in the data package
// lands here, which is what lets `make uncertainty` enumerate them without a
// separate hand-maintained list that would immediately drift.
const registry: Array<{ path: string; value: Provenanced<number> }> = []

let currentPath = 'unattributed'

/** Namespace subsequent declarations, so the report can say where a value lives. */
export const under = <T>(path: string, build: () => T): T => {
  const previous = currentPath
  currentPath = path
  try {
    return build()
  } finally {
    currentPath = previous
  }
}

// The value parameters below are `number` rather than a generic `T extends
// number` on purpose. Inference would fix T to the literal type of the
// argument, so `uncertain({low: 0.15, nominal: 0.17, high: 0.19})` would
// produce `Uncertain<0.15 | 0.17 | 0.19>` and `v()` would return that union.
// It then propagates into every default parameter that reads the value, and
// the resulting errors point at the call site rather than at the cause.
export function measured(
  value: number,
  spec: { unit: string; source: string; relativeUncertainty: number; note?: string },
): Measured<number> {
  const entry: Measured<number> = { kind: 'measured', value, ...spec }
  registry.push({ path: currentPath, value: entry })
  return entry
}

/**
 * Declare a value we do not know.
 *
 * Reaching for this is not a failure. Silently picking `nominal` and writing it
 * as a literal is the failure. TODO(uncertainty)
 */
export function uncertain(spec: {
  low: number
  nominal: number
  high: number
  unit: string
  reason: string
  resolvedBy: string
  source?: string
}): Uncertain<number> {
  const entry: Uncertain<number> = { kind: 'uncertain', ...spec }
  registry.push({ path: currentPath, value: entry })
  return entry
}

/**
 * Extract the number the model should use for a single-point run.
 *
 * For an `Uncertain` this is the nominal, and the whole point of the registry is
 * that you can afterwards ask what the answer would have been at `low` and
 * `high` instead.
 */
export const v = <T extends number>(q: Provenanced<T>): T =>
  q.kind === 'measured' ? q.value : q.nominal

/** The low/high pair, for sensitivity sweeps. A `Measured` spans its tolerance. */
export const bounds = <T extends number>(q: Provenanced<T>): readonly [number, number] =>
  q.kind === 'uncertain'
    ? [q.low, q.high]
    : [q.value * (1 - q.relativeUncertainty), q.value * (1 + q.relativeUncertainty)]

export const allProvenanced = (): ReadonlyArray<{ path: string; value: Provenanced<number> }> =>
  registry

export const allUncertain = (): ReadonlyArray<{ path: string; value: Uncertain<number> }> =>
  registry.filter(
    (e): e is { path: string; value: Uncertain<number> } => e.value.kind === 'uncertain',
  )
