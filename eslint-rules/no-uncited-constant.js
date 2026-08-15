/**
 * A number without a source is a defect.
 *
 * This is the rule the whole repository rests on. The claim airship.diy makes is
 * that its endurance figure is traceable: every constant is a measurement
 * somebody published, or an explicit admission that we are guessing. A plausible
 * inline coefficient is worse than a missing one, because it looks finished.
 *
 * Inside the physics packages, a numeric literal is an error unless one of:
 *
 *   - It is structurally meaningless (0, 1, 2, -1, 0.5, and friends): loop
 *     bounds, array indices, halves in an average, exponents.
 *   - The nearest enclosing statement carries a `@source` JSDoc tag naming where
 *     the number came from.
 *   - The nearest enclosing statement carries `@derived`, meaning it falls out
 *     of an equation documented in the same docstring rather than out of a
 *     datasheet (a gas constant ratio, a unit conversion written as arithmetic).
 *
 * Anything genuinely unknown is not a literal at all. It is an `Uncertain<T>`
 * from @airship/data with a range and a TODO(uncertainty) tag, so it shows up in
 * the generated uncertainty report instead of hiding in the model.
 */

// Structural values that carry no physics. Everything else has to justify itself.
const STRUCTURAL = new Set([0, 1, 2, -1, -2, 0.5, 3, 4, 6, 12, 100, 180, 360, 1000])

const TAGS = /@(?:source|derived|uncertainty)\b/

/**
 * The provenance constructors from @airship/data. A literal passed to one of
 * these is not an uncited constant: it IS the citation. Their type signatures
 * make `source` or `reason` plus `resolvedBy` mandatory, so the compiler
 * already enforces what this rule would be asking for, and requiring a comment
 * on top of that would be noise that trains people to ignore the rule.
 */
const PROVENANCE_CONSTRUCTORS = new Set(['measured', 'uncertain'])

/** True when the node sits inside a measured(...) or uncertain(...) call. */
function insideProvenanceConstructor(node) {
  for (let n = node; n; n = n.parent) {
    if (n.type === 'CallExpression') {
      const callee = n.callee
      if (callee?.type === 'Identifier' && PROVENANCE_CONSTRUCTORS.has(callee.name)) return true
      if (
        callee?.type === 'MemberExpression' &&
        callee.property?.type === 'Identifier' &&
        PROVENANCE_CONSTRUCTORS.has(callee.property.name)
      ) {
        return true
      }
    }
  }
  return false
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Numeric literals in the physics packages must carry a @source or @derived annotation.',
    },
    schema: [{ type: 'object', properties: { allow: { type: 'array' } }, additionalProperties: false }],
    messages: {
      uncited:
        'Uncited constant {{value}}. Move it to @airship/data with a source and an uncertainty, ' +
        'or annotate the enclosing statement with @source / @derived. If the value is genuinely ' +
        'unknown, encode it as Uncertain<T> rather than picking a plausible number.',
    },
  },

  create(context) {
    const extra = new Set(context.options[0]?.allow ?? [])
    const source = context.sourceCode

    /**
     * Walk outward to the nearest statement and read the comments attached to
     * it. Annotating every literal individually would be unreadable, so the
     * annotation binds to the statement that contains them.
     */
    function isAnnotated(node) {
      for (let n = node; n; n = n.parent) {
        const comments = source.getCommentsBefore(n)
        if (comments.some((c) => TAGS.test(c.value))) return true

        // Stop at the enclosing function: an annotation on a caller should not
        // license unrelated literals in a callee defined alongside it.
        if (
          n.type === 'FunctionDeclaration' ||
          n.type === 'FunctionExpression' ||
          n.type === 'ArrowFunctionExpression'
        ) {
          const jsdoc = source.getCommentsBefore(n.parent?.type === 'VariableDeclarator' ? n.parent.parent : n)
          if (jsdoc.some((c) => TAGS.test(c.value))) return true
          return false
        }
      }
      return false
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'number') return

        // Unary minus parses as a separate node, so -1 arrives here as 1.
        const value = node.parent?.type === 'UnaryExpression' && node.parent.operator === '-'
          ? -node.value
          : node.value

        if (STRUCTURAL.has(value) || extra.has(value)) return

        if (insideProvenanceConstructor(node)) return

        // An array index is structural no matter how large it is.
        if (node.parent?.type === 'MemberExpression' && node.parent.computed && node.parent.property === node) {
          return
        }

        if (isAnnotated(node)) return

        context.report({ node, messageId: 'uncited', data: { value: String(value) } })
      },
    }
  },
}
