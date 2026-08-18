// Phase 5: which resource runs out first?
//
// The question the energy balance cannot answer. Energy is not the binding
// constraint; this finds out what is.
import {
  BASELINE_ARRANGEMENT,
  DESIGN_POINTS,
  consumables,
  provisionsFor,
} from '../packages/model/dist/index.js'
import { integrateMission } from '../packages/solvers/dist/index.js'

const pad = (s, n) => String(s).padEnd(n)

// TWO NUMBERS, AND THEY ARE DIFFERENT QUESTIONS.
//
// AS DRAWN is what the stores bay holds: the loadout on the drawing. AT
// CAPACITY is what the design could carry if the spare lift beyond its growth
// reserve were loaded as food, which is what measures the DESIGN rather than a
// loading choice.
//
// The second one exists because this tool used to hand every design point the
// baseline's stores and report 471 days for all three. Endurance was
// `food / (crew * dailyFood)` and nothing else, so a 65 m hull scored exactly
// what a 125 m hull scored and no physics anywhere could move the figure the
// project calls its figure of merit. Worse, the 65 m point has a lift margin of
// MINUS eleven tonnes: it was being given an endurance for a ship that cannot
// leave the ground.
const asDrawn = consumables(BASELINE_ARRANGEMENT)

/** @derived Long enough to contain the fully provisioned answers, days. */
const HORIZON = 6000

console.log('\n' + '='.repeat(78))
console.log('WHICH RESOURCE RUNS OUT FIRST')
console.log('='.repeat(78))

for (const design of DESIGN_POINTS) {
  const capacity = provisionsFor(design, BASELINE_ARRANGEMENT)

  console.log('\n%s  (%s)', design.name.toUpperCase(), design.id)

  if (!capacity.closes) {
    console.log('  %s', capacity.note)
    console.log()
    continue
  }

  const drawn = integrateMission(design, asDrawn, HORIZON)
  const result = integrateMission(design, capacity, HORIZON)

  console.log('  stores as drawn: %s kg food, %s kg water (%s kg capacity)',
    asDrawn.food.toFixed(0), asDrawn.water.toFixed(0), asDrawn.waterCapacity.toFixed(0))
  console.log('  at capacity:     %s kg food, using %s kg of spare lift',
    capacity.food.toFixed(0), capacity.extraFood.toFixed(0))
  console.log()
  console.log('  %s %s days   %s', pad('AS DRAWN', 26),
    String(drawn.physicalEnduranceDays).padStart(6), drawn.physicalLimit.toUpperCase())
  console.log('  %s %s days   %s', pad('AT CAPACITY', 26),
    String(result.physicalEnduranceDays).padStart(6), result.physicalLimit.toUpperCase())
  console.log('  %s %s days   %s', pad('INCLUDING LEGAL LIMITS', 26),
    String(result.enduranceDays).padStart(6), result.limitingResource.toUpperCase())
  console.log()
  const w = result.waterBalance
  console.log('  water balance, kg/day:')
  console.log('    consumption %s   recovered %s   net loss %s',
    w.dailyConsumption.toFixed(1).padStart(7),
    w.dailyRecovered.toFixed(1).padStart(7),
    (w.dailyConsumption - w.dailyRecovered).toFixed(1).padStart(6))
  console.log('    rain catchment %s   NET %s   catchment covers net loss %sx',
    w.dailyCatchment.toFixed(0).padStart(6),
    w.dailyNet.toFixed(0).padStart(7),
    w.catchmentMargin.toFixed(0))
  console.log()
  console.log('  each resource on its own:')
  for (const [resource, day] of Object.entries(result.resourceExhaustion).sort((a, b) => a[1] - b[1])) {
    const years = (day / 365.2425).toFixed(2)
    console.log('    %s %s days  (%s years)', pad(resource, 24), String(day).padStart(6), years)
  }
  console.log()
  console.log('  %s', result.explanation)
}

console.log('\n' + '='.repeat(78))
console.log('THE ANSWER: nothing physical runs out before the food does, and the food is')
console.log('a loading decision rather than a discovery. Water does not bind at all in')
console.log('the trade wind belt: rain catchment on a 1,170 m2 plan area exceeds the net')
console.log('loss for two people by more than a hundred times, and by more than fifteen')
console.log('even at the most pessimistic end of every assumption. The vehicle is')
console.log('water-RICH, so ballast and electrolyzer feedstock are effectively free.')
console.log()
console.log('That makes water a STATION-CHOICE question, not an equipment one. Parked')
console.log('under a subtropical high instead of in the trade winds, the catchment term')
console.log('collapses and the whole analysis changes.')
console.log()
console.log('Caveats. Collection efficiency is unmeasured and swings the water balance by')
console.log('a factor of three, though not enough to change the conclusion. Component')
console.log('life and spares are not yet modelled, so anything past the first year or')
console.log('two is optimistic.')
console.log('='.repeat(78) + '\n')
