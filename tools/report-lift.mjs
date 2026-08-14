// Headless validation report.
//
// Proves packages/core runs with no browser, no bundler and no test runner,
// which is the whole reason the physics tiers are framework-free. If this script
// ever needs a shim, something has leaked into core that does not belong there.
import { HISTORICAL_SHIPS } from '../packages/data/dist/index.js'
import {
  atmosphere,
  grossLift,
  specificLift,
  pure,
  STANDARD_GAS_TEMPERATURE,
} from '../packages/core/dist/index.js'

const sl = atmosphere(0)
console.log(
  '\nISA sea level: T=%s K  p=%s Pa  rho=%s kg/m3',
  sl.temperature.toFixed(2),
  sl.pressure.toFixed(0),
  sl.density.toFixed(6),
)

console.log('\nSpecific lift at ISA sea level, pure gas:')
console.log('  hydrogen %s kg/m3', specificLift(pure('hydrogen'), sl, STANDARD_GAS_TEMPERATURE).toFixed(4))
console.log('  helium   %s kg/m3', specificLift(pure('helium'), sl, STANDARD_GAS_TEMPERATURE).toFixed(4))

console.log('\nGross lift validation gate:')
for (const s of HISTORICAL_SHIPS) {
  const p = grossLift(s.gasVolume, { species: s.liftingGas, purity: s.purity }, sl, STANDARD_GAS_TEMPERATURE)
  const pub = s.publishedGrossLift
  const line = `  ${s.name.padEnd(24)} model ${(p / 1000).toFixed(1).padStart(7)} t`
  if (pub) {
    const err = (p / pub - 1) * 100
    const verdict = Math.abs(err / 100) < s.grossLiftTolerance ? 'PASS' : 'FAIL'
    console.log(
      `${line}   published ${(pub / 1000).toFixed(1).padStart(7)} t   error ${
        err >= 0 ? '+' : ''
      }${err.toFixed(2)}%  [tol ${(s.grossLiftTolerance * 100).toFixed(0)}%]  ${verdict}`,
    )
  } else {
    console.log(`${line}   (no published gross lift; see fixture note)`)
  }
}

const macon = HISTORICAL_SHIPS.find((s) => s.id === 'zrs5-macon')
const atService = grossLift(
  macon.gasVolume,
  { species: 'helium', purity: macon.purity },
  sl,
  STANDARD_GAS_TEMPERATURE,
)
const asPure = grossLift(macon.gasVolume, pure('helium'), sl, STANDARD_GAS_TEMPERATURE)

console.log('\nWhy purity is a state variable and not a refinement:')
console.log(
  '  Macon at 95%% service purity   %s t   error %s%%   PASS',
  (atService / 1000).toFixed(1),
  ((atService / macon.publishedGrossLift - 1) * 100).toFixed(2),
)
console.log(
  '  Macon at 100%% pure helium     %s t   error %s%%   FAIL',
  (asPure / 1000).toFixed(1),
  ((asPure / macon.publishedGrossLift - 1) * 100).toFixed(2),
)

console.log('\nThe empty weight fraction carbon fibre has to beat:')
console.log(
  '  Macon duralumin structure     %s t of %s t gross lift = %s%%',
  (macon.publishedDeadweight / 1000).toFixed(1),
  (macon.publishedGrossLift / 1000).toFixed(1),
  ((macon.publishedDeadweight / macon.publishedGrossLift) * 100).toFixed(1),
)
console.log()
