// One point of the uncertainty sweep, in its own process.
//
// A FRESH PROCESS PER POINT, which is the whole reason this is a separate file.
// Several values are read into module-scope constants at import time, so an
// in-process override reaches most of the model and silently fails to reach
// those. A sweep that cannot move a value reports it as insensitive, which is
// the same shape of answer as "measured and found not to matter" and is not the
// same thing at all.
//
// Reads AIRSHIP_SWEEP from the environment. Prints one JSON line.
import {
  BASELINE,
  BASELINE_ARRANGEMENT,
  DESIGN_POINTS,
  buildVerdict,
  compareArchitecture,
  consumables,
  failureModes,
  finPlanform,
  hullBendingMoment,
  massStatement,
  redundancyCheck,
  refusedRequirements,
  validateArrangement,
  waterLoopCheck,
  wingSizing,
  powerSchematic,
  waterSchematic,
  assessHabitat,
} from '../packages/model/dist/index.js'
import { energyBalance, integrateMission, maximumSustainableWind } from '../packages/solvers/dist/index.js'
import { unreadProvenanced } from '../packages/data/dist/index.js'

/**
 * EXERCISE THE WHOLE MODEL, not the part the endurance number needs.
 *
 * The unread-citation check asks which provenanced values nothing has read, and
 * that answer is only as good as what has been run. Calling three functions and
 * concluding that fifty-two citations are dead would have been a measurement of
 * this file rather than of the repository.
 */
const exerciseEverything = () => {
  const results = []
  const attempt = (label, thunk) => {
    try {
      results.push([label, thunk()])
    } catch (error) {
      results.push([label, `threw: ${String(error?.message ?? error)}`])
    }
  }
  attempt('mass', () => massStatement(BASELINE, BASELINE_ARRANGEMENT))
  attempt('gates', () => validateArrangement(BASELINE, BASELINE_ARRANGEMENT))
  attempt('girder', () => hullBendingMoment(BASELINE, BASELINE_ARRANGEMENT))
  attempt('fins', () => finPlanform(BASELINE, BASELINE_ARRANGEMENT))
  attempt('wing', () => wingSizing(BASELINE, BASELINE_ARRANGEMENT))
  attempt('energy', () => energyBalance(BASELINE))
  attempt('wind', () => maximumSustainableWind(BASELINE))
  attempt('build', () => buildVerdict(BASELINE, BASELINE_ARRANGEMENT))
  attempt('failures', () => failureModes(BASELINE, BASELINE_ARRANGEMENT))
  attempt('refusals', () => refusedRequirements(BASELINE, 0.2))
  attempt('power', () => redundancyCheck(powerSchematic(BASELINE, BASELINE_ARRANGEMENT)))
  attempt('water', () => waterLoopCheck(waterSchematic({
    dailyConsumption: 50, dailyRecovered: 42, planArea: 2000, dailyCatchment: 2000,
    fuelCellProduct: 13, electrolyzerDemand: 13, tankCapacity: 2500,
  })))
  attempt('habitat', () => assessHabitat(BASELINE_ARRANGEMENT, 5))
  attempt('architecture', () => compareArchitecture(BASELINE, BASELINE_ARRANGEMENT))
  for (const design of DESIGN_POINTS) {
    attempt(`energy:${design.id}`, () => energyBalance(design))
  }
  return results
}

/** @derived The horizon the mission report uses, days. */
const HORIZON = 2200

try {
  exerciseEverything()
  const mission = integrateMission(BASELINE, consumables(BASELINE_ARRANGEMENT), HORIZON)
  const mass = massStatement(BASELINE, BASELINE_ARRANGEMENT)
  const findings = validateArrangement(BASELINE, BASELINE_ARRANGEMENT)
  process.stdout.write(
    JSON.stringify({
      ok: true,
      days: mission.physicalEnduranceDays,
      limit: mission.physicalLimit,
      liftMargin: mass.liftMargin,
      gross: mass.total,
      failures: findings.filter((f) => f.severity === 'fail').length,
      unread: unreadProvenanced().map((e) => `${e.path}#${e.ordinal}`),
    }) + '\n',
  )
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(error?.message ?? error) }) + '\n')
}
