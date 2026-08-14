# airship.diy

The complete parametric design, engineering model, and physics simulation of a
hydrogen-lift rigid airship with a hybridPropulsion powertrain, intended for
continuous multi-month to multi-year habitation by one or two people, and
capable of landing on water and operating as a boat.

Site at **airship.diy**, deployed on Vercel. GitHub repo is `Xaxis/airship.diy`,
local checkout `~/Projects/airship.diy`. Stack conventions follow
`~/Projects/nullroute`; see `docs/adr/0001-stack.md` for what carries over and
what does not.

## The rule everything else follows from

**There is one model. The site reads it, the simulator integrates it, the
documentation renders from it.**

If a number appears in prose and also in the solver, that is a bug. If a chart
on the website disagrees with a test fixture, one of them is lying and it does
not matter which.

The corollary that governs day-to-day work: **the figure of merit is days
aloft.** Not speed, not range, not payload. When two designs conflict, the one
that stays up longer wins.

## Terminology that will cause a real defect

**"Hybrid" alone is banned and lint enforces it.** In airship literature the word
means *hybrid lift*: part buoyancy, part aerodynamic lift at forward speed, like
the HAV Airlander. **This vehicle is not that.** It is fully buoyant, and
heavier-than-air operation is a failure mode rather than a design mode. Write
`hybridPropulsion` when you mean fuel cells and photovoltaics alongside engines
driving generators. Write `hybridLift` only when discussing other people's
vehicles. A bare "hybrid" in a variable, a comment, a doc, or a UI string fails
`make lint`.

**"Gross lift" is not "useful lift" is not "net lift".** Gross lift is what the
gas displaces. Useful lift is gross minus empty weight. Net static lift is gross
minus *total current* weight, and it is signed. Published airship figures confuse
these constantly, including Wikipedia on the Hindenburg, which calls 232 t a
useful lift while also quoting a 215 t gross weight. The validation fixtures
record such discrepancies in a `discrepancy` field rather than resolving them
silently.

**Static heaviness is signed and positive means heavy.** Heavy is the safe
direction.

## Things that will produce a confidently wrong answer

**Never invent a number.** `eslint-rules/no-uncited-constant.js` fails any
numeric literal in `packages/core`, `packages/model` or `packages/solvers` that
lacks a `@source` or `@derived` annotation. If a value is genuinely unknown,
encode it as `uncertain({low, nominal, high, reason, resolvedBy})` from
`@airship/data`. It then appears in the generated uncertainty report, sorted by
how much it moves the endurance number, which is the project's research to-do
list. **Do not silently pick a plausible value.** That is the one failure mode
this repository exists to prevent.

**Purity is a state variable, not a refinement.** Modelled with pure helium, USS
Macon's gross lift comes out 6.3 percent high and fails its own validation gate.
At the Navy's stated 95 percent service purity it lands within 1 percent. Air
leaks inward continuously and purity decays; that decay is lift.

**Superheat has two regimes and they differ by everything.** A partially full
cell is free to expand at ambient pressure, so a 20 K superheat is a 7.5 percent
lift *increase*. A full cell cannot expand, so the same 20 K produces zero lift
change and about 7 kPa of overpressure, which is far above any sane relief
setting, so the cell valves and the lift is gone permanently. See
`superheatResponse` in `packages/core/src/buoyancy.ts`. Confusing the two is the
difference between a control input and an irreversible loss.

**Altitude means geopotential altitude.** ISA is defined on it, published tables
are tabulated against it, and the difference from geometric altitude reaches
63 m at 20 km, which is 0.3 percent in pressure and three times the validation
tolerance. `geometricToGeopotential` exists; use it at the boundary.

**ISA fixes its own gas constant at 8.31432 J/(mol K)**, which is not the modern
SI value of 8.314462618. `ISA.gasConstant` and `CONSTANTS.R` are deliberately
separate and both are correct. Using the modern value to reproduce a published
atmosphere table shifts density by 25 ppm and breaks agreement with every table
in aviation. Do not "fix" this.

**Humid air is less dense than dry air.** Water at 18 g/mol displaces air
averaging 29. Saturated air at 30 C costs about 2 percent of density and
therefore 2 percent of gross lift. This gets left out of airship models
routinely, and it gets left out in the direction that flatters the design.

**Real-gas compressibility applies to tanks, not to cells.** Hydrogen at 700 bar
has Z = 1.43, so the ideal gas law over-predicts stored mass by 40 percent. In a
gas cell at ambient pressure Z = 1.0006 and the ideal law is right. Same gas,
different question, and the model must not use one correction for both.

**Added mass is mandatory in the 6-DOF solver.** The displaced air mass is
comparable to the ship mass. Without the full 6x6 tensor from Lamb's inertia
coefficients the transverse response is wrong by roughly a factor of two and the
vehicle will feel like nothing real.

## Layout

```
packages/units     Branded SI types. Meters cannot be assigned to Kilograms.
packages/data      Every constant with a source and an uncertainty. The
                   citation layer, and the only place non-SI units may appear.
packages/core      Pure physics. No UI, no I/O, no framework. Runs headless.
packages/model     The parameter tree and the named design points.
packages/solvers   Sizing, energy balance, mission integrator, 6-DOF.
apps/web           airship.diy. The only tier allowed to import three or react.
docs/              The engineering notebook. A deliverable, not an afterthought.
tools/             Report generation, sweeps, checks.
```

Dependency direction is `units -> data -> core -> model -> solvers -> app` and
lint enforces it. A drag function that reaches for the baseline hull length is no
longer a drag function.

## Commands

```bash
make check       # everything CI runs
make check-fast  # the same without the slow suites
make validate    # the model against every rigid airship that ever flew
make report      # headless run of the physics, no browser, no test runner
make web         # the site, locally
```

## Things that will bite you

**`packages/core` must run under plain `node`.** `make report` is the standing
proof. If it ever needs a shim, something has leaked in that does not belong.

**Tests run against `src`, not `dist`.** Vitest aliases `@airship/*` to source.
A stale `dist` would otherwise let a test pass against code that no longer
exists. The build is still checked, separately, by `make type-check`.

**Validation cases catch being wrong; unit tests only catch regressions.** Both
are required. `packages/data/src/validation/` holds published figures for every
ship in the brief's table. **Where the model misses, document why rather than
tuning a fudge factor to hide it.**

**Tell me when the answer is no.** If the loop does not close, if the structure
does not close, if hand-layup composites cannot hit the mass fraction, say so
plainly and show the number that kills it. A well-supported no is worth more
than an optimistic yes. This is a design tool, not an advocacy document.

**The water landing requirement is not a footnote.** Flotation itself is trivial:
a 10 t ship displaces 10 m3 of water against a 100,000 m3 envelope. The hard
parts are windage (a 90 m hull afloat is a 2,000 m2 sail with only a small wetted
hull resisting it, so single-point weathervaning off a bow drogue is mandatory),
galvanic corrosion (CFRP is cathodic to aluminium in seawater and will eat any
unisolated fitting), and slamming loads in the design sea state. It also
strengthens the thesis: the ocean is unlimited ballast and unlimited electrolyzer
feedstock, so "never land" becomes "never touch land".

**Do not pull later phases forward.** The build order in the brief runs through
phase 8 and each phase has a validation gate. Nothing downstream of a failing
gate is trustworthy, so finish and verify each gate before opening the next.

## Style

No em dashes anywhere: not in docs, comments, commit messages, or UI copy. Use a
comma, a colon, parentheses, or two sentences.

Second person, imperative in procedures. Direct and unhyped. Sentence case
headings. Short paragraphs, numbered steps for procedures, tables for reference.

**Comments explain why, not what.** A physics function documents its governing
equation, its assumptions, and its validity range, and throws or warns outside
that range. An extrapolated model produces a number, and a number is exactly what
a caller will use.

TypeScript strict, ESM, no default exports.
