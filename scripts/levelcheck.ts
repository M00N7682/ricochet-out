/** Every level solvable, pieces placed as specified, and a sense of how puzzling each is. */
import { generate, spec } from '../src/game/generate'
import { free, solvable } from '../src/game/board'
const N = Number(process.argv[2] ?? 500)
let bad = 0, short = 0
const t0 = Date.now()
const rows: string[] = []
for (let L = 1; L <= N; L++) {
  const s = spec(L)
  const b = generate(s)
  if (!solvable(b)) bad++
  if (b.pieces.length < s.pieces * 0.9) short++
  if (L <= 12 || L % 25 === 0 || L === 100 || L === 300) rows.push(`${L}${s.tier[0]}:${s.w}x${s.h} ${b.pieces.length}/${s.pieces}p free${free(b).length} m${b.mirrors.size}`)
}
console.log(rows.join('  '))
console.log(`levels ${N}: unsolvable ${bad}, under-filled ${short}, ${Date.now() - t0}ms`)
