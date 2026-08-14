# airship.diy

**Design the smallest hydrogen airship that a competent person can build in a
shop and then never have to land, powered by sunlight, fuel cells and engines so
that no single technology failure ends the flight, prove it with physics that
survives comparison to every rigid airship ever flown, and make the whole
argument inspectable in a browser.**

This is an open engineering notebook, not a concept renderer. The output is a
buildable specification. The visualization exists to make that specification
inspectable and falsifiable.

Site: **[airship.diy](https://airship.diy)**

## Status

Phase 1 of 8 complete. The build order is gated: nothing downstream of a failing
validation gate is trustworthy, so each phase must pass before the next opens.

| Phase | What it answers | Status |
|---|---|---|
| 1. Foundation | Units, atmosphere, gas properties, buoyancy | **Gates pass** |
| 2. Does it close? | Permeation, electrolysis, fuel cell, solar, water balance | Next |
| 3. Can it be built? | Structure, buckling, mass fraction vs length | |
| 4. Does it fly? | Aerodynamics, propulsors, 6-DOF with added mass | |
| 4b. The powertrain decision | Fuel choice, TBO consumables, dissimilar redundancy | |
| 5. Can it be lived in? | Habitat, life support, thermal, the year-long mission | |
| 6. Will it kill me? | Hydrogen safety, lightning, failure injection, icing, regulation | |
| 7. The site | Design explorer, 3D hull, flight simulator, mission player | |
| 8. Build documentation | Frame drawings, laminate schedules, BOM, fabrication sequence | |

Marine mode (water landing and boat operation) runs alongside phases 3 through 6.

## Phase 1 validation gates

The model is checked against ships that actually flew. These figures come from
`make report`, which runs the physics headless under plain `node`.

```
Specific lift at ISA sea level, pure gas:
  hydrogen 1.1397 kg/m3
  helium   1.0557 kg/m3

Gross lift validation gate:
  LZ-129 Hindenburg        model  227.9 t   published  232.0 t   error -1.75%  [tol 3%]  PASS
  USS Macon (ZRS-5)        model  184.6 t   published  182.8 t   error +0.99%  [tol 3%]  PASS
  USS Akron (ZRS-4)        model  184.6 t   published  182.8 t   error +0.99%  [tol 3%]  PASS
```

The ISA gate reproduces published standard atmosphere values to better than
0.1 percent at 0, 1000, 5000, 11000 and 20000 m.

### The finding from phase 1

**Gas purity is a first-order term, not a refinement.**

```
  Macon at 95% service purity   184.6 t   error +0.99%   PASS
  Macon at 100% pure helium     194.3 t   error +6.30%   FAIL
```

The US Navy quoted Akron and Macon at 95 percent fill with "helium of standard
purity", which was itself about 95 percent, because helium was expensive and the
Navy cared about the lift it actually had rather than the lift the envelope
implied. Modelled with pure helium the ship fails its own gate by more than
twice the tolerance.

Air leaks inward through the cell film continuously, and that inward leak is what
destroys purity. Lost purity is lost lift, permanently, unless the gas is
replaced. On a vehicle whose entire premise is never landing, the only way to
replace it is to make more, which is why onboard electrolysis is load-bearing
rather than clever.

**The number carbon fibre has to beat:** USS Macon carried 109.9 t of duralumin
structure against 182.8 t of gross lift. **60.1 percent of the ship's entire lift
went into holding itself up.** The target here is 40 to 50 percent, and phase 3
has to prove that rather than assume it.

## What this vehicle is

| Constraint | Value |
|---|---|
| Lifting gas | Hydrogen |
| Structure | Carbon fibre composite, wet layup and vacuum bag, shop-fabricable |
| Primary power | PEM fuel cells plus photovoltaics |
| Secondary power | Engines driving generators, series hybridPropulsion |
| Propulsors | All electric. No engine drives a propeller mechanically. |
| Lift makeup | Onboard PEM electrolysis from collected water |
| Altitude control | Compressor and high-pressure storage, plus water ballast |
| Crew | 2 nominal, 4 surge |
| Operating band | 0 to 4,000 m |
| Endurance target | 365 days without ground contact, stretch goal 5 years |
| Water operation | Lands on water and operates as a boat |

**"Hybrid" here means the powertrain, never the lift.** This vehicle is fully
buoyant; heavier-than-air operation is a failure mode. The bare word is banned
in code and prose and lint enforces it. See `docs/TERMINOLOGY.md`.

## Repository layout

```
packages/units     Branded SI types. A Meters cannot be assigned to a Kilograms.
packages/data      Every constant with a source and an uncertainty.
packages/core      Pure physics. No UI, no I/O, no framework. Runs headless.
packages/model     The parameter tree and the named design points.
packages/solvers   Sizing, energy balance, mission integrator, 6-DOF.
apps/web           airship.diy.
docs/              The engineering notebook. A deliverable, not an afterthought.
tools/             Report generation, sweeps, checks.
```

## How this repository keeps itself honest

**A number without a source is a build failure.** A custom lint rule rejects any
numeric literal in the physics packages that does not carry a `@source` or
`@derived` annotation. Values that are genuinely unknown are encoded as
`Uncertain` with a range and a statement of what measurement would resolve them,
and they surface in a generated report sorted by how much they move the endurance
figure. That sorted list is the project's research queue.

**Validation cases catch being wrong. Unit tests only catch regressions.** Both
run in CI. Where the model misses a published figure, the miss is documented
rather than tuned away.

**Where a source contradicts itself, the fixture says so.** Wikipedia's
Hindenburg article calls 232 t a "useful lift" while also giving a 215 t gross
weight, which cannot both hold. The fixture records the conflict and states which
reading the model uses and why.

## Commands

```bash
make check       # everything CI runs
make check-fast  # the same without the slow suites
make validate    # the model against every rigid airship that ever flew
make report      # headless run of the physics, no browser, no test runner
make web         # the site, locally
```

## Licence

MIT. The design is meant to be built, including by people who are not me.
