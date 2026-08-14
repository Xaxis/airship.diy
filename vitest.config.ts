import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))

// Tests run against src, not dist.
//
// Without these aliases every test run would need a build first, and a stale
// dist would let a test pass against code that no longer exists. The build is
// still checked, by `make type-check` and by CI, which is the right place for
// it: the question "does this compile" and the question "is this physics
// correct" deserve to fail separately.
const alias = {
  '@airship/units': pkg('units'),
  '@airship/data': pkg('data'),
  '@airship/core': pkg('core'),
  '@airship/model': pkg('model'),
  '@airship/solvers': pkg('solvers'),
}

const project = (name: string) => ({
  resolve: { alias },
  test: {
    name,
    root: `./packages/${name}`,
    environment: 'node' as const,
    include: ['test/**/*.test.ts'],
  },
})

export default defineConfig({
  test: {
    projects: [project('units'), project('data'), project('core')],
  },
})
