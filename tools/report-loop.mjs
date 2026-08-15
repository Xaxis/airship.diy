// Phase 2: does the loop close?
//
// The central question of the project. Runs the annual energy and mass balance
// for every named design point and reports the verdict, whatever it is.
import { DESIGN_POINTS } from '../packages/model/dist/index.js'
import { energyBalance, maximumSustainableWind } from '../packages/solvers/dist/index.js'

const kWh = (joules) => joules / 3.6e6
const pad = (s, n) => String(s).padEnd(n)

for (const design of DESIGN_POINTS) {
  const r = energyBalance(design)

  console.log('\n' + '='.repeat(78))
  console.log('%s  (%s)', design.name.toUpperCase(), design.id)
  console.log('='.repeat(78))
  console.log(design.description)

  console.log('\nGeometry')
  console.log('  %s %s m at fineness %s', pad('hull', 22), design.hull.length, design.hull.finenessRatio)
  console.log('  %s %s m3', pad('envelope volume', 22), r.hullVolume.toFixed(0))
  console.log('  %s %s kg at sea level', pad('gross lift', 22), r.grossLiftAvailable.toFixed(0))
  console.log('  %s %s m2', pad('array area', 22), r.arrayArea.toFixed(0))
  console.log(
    '  %s %s kg (%s%% of gross lift)',
    pad('array mass', 22),
    r.arrayMass.toFixed(0),
    ((r.arrayMass / r.grossLiftAvailable) * 100).toFixed(1),
  )

  console.log('\nPermeation')
  console.log('  %s %s kg/day', pad('hydrogen leak', 22), r.dailyHydrogenLeak.toFixed(3))
  console.log('  %s %s %%/year', pad('annual loss', 22), (r.annualLeakFraction * 100).toFixed(2))

  console.log('\nEnergy, annualised')
  const total = r.habitatEnergy + r.propulsionEnergy + r.liftMakeupEnergy
  const share = (x) => ((x / total) * 100).toFixed(1).padStart(5)
  console.log('  %s %s kWh  %s%%', pad('station keeping', 22), kWh(r.propulsionEnergy).toFixed(0).padStart(9), share(r.propulsionEnergy))
  console.log('  %s %s kWh  %s%%', pad('habitat and systems', 22), kWh(r.habitatEnergy).toFixed(0).padStart(9), share(r.habitatEnergy))
  console.log('  %s %s kWh  %s%%', pad('lift makeup', 22), kWh(r.liftMakeupEnergy).toFixed(0).padStart(9), share(r.liftMakeupEnergy))
  console.log('  %s %s kWh', pad('TOTAL DEMAND', 22), kWh(r.annualDemand).toFixed(0).padStart(9))
  console.log('  %s %s kWh', pad('SOLAR GENERATED', 22), kWh(r.annualGenerated).toFixed(0).padStart(9))

  console.log('\n  %s %s kW to hold %s m/s', pad('station keeping power', 22), (r.stationKeepingPower / 1000).toFixed(1), design.mission.stationKeepingWind)
  console.log('  %s %s%% (vs 94%% for lithium)', pad('hydrogen round trip', 22), (r.hydrogenRoundTrip * 100).toFixed(0))

  console.log('\nVERDICT')
  console.log('  Regime A (solar and electrolysis only, engines cold):')
  console.log('    %s', r.closes ? 'THE LOOP CLOSES' : 'THE LOOP DOES NOT CLOSE')
  console.log('    annual margin      %s%%', (r.annualMargin * 100).toFixed(1))
  console.log('    worst day          day %s, margin %s%%', r.worstDay, (r.worstDayMargin * 100).toFixed(1))
  console.log('    binding constraint %s', r.bindingConstraint)

  const maxWind = maximumSustainableWind(design)
  console.log(
    '    max sustainable wind %s m/s (%s kt) at %s%% duty',
    maxWind.toFixed(1),
    (maxWind * 1.94384).toFixed(0),
    (design.mission.stationKeepingDutyCycle * 100).toFixed(0),
  )
}

console.log('\n' + '='.repeat(78))
console.log('Caveats. Cloud enters as one annual-average clearSkyFraction, not as a weather')
console.log('model, and real cloud is correlated in time so a run of overcast days is worse')
console.log('than the average implies. No compressor energy for altitude control. No')
console.log('structural or habitat mass, so no check yet that the ship can carry its own')
console.log('array. No component degradation. Every one of these makes the answer worse, so')
console.log('a design that fails here fails for real, and one that passes has met a')
console.log('necessary condition rather than a sufficient one.')
console.log('='.repeat(78) + '\n')
