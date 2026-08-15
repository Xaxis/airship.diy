import { hullGeometry, hullShapeForPrismatic, cellFilmArea } from './packages/core/dist/index.js'
import { massStatement, BASELINE, BASELINE_ARRANGEMENT, keelEnvelopeVolume } from './packages/model/dist/index.js'
const shape = hullShapeForPrismatic(BASELINE.hull.prismaticCoefficient)
const g = hullGeometry(115, 5, shape)
console.log('geometry.volume', (+g.volume).toFixed(1), ' wettedArea', (+g.wettedArea).toFixed(1))
console.log('keelEnvelope', keelEnvelopeVolume(BASELINE_ARRANGEMENT, 115).toFixed(1))
const s = massStatement(BASELINE, BASELINE_ARRANGEMENT)
console.log('gasVolume', s.gasVolume.toFixed(1))
console.log('report used 32,968 -> that is geometry.volume?', Math.abs(+g.volume-32968) < 30)
console.log('\nALL ITEMS:')
for (const i of s.items) console.log(`  ${i.id.padEnd(22)} ${i.mass.toFixed(0).padStart(6)} kg  ${i.category}`)
