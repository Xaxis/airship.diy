/**
 * A constant the data package already owns must not be retyped as a literal.
 *
 * WHY THIS EXISTS, AND WHY `no-uncited-constant` DOES NOT CATCH IT. That rule
 * accepts a literal whose enclosing statement carries `@source` or `@derived`.
 * That is the right rule for a number this repository is the first to write
 * down, but it makes annotating a literal EASIER than importing the real one,
 * so the same physical quantity accumulates copies with impeccable citations
 * attached to each of them.
 *
 * It had produced sixteen copies of five constants across eight files by the
 * time it was noticed, including two copies of hydrogen's density forty lines
 * apart in a single function. Every one of them lints clean. Every one of them
 * can drift from `@airship/data`, and the ISA sea level density in particular
 * appeared as 1.225 in four files while the data package holds it with an
 * uncertainty that none of the four propagated.
 *
 * The uncertainty is the real loss. A literal cannot carry a range, so a
 * sensitivity sweep over `ISA.seaLevelDensity` moves nothing in a module that
 * typed 1.225, and the uncertainty report silently understates how much the
 * answer depends on it.
 */

/**
 * Values @airship/data owns, and what to import instead. Keyed by the literal
 * as written, because that is what a reviewer sees.
 */
const OWNED = new Map([
  [1.225, 'v(ISA.seaLevelDensity)'],
  [9.80665, 'v(CONSTANTS.g0)'],
  [8.314462618, 'v(CONSTANTS.R)'],
  [8.31432, 'v(ISA.gasConstant)'],
  [288.15, 'v(ISA.seaLevelTemperature)'],
  [101325, 'v(ISA.seaLevelPressure)'],
  [5.670374419e-8, 'v(CONSTANTS.sigma)'],
  [0.0852, 'derive from MOLAR_MASS.hydrogen and ISA.seaLevelDensity'],
  [0.1691, 'derive from MOLAR_MASS.helium and ISA.seaLevelDensity'],
])

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'physical constants come from @airship/data, not from a literal',
    },
    schema: [],
    messages: {
      duplicated:
        'The literal {{value}} is a constant @airship/data already owns. Use {{replacement}}. ' +
        'A citation comment on a copy is not the same as reading the source: the copy cannot ' +
        'carry the uncertainty, so a sensitivity sweep will report that this module does not ' +
        'depend on a value it plainly does.',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename()
    // The data package is where these are DEFINED, so it is the one place the
    // literals belong.
    if (filename.includes('packages/data/')) return {}
    // And this rule's own lookup table, which necessarily names them all.
    if (filename.includes('eslint-rules/')) return {}
    // Tests may pin a literal on purpose, to catch the value changing.
    if (/\.test\.ts$|\/test\//.test(filename)) return {}

    return {
      Literal(node) {
        if (typeof node.value !== 'number') return
        const replacement = OWNED.get(node.value)
        if (!replacement) return
        context.report({
          node,
          messageId: 'duplicated',
          data: { value: String(node.value), replacement },
        })
      },
    }
  },
}
