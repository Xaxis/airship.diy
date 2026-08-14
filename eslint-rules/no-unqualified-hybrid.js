/**
 * In airship literature "hybrid" almost always means HYBRID LIFT: a vehicle
 * that gets part of its lift from buoyancy and part from aerodynamic lift at
 * speed, like the HAV Airlander. This vehicle is not that. It is fully buoyant,
 * and heavier-than-air operation is a failure mode rather than a design mode.
 * "Hybrid" here refers only to the POWERTRAIN: fuel cells and photovoltaics
 * alongside engines driving generators.
 *
 * The two meanings are close enough that a reader will silently substitute the
 * wrong one, and a design document that is ambiguous about whether the vehicle
 * needs forward speed to stay up is a document that cannot be checked. So the
 * bare word is banned everywhere: identifiers, strings, and comments. Write
 * `hybridLift` or `hybridPropulsion`.
 */

const QUALIFIED = /hybrid(?:Lift|Propulsion|_lift|_propulsion|-lift|-propulsion)/i
const BARE = /\bhybrid\b/i

/** Qualified spellings are stripped first, so only genuinely bare uses remain. */
function hasBareHybrid(text) {
  return BARE.test(text.replace(new RegExp(QUALIFIED.source, 'gi'), ''))
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require hybridLift or hybridPropulsion instead of the ambiguous bare word "hybrid".',
    },
    schema: [],
    messages: {
      bare:
        'Ambiguous "hybrid". In airship literature this reads as HYBRID LIFT (buoyancy plus ' +
        'aerodynamic lift). This vehicle is fully buoyant. Write hybridLift or hybridPropulsion.',
    },
  },

  create(context) {
    const source = context.sourceCode

    function check(node, text) {
      if (hasBareHybrid(text)) context.report({ node, messageId: 'bare' })
    }

    return {
      Identifier: (node) => check(node, node.name),
      Literal: (node) => {
        if (typeof node.value === 'string') check(node, node.value)
      },
      TemplateElement: (node) => check(node, node.value.raw),

      // Comments are the likeliest place for this to slip through, because a
      // comment is where you explain the architecture in prose.
      'Program:exit': () => {
        for (const comment of source.getAllComments()) {
          if (hasBareHybrid(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'bare' })
          }
        }
      },
    }
  },
}
