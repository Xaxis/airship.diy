/**
 * The dependency direction is a one-way street:
 *
 *   units <- data <- core <- model <- solvers <- app
 *
 * It exists so that `packages/core` stays headless and so that the physics
 * cannot come to depend on a design point. A drag function that reaches for the
 * baseline hull length is no longer a drag function, it is the baseline ship
 * wearing a drag function as a hat, and it will silently stop being correct the
 * moment somebody sweeps the parameter it captured.
 *
 * The same rule keeps the browser out of the physics. If a module needs `window`
 * or a renderer, it belongs in apps/web.
 */

const TIERS = ['units', 'data', 'core', 'model', 'solvers']

const BROWSER_ONLY = ['three', 'react', 'react-dom', 'next']

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce the units -> data -> core -> model -> solvers dependency direction.' },
    schema: [{ type: 'object', properties: { tier: { type: 'string' } }, additionalProperties: false }],
    messages: {
      upward:
        '{{from}} may not import {{to}}. The dependency direction is ' +
        'units -> data -> core -> model -> solvers, and it is what keeps the physics independent ' +
        'of any particular design point.',
      browser:
        '{{to}} is a browser or rendering dependency and may not be imported by {{from}}. ' +
        'Physics must run headless: if it needs a DOM, it belongs in apps/web.',
    },
  },

  create(context) {
    const tier = context.options[0]?.tier
    const rank = TIERS.indexOf(tier)

    function check(node, spec) {
      if (typeof spec !== 'string') return

      if (BROWSER_ONLY.some((b) => spec === b || spec.startsWith(`${b}/`))) {
        context.report({ node, messageId: 'browser', data: { from: tier, to: spec } })
        return
      }

      const match = /^@airship\/([a-z]+)/.exec(spec)
      if (!match || rank < 0) return

      const targetRank = TIERS.indexOf(match[1])
      if (targetRank < 0) return

      // Equal rank is a same-package import, which is fine. Strictly greater is
      // a reach upward, which is not.
      if (targetRank > rank) {
        context.report({ node, messageId: 'upward', data: { from: tier, to: spec } })
      }
    }

    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => node.source && check(node, node.source.value),
      ImportExpression: (node) => node.source.type === 'Literal' && check(node, node.source.value),
    }
  },
}
