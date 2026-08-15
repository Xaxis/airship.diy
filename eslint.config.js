import js from '@eslint/js'
import tseslint from 'typescript-eslint'

import noUnqualifiedHybrid from './eslint-rules/no-unqualified-hybrid.js'
import noUncitedConstant from './eslint-rules/no-uncited-constant.js'
import noCrossTierImport from './eslint-rules/no-cross-tier-import.js'

const airship = {
  rules: {
    'no-unqualified-hybrid': noUnqualifiedHybrid,
    'no-uncited-constant': noUncitedConstant,
    'no-cross-tier-import': noCrossTierImport,
  },
}

/** The physics tiers, in dependency order. See eslint-rules/no-cross-tier-import.js. */
const TIERS = ['units', 'data', 'core', 'model', 'solvers']

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-dev/**',
      '**/out/**',
      'apps/web/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { airship },
    rules: {
      // The terminology rule applies everywhere, including the website copy and
      // the documentation tooling. It is a defect wherever it appears.
      'airship/no-unqualified-hybrid': 'error',

      // No default exports. A default export is renamed at every call site,
      // which makes a physics function impossible to grep for across the docs,
      // the tests and the site.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'No default exports. Named exports only, so every symbol has one greppable name.',
        },
      ],

      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Per-tier import direction and headlessness.
  ...TIERS.map((tier) => ({
    files: [`packages/${tier}/src/**/*.ts`],
    plugins: { airship },
    rules: {
      'airship/no-cross-tier-import': ['error', { tier }],
    },
  })),

  // The citation rule, on the tiers that actually contain physics. `units` is
  // exempt because it is pure type machinery, and `data` is exempt because it IS
  // the citation layer: its literals sit next to their sources by construction.
  {
    files: ['packages/core/src/**/*.ts', 'packages/solvers/src/**/*.ts', 'packages/model/src/**/*.ts'],
    plugins: { airship },
    rules: {
      'airship/no-uncited-constant': 'error',
    },
  },

  // The named design points are the one place numbers are CHOICES rather than
  // measurements. "90 m hull" is not a fact about the world that could have a
  // source; it is a decision, and the sizing sweep exists to move it. Demanding
  // a citation for it would mean inventing one, which is the exact failure the
  // rule was written to prevent.
  //
  // The exemption is one file wide on purpose. Everything in packages/model
  // that is not a design point still has to cite.
  {
    files: ['packages/model/src/designs.ts'],
    rules: {
      'airship/no-uncited-constant': 'off',
    },
  },

  // Tests assert against published figures, so they are full of numbers by
  // definition. The citation lives in the fixture in packages/data/validation.
  {
    files: ['**/test/**/*.ts', '**/*.test.ts', 'tools/**', 'eslint-rules/**', '*.ts', '*.mjs'],
    rules: {
      'airship/no-uncited-constant': 'off',
      'airship/no-cross-tier-import': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Tool scripts and framework configs run in Node and are plain ESM, outside
  // any TypeScript project.
  {
    files: ['tools/**/*.mjs', 'eslint-rules/**/*.js', 'apps/web/*.mjs'],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        // Node 24 provides these as globals; the tool scripts are outside the
        // TypeScript project so nothing else tells ESLint about them.
        fetch: 'readonly',
        WebSocket: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },

  // ESLint rule modules and tool configs are consumed by machinery that
  // REQUIRES a default export. The no-default-export rule exists to keep
  // physics symbols greppable, and neither of these is physics.
  {
    files: ['eslint-rules/**/*.js', 'eslint.config.js', 'vitest.config.ts', '**/*.config.{ts,js,mjs}'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Next.js REQUIRES a default export from every page, layout and config. The
  // no-default-export rule exists to keep physics symbols greppable across the
  // docs, the tests and the site; a route file is not a physics symbol, and its
  // name is its path.
  {
    files: ['apps/web/**/*.{ts,tsx,mjs}'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // The three files that IMPLEMENT the terminology ban cannot state the word
  // they forbid without tripping over it. This is the only exemption, and it is
  // deliberately enumerated file by file rather than given as a glob, so that
  // adding a fourth exempt file is a visible decision.
  {
    files: ['eslint-rules/no-unqualified-hybrid.js', 'eslint.config.js', 'tools/check-prose.mjs'],
    rules: {
      'airship/no-unqualified-hybrid': 'off',
    },
  },
)
