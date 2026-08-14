# Terminology

Words in this project that mean something specific, and that will cause a real
defect if used loosely. Lint and `make prose` enforce the first one; the rest are
enforced by review.

## "Hybrid" alone is banned

In airship literature the word almost always means **hybrid lift**: a vehicle
that gets part of its lift from buoyancy and part from aerodynamic lift at
forward speed. The HAV Airlander is the well-known example. A hybridLift vehicle
is heavier than the air it displaces and flies partly like an aircraft, which
means it needs forward speed to stay up and it cannot simply stop.

**This vehicle is not that.** It is fully buoyant. Heavier-than-air operation is
a failure mode, not a design mode, and the ability to hold station indefinitely
at zero airspeed is the entire point.

"Hybrid" here refers exclusively to the **powertrain**: PEM fuel cells and
photovoltaics working alongside internal combustion engines driving generators.

Write `hybridPropulsion` when you mean the powertrain. Write `hybridLift` only
when discussing somebody else's vehicle. A bare "hybrid" in an identifier, a
string, a comment, a document, or a UI label fails the build.

The reason this is mechanically enforced rather than left to care: the two
meanings are close enough that a reader substitutes the wrong one without
noticing, and a design document that is ambiguous about whether the ship needs
forward speed to stay up is a document nobody can check.

## The three lifts

These are constantly confused in the literature, including in otherwise careful
sources.

| Term | Definition | Sign |
|---|---|---|
| **Gross lift** | Mass of air displaced minus mass of lifting gas. A property of the envelope and the atmospheric condition. | Always positive |
| **Useful lift** | Gross lift minus empty weight. What the ship can carry. | Positive on a viable design |
| **Net static lift** | Gross lift minus *total current* weight, including everything aboard right now. | Signed |
| **Static heaviness** | The negative of net static lift. **Positive means heavy.** | Signed |

The model tracks static heaviness rather than net static lift because heavy is
the safe direction and a positive number should mean the safe state. A light ship
climbs whether or not anybody asked it to, and at pressure height a light ship
valves gas it cannot get back.

Wikipedia's Hindenburg article calls 232 t a "useful lift" while also giving a
215 t gross weight for the ship. Those cannot both be true, since useful lift is
gross lift minus empty weight and therefore cannot exceed gross weight. The
validation fixture records the contradiction in a `discrepancy` field and states
which reading the model uses.

## Purity, fill fraction, and pressure height

**Purity** is the mole fraction of the lifting species in a cell. It decays
continuously because air leaks inward through the cell film. It is a state
variable, not a constant, and it is first-order in lift.

**Fill fraction** is the fraction of a cell's maximum volume that the gas
currently occupies. It rises with altitude as ambient pressure falls.

**Pressure height** is the altitude at which fill fraction reaches 1. Above it,
further ascent forces gas out of the cells, and **valved hydrogen is
unrecoverable lift**. Below it the hull is "soft" and the cells are limp.

Both purity and fill fraction are dimensionless and both are usually about 0.95,
which is exactly why the type system brands them differently.

## Superheat and supercool

**Superheat** is gas temperature above ambient. Solar loading on a dark hull
drives it to plus 15 to 25 K. **Supercool** is gas temperature below ambient, and
clear-sky night radiation drives it to minus 5 to 10 K.

The lift consequence depends entirely on whether the cell can expand, and the two
regimes are not a small correction apart. A partially full cell expands at
ambient pressure and a 20 K superheat is a 7.5 percent lift increase. A full cell
cannot expand, so the same 20 K changes lift by nothing at all and instead
produces about 7 kPa of overpressure, which is far above any sane relief setting.
The cell valves, and the lift is gone permanently.

## Volumetric coefficients

Airship aerodynamics uses volume to the two-thirds power as the reference area,
not a wing area, because there is no wing:

```
C_DV = D / (q * V^(2/3)),  q = 0.5 * rho * v^2
```

This is standard airship practice and it is what makes cross-comparison with
historical ships possible. Any drag coefficient in this repository is volumetric
unless it says otherwise.

## Regimes A, B and C

The three endurance cases, which are reported separately and never averaged.

- **Regime A, closed loop.** Solar and electrolysis only, fuel cell for
  conversion, engines cold. Bounded by component life and consumables rather
  than by energy. Theoretically indefinite. **Regime A closing is the project's
  thesis.**
- **Regime B, closed loop with engine assist.** Engines burn self-manufactured
  hydrogen. Still closed, but at lower conversion efficiency, so it draws down
  the solar budget faster.
- **Regime C, reserve.** Engines burn stored hydrocarbon. The loop is
  deliberately open. Finite by tankage. This is the weather-escape and get-home
  capability.

## Marine mode

**Waterborne** means floating and supported partly by hydrostatic buoyancy.
**Hull-borne** is the same thing borrowed from seaplane practice. The vehicle is
never fully waterborne in the way a boat is, because the envelope is still
carrying most of the weight; the fraction resting on the water is tracked
explicitly as the **waterborne load fraction**.

**Windage** is the aerodynamic force on the vehicle while it sits on the water.
It dominates marine operation. A 90 m hull afloat presents roughly 2,000 m2 of
lateral area against a wetted hull of a few square metres, so the vehicle
weathervanes and drifts rather than holding position, and single-point mooring
off a bow drogue is mandatory rather than optional.
