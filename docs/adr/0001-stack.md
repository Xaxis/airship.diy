# ADR 0001: Stack selection

**Status:** accepted
**Date:** 2026-08-14

## Context

The founding brief deliberately left the stack open and required that it be
chosen once, justified, and not revisited without another ADR. The choice has to
serve three consumers of one model: a builder who needs numbers accurate enough
to order material against, a public reader who needs every number traceable, and
a simulator that integrates the same model in real time.

The constraint that actually decides it: **the physics must run headless.** The
sizing loop, the annual energy balance, and the multi-year mission integrator are
batch computations that belong in CI, in a parameter sweep, and in a report
generator. If the physics can only run inside a browser, none of that is
possible, and the model becomes a thing that can only be demonstrated rather than
checked.

## Decision

An npm workspaces monorepo, TypeScript throughout, with the physics in
framework-free packages and the site as one consumer of them.

```
packages/units     Branded SI quantity types
packages/data      Every constant, with a source and an uncertainty
packages/core      Pure physics. No UI, no I/O, no framework.
packages/model     The parameter tree and the named design points
packages/solvers   Sizing, energy balance, mission integrator, 6-DOF
apps/web           airship.diy
docs/              The engineering notebook, rendered by the site
tools/             Sweeps, report generation, checks
```

Specifics:

| Choice | Version | Why |
|---|---|---|
| TypeScript, strict plus `noUncheckedIndexedAccess` | 6.0.3 | Branded units need a structural type system. The physics is full of arrays indexed by station and by hour, and a silent `undefined` becomes `NaN` three functions later. |
| npm workspaces | Node 24 | No extra tool. The sibling project `nullroute` uses the same layout, so the two repositories are navigable by the same person. |
| Vitest plus fast-check | 4.1.10 | Property tests matter here: buoyancy, mass, and energy identities should hold across a swept range, not at three hand-chosen points. |
| Next.js App Router, static export | 16.3 | The site is a folder of files. No server, no runtime, no API. The deployed artifact cannot do anything the source does not show. |
| React 19 plus Tailwind v4 | | Matches `nullroute` and `oapogee.space`. |
| Three.js | 0.185 | The parametric hull, the cutaway, and the flight simulator view. |
| Vercel | | Static hosting for `airship.diy`. |
| Make | | One entry point. Every CI job is also a make target, so what CI runs and what a contributor runs cannot drift. |

### Why one language rather than Python for the physics

The obvious alternative is Python with NumPy and SciPy for the model, and a
JavaScript front end that consumes precomputed results. It was rejected because
of the brief's central requirement: **one source of truth.** Two languages means
two parameter trees, and they will diverge. It also kills the real-time
simulator, which has to run the same equations at 100 Hz in the browser that the
mission integrator runs at one-hour steps in CI.

The cost is real and worth stating. There is no NumPy. Linear algebra for the
6x6 added mass tensor and the 6-DOF integrator is hand-written. That is a few
hundred lines of well-tested code, and it buys the guarantee that the number on
the website and the number in the report came from the same function.

### Deviations from `nullroute`

`nullroute` is an air-gapped signing device and its conventions are shaped by
that. What carries over: `ignore-scripts=true`, `save-exact=true`, `npm ci` only,
TypeScript strict, ESM, no default exports, no em dashes, Make as the entry
point, and CI jobs that mirror make targets.

What does not: there is no `MANIFEST.lock` and no reproducible-build root hash,
because nothing here holds keys and nobody needs to verify a binary before
trusting it with money. The equivalent artifact for this project is the
**validation report**: the model's agreement with every rigid airship that ever
flew.

`ignore-scripts=true` is kept for a different reason than `nullroute` keeps it.
There, it is a security posture. Here it is a reproducibility posture: the
endurance figure this repository publishes must be a function of the source, and
a postinstall script is a build input nobody reads.

## Consequences

**The lint rules are load-bearing.** Three custom rules enforce what prose cannot:

- `no-uncited-constant` fails any numeric literal in the physics packages that
  does not carry a `@source` or `@derived` annotation. This is the mechanical
  form of the brief's "a number without a source is a defect", and it caught
  three violations in the first hour, all of them mine.
- `no-unqualified-hybrid` bans the bare word "hybrid" everywhere, including in
  comments, because in airship literature it means hybrid *lift* and this vehicle
  is fully buoyant. See `docs/TERMINOLOGY.md`.
- `no-cross-tier-import` enforces `units -> data -> core -> model -> solvers` and
  keeps `three`, `react` and `next` out of the physics.

**The physics packages must never import a renderer.** `tools/report-lift.mjs`
runs the whole buoyancy stack under plain `node` with no shim, and that is the
standing proof that the boundary holds.

**Two clocks, one state.** The flight dynamics run at 0.005 to 0.02 s and the
mission integrator at minutes to hours. They share the parameter tree and the
vehicle state, which is only possible because both are the same code.

## Alternatives rejected

- **Python plus a static site.** One source of truth, and the real-time
  simulator, both lost. See above.
- **Rust or C++ compiled to WebAssembly.** Genuinely attractive for the 6-DOF
  integrator and would be faster. Rejected for now because it adds a toolchain,
  a build step that `ignore-scripts=true` makes awkward, and a debugging boundary
  in the middle of the thing most likely to be wrong. Revisit with an ADR if the
  mission integrator becomes the bottleneck; the pure-function shape of
  `packages/core` is deliberately kept portable so this stays possible.
- **A monolithic single package.** Rejected because the tier boundary is what
  prevents the physics from quietly depending on the baseline design point.
