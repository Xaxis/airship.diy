import { test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { BASELINE, BASELINE_ARRANGEMENT, massStatement, hullBendingMoment } from '../src/index.js'

const OUT = '/private/tmp/claude-501/-Users-wilneeley-Projects-airship-diy/3ddbbf90-ccc2-4716-9c0f-460d25b0aaab/scratchpad/dump.txt'

test('dump', () => {
  const st: any = massStatement(BASELINE as any, BASELINE_ARRANGEMENT as any)
  const lines: string[] = []
  lines.push('STATEMENT KEYS: ' + Object.keys(st).join(', '))
  for (const it of st.items) lines.push(`${it.id}\t${it.category}\t${Number(it.mass).toFixed(1)} kg`)
  for (const k of Object.keys(st)) {
    const v = st[k]
    if (typeof v === 'number') lines.push(`num ${k} = ${v}`)
  }
  try { lines.push('BENDING: ' + JSON.stringify((hullBendingMoment as any)(BASELINE, BASELINE_ARRANGEMENT))) } catch (e: any) { lines.push('bending err ' + e.message) }
  writeFileSync(OUT, lines.join('\n'))
})
