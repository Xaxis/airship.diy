# Regulatory

The brief asks for one specific deliverable: **a written statement of the
maximum legal continuous flight duration under current US rules, with the
specific rule that binds it.** This document is that statement, plus the two
other regulatory questions that turned out to have surprising answers.

Nothing here is legal advice. Every claim cites the rule text so it can be
checked, and where the answer rests on an untested reading that is said plainly.

## The answer: 12 calendar months

**Maximum legal continuous flight is 12 calendar months, and the binding
requirement is the condition-inspection operating limitation issued with the
experimental airworthiness certificate.**

### The expected citation is wrong

The brief expects 14 CFR 91.409, the annual inspection rule. **91.409 does not
bind this aircraft.** Paragraph (c)(1) exempts

> an aircraft that carries a special flight permit, a current experimental
> certificate, or a light-sport or provisional airworthiness certificate

from both the annual and the 100-hour inspection requirements. An experimental
amateur-built aircraft carries a current experimental certificate, so it is
exempt by the rule's own words.

The 12-month clock comes from somewhere else: the **operating limitations**
issued as part of the experimental airworthiness certificate under 14 CFR 91.319
and FAA Order 8130.2. Those limitations require a **condition inspection** at
least once every 12 calendar months, performed to the scope and detail of
**14 CFR part 43 Appendix D**, and signed by an appropriately rated mechanic or
by the holder of a **repairman certificate (experimental aircraft builder)**
issued under **14 CFR 65.104**.

The distinction matters for two reasons. First, it is a different legal
instrument: operating limitations are issued per aircraft, so the exact wording
must be read on the certificate rather than assumed. Second, and more usefully,
the requirements attach to different things.

### The condition inspection does not have to happen on the ground

**Nothing in the rule or in part 43 Appendix D specifies a location.** They
specify scope, detail, and who signs.

Appendix D is a list of what must be inspected: fuselage and hull group, cabin
and cockpit group, engine and nacelle group, landing gear, systems and
components, propeller group, and so on, each to be inspected for specified
defects after removing or opening all necessary inspection plates, access
doors, fairings and cowlings.

Three facts combine:

1. The builder of an amateur-built aircraft may hold the repairman certificate
   under 65.104 for **that specific aircraft**, and may therefore sign its
   condition inspection.
2. The builder is aboard.
3. In a **rigid** airship the frame, gas cells, machinery and systems are
   accessible from the internal keel and walkways in flight, which is not true
   of a light aeroplane where the inspection requires jacking, cowling removal
   and control-surface travel checks on the ground.

So an in-flight condition inspection is not textually prohibited. **This reading
is untested.** No FAA legal interpretation on point was found, and a local
Flight Standards office may take a different view. It should be settled with a
written request for interpretation before it is relied on, not discovered
afterwards. But the honest statement of the regulatory limit is:

> **12 calendar months between condition inspections. Whether that forces a
> landing depends on whether the inspection may be performed in flight by the
> builder-repairman, which is unresolved and worth resolving in writing.**

### What binds next, and why none of it is shorter

| Requirement | Interval | Rule | Forces a landing? |
|---|---|---|---|
| Condition inspection | 12 calendar months | Operating limitations, 91.319 | Possibly not, see above |
| Transponder test | 24 calendar months | 91.413 | Yes, needs ground equipment |
| Altimeter and static system | 24 calendar months, IFR only | 91.411 | Yes, and avoidable by not flying IFR |
| Registration renewal | 7 years | 47.40 | No, renewable by mail |
| ELT battery | Per 91.207 | 91.207 | **Does not apply**, see below |

**The ELT requirement does not apply.** 14 CFR 91.207(a) attaches to a
"U.S.-registered civil **airplane**", and 14 CFR 1.1 defines an airplane as an
engine-driven fixed-wing aircraft heavier than air. An airship is neither
fixed-wing nor heavier than air. Carrying an ELT anyway is obviously sensible
for a vehicle that operates over open ocean; it is simply not a legal interval
that forces a landing.

So **nothing else is shorter than 12 months**, and the transponder test at 24
months is the next thing that genuinely needs ground equipment.

## Hydrogen is not prohibited

This one is widely misstated, including in forum discussions that treat it as
settled law.

The only FAA text on hydrogen as a lifting gas is **AC 21.17-1A** (25 September
1992), paragraph 7.c:

> Hydrogen is not an acceptable lifting gas for use in airships.

Two things about that document control how much it means:

- **Paragraph 1** states: "This material is neither mandatory nor regulatory in
  nature and does not constitute a regulation." An advisory circular describes
  one acceptable means of compliance. It is not a rule.
- **Paragraph 6** scopes the document to **type certification**.

An experimental amateur-built aircraft is not type certificated. It is
certificated under 14 CFR 21.191(g) for the purpose of education or recreation,
subject to the 51 percent major portion rule. AC 21.17-1A does not reach it.

**So hydrogen is excluded by non-binding guidance that does not apply to this
aircraft.** What remains is real but different in kind:

- **Insurance.** Effectively unobtainable. This is a commercial fact, not a
  legal one, and it should be planned for rather than argued with.
- **Airspace and overflight.** Operating limitations for experimental aircraft
  routinely prohibit flight over densely populated areas and in congested
  airways, which is a constraint on route rather than on gas.
- **The inspector.** The certificate is issued by a person exercising judgement.
  A designated airworthiness representative who has read AC 21.17-1A may decline
  regardless of its legal status. That is a practical obstacle and no amount of
  correct reading dissolves it.

## Afloat: aircraft or vessel?

Unresolved and worth resolving, because it changes the inspection regime.

While waterborne, an aircraft on the surface is generally treated as a vessel
for the purposes of the navigation rules (COLREGS), which means it must show the
correct lights and keep a lookout. That does not make it a vessel for
certification purposes, and there is no obvious route by which USCG inspection
requirements would attach to an experimental aircraft that happens to float.

The interesting question is the opposite one: whether time spent afloat counts
against any aviation interval at all. Nothing found says it does.

## What to do about it

1. **Request a written FAA interpretation** on whether a condition inspection
   may be performed in flight by the builder-repairman. This is the single
   highest-value regulatory action available and it costs a letter.
2. **Read the actual operating limitations** when issued. They are per-aircraft
   and the wording varies.
3. **Do not fly IFR**, which removes the 24-month altimeter and static check.
4. **Assume no insurance** and design the risk case accordingly.
5. **Do not argue AC 21.17-1A with an inspector.** Establish the certification
   path first.

## Sources

- 14 CFR 91.319, 91.409(c)(1), 91.411, 91.413, 91.207, 47.40, 65.104, 21.191(g)
- 14 CFR part 43 Appendix D, scope and detail of annual and 100-hour inspections
- 14 CFR 1.1, definition of "airplane"
- FAA Order 8130.2, airworthiness certification of aircraft
- FAA AC 21.17-1A, type certification: airships
- FAA-P-8110-2, Airship Design Criteria. **Note: this is a NONRIGID airship
  document.** Its introduction scopes it to "conventional, near-equilibrium,
  nonrigid airships" and its structural subpart contains no girder buckling
  criteria, so it cannot supply the rigid-airship structural load cases the
  project brief expected from it.
