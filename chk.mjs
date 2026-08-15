import { massStatement, BASELINE, BASELINE_ARRANGEMENT, finPlanform } from './packages/model/dist/index.js'
const s = massStatement(BASELINE, BASELINE_ARRANGEMENT)
console.log('gasVolume', s.gasVolume.toFixed(1))
console.log('total(gross)', s.total.toFixed(1))
console.log('empty', s.emptyWeight.toFixed(1))
console.log('grossLift', s.grossLift.toFixed(1), 'margin', s.liftMargin.toFixed(1))
for (const i of s.items) if (i.computed) console.log('  ', i.id, i.mass.toFixed(1), 'kg')
console.log('propulsor count', BASELINE_ARRANGEMENT.propulsors.length)
const fins = finPlanform(BASELINE, BASELINE_ARRANGEMENT)
console.log('fin area', fins.area.toFixed(1), 'm2  mass', fins.mass.toFixed(1))
// back out areas
const frame = s.items.find(i=>i.id==='frame').mass
const cover = s.items.find(i=>i.id==='cover').mass
const cells = s.items.find(i=>i.id==='gas-cells').mass
const pv    = s.items.find(i=>i.id==='photovoltaics').mass
console.log('coverArea = cover/0.25 =', (cover/0.25).toFixed(1))
console.log('cellFilmArea = cells/0.27 =', (cells/0.27).toFixed(1))
console.log('arrayArea = pv/1.2 =', (pv/1.2).toFixed(1))
console.log('byCategory', JSON.stringify(Object.fromEntries(Object.entries(s.byCategory).map(([k,v])=>[k,+v.toFixed(0)]))))
