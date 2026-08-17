// Phase 5: which resource runs out first?
//
// The question the energy balance cannot answer. Energy is not the binding
// constraint; this finds out what is.
import { BASELINE_ARRANGEMENT, DESIGN_POINTS, consumables } from '../packages/model/dist/index.js'
import { integrateMission } from '../packages/solvers/dist/index.js'

const pad = (s, n) => String(s).padEnd(n)

// READ OFF THE ARRANGEMENT. This tool used to invent its own stores, sized for
// a nominal 400 days, while the vehicle carried something else. An endurance
// figure computed from provisions the ship does not have is the worst place in
// the project for two numbers to mean the same thing, because days aloft is the
// figure of merit and every other trade is measured against it.
const aboard = consumables(BASELINE_ARRANGEMENT)
const storesFor = () => ({
  food: aboard.food,
  water: aboard.water,
  waterCapacity: aboard.waterCapacity,
})

console.log('\n' + '='.repeat(78))
console.log('WHICH RESOURCE RUNS OUT FIRST')
console.log('='.repeat(78))

for (const design of DESIGN_POINTS) {
  const stores = storesFor()
  const result = integrateMission(design, stores, 2200)

  console.log('\n%s  (%s)', design.name.toUpperCase(), design.id)
  console.log('  stores loaded: %s kg food, %s kg water (%s kg capacity)',
    stores.food.toFixed(0), stores.water.toFixed(0), stores.waterCapacity.toFixed(0))
  console.log()
  console.log('  %s %s days   %s', pad('PHYSICAL ENDURANCE', 26),
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
