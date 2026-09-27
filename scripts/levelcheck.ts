/** Every level solvable, filled close to its target, hard levels deeper than their neighbours. */
import { depthOf, generate, spec } from '../src/game/generate'
import { free, solvable } from '../src/game/board'
const N = Number(process.argv[2] ?? 500)
let bad = 0, short = 0, slow = 0
const depth: number[] = []
const t0 = Date.now()
const rows: string[] = []
for (let L = 1; L <= N; L++) {
  const s = spec(L)
  const t = Date.now()
  const b = generate(s)
  if (Date.now() - t > 60) slow++
  if (!solvable(b)) bad++
  const open = s.w * s.h - b.mirrors.size - b.walls.size
  const fill = b.pieces.reduce((a, p) => a + p.cells.length, 0) / open
  if (L > 3 && fill < s.fill * 0.85) short++
  depth[L] = depthOf(b)
  if (L <= 12 || L % 25 === 0 || L === 100 || L === 300) rows.push(`${L}${s.tier[0]}:${s.w}x${s.h} ${b.pieces.length}p fill${Math.round(fill * 100)} d${depth[L]} free${free(b).length} m${b.mirrors.size}`)
}
let harder = 0, easier = 0
for (let L = 10; L <= N; L += 10) {
  const near = [L - 2, L - 1, L + 1, L + 2].filter((x) => depth[x] !== undefined).map((x) => depth[x])
  const avg = near.reduce((a, x) => a + x, 0) / near.length
  if (depth[L] > avg) harder++; else if (depth[L] < avg) easier++
}
console.log(rows.join('  '))
console.log(`levels ${N}: unsolvable ${bad}, under-filled ${short}, slow ${slow}, hard levels deeper ${harder} / shallower ${easier}, ${Date.now() - t0}ms`)
