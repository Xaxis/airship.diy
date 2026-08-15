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

Phases 1 and 2 complete, phase 3 in progress. The build order is gated: nothing
downstream of a failing validation gate is trustworthy, so each phase must pass
before the next opens.

| Phase | What it answers | Status |
|---|---|---|
| 1. Foundation | Units, atmosphere, gas properties, buoyancy | **Gates pass** |
| 2. Does it close? | Permeation, electrolysis, fuel cell, solar, water balance | **Yes, by a lot** |
| 3. Can it be built? | Structure, buckling, mass fraction vs size | **Undecided, and that is the finding** |
| 4. Does it fly? | Aerodynamics, propulsors, 6-DOF with added mass | Added mass and Munk moment done |
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

**The number carbon fibre has to beat, corrected twice.** The brief cited USS
Macon's 60.1 percent, but that is the ship's whole fixed weight: frame, cover,
twelve gas cells, eight engines, three keels, an aircraft hangar, a trapeze and
armament. Not a structure figure. The right benchmark is LZ-129 Hindenburg, and
on an ISA basis that is **51.8 percent**, not the 48.8 first published here: the
lower figure divides by a 242 tonne gross lift only reachable with pure hydrogen
at 0 degrees C.

So "40 to 50 percent with carbon fibre" means **beating the best airship ever
built by two to twelve points**, using hand wet layup in a 12 m shop. The
correction made the target harder, not easier.

## Phase 2: does the loop close?

Yes, and by more than expected. Baseline is 90 m at fineness 5, holding station
against 8 m/s for two thirds of the day at 15 degrees north, after a 0.68
clear-sky derate:

```
  station keeping      43,115 kWh/yr   83.0%
  habitat and systems   7,884 kWh/yr   15.2%
  lift makeup             953 kWh/yr    1.8%
  TOTAL DEMAND         51,952 kWh/yr
  SOLAR GENERATED     342,824 kWh/yr

  annual margin 539%, worst day 402% on day 354
  max sustainable wind 12.6 m/s (25 kt) at 65 percent duty
```

**The finding is not that it closes. It is that energy is not the binding
constraint and is not close to being one.** Lift makeup, the term that sounds
like it should dominate a hydrogen airship, is under 2 percent of demand.
Station keeping is 83 percent and it is cubic in wind speed, so the real
question this vehicle faces is not whether it can power itself but what weather
it can live in.

## Phase 3: can it be built?

**Undecided, and the honest answer is that the historical record cannot settle
it.** Empty weight scaled from the Hindenburg's 0.590 kg per cubic metre, at the
range of scaling exponents the data cannot distinguish:

```
  volume          n=1.13      n=1.00      n=0.90      n=0.80      n=0.67
   5,953 m3          33%         52%         74%       105%!       167%!
  15,803 m3          37%         52%         67%         86%       121%!
  37,458 m3          42%         52%         61%         72%         90%
  80,000 m3          46%         52%         57%         62%         70%
 200,000 m3          52%         52%         52%         52%         52%

  ! = cannot lift its own empty weight
```

Fitting all eight rigids with published figures gives an exponent of 1.13
(R-squared 0.94), which would mean the baseline closes at 37 percent and that
mass fraction gets *worse* with size, not better. But the fit is not robust: it
is dominated by two derived clusters over a 3.3 to 1 volume range, and
restricting to the five best-sourced ships collapses it to 0.16 at R-squared
0.45. The usable range is 0.67 to 1.15 with a nominal near 1.0.

The scatter that swamps the size trend is worth naming, because it is where the
real leverage is. **Structural material moves the fraction by 9.5 points at
constant size, year and specification**: R100 in duralumin came in at 67.4
percent against R101's 76.9 in stainless steel, both built to the same Air
Ministry requirement in the same year. Gas choice moves it by about 4.6.

**The two candidate exponents disagree about the direction of the entire size
trade.** At the theoretical square-cube value the baseline ship cannot lift its
own empty weight. A model that quietly picked the favourable end would report a
comfortable design where the truth is a coin flip.

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
