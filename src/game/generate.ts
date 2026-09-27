/**
 * Levels are built backwards. Starting from an empty board with its mirrors and
 * walls, pieces are added one at a time, and a piece may only be added where
 * its path out is clear of everything already placed. Taking the pieces away
 * in the reverse of that order then always works, so every generated level is
 * solvable by construction; later pieces sitting across earlier pieces' paths
 * are what make the order matter.
 *
 * Difficulty is steered by fill (how much of the board is arrow) and by
 * dependency depth: a few candidate boards are built per level and the one
 * whose depth is nearest the level's target is kept, so hard and super-hard
 * levels are reliably harder than their neighbours.
 */

import type { Board, Dir, Mirror, Piece } from './board'
import { DX, DY, cellsOf, inside, key, trace } from './board'

/** Mulberry32: the same level on every device. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Tier = 'normal' | 'hard' | 'super'

export interface LevelSpec {
  level: number
  w: number
  h: number
  /** Piece cap; only the first levels use it, later ones fill to `fill`. */
  pieces: number
  mirrors: number
  walls: number
  maxLen: number
  /** How strongly the generator prefers pieces that block others. */
  bite: number
  /** Share of open cells to cover with arrows. */
  fill: number
  /** Target dependency depth (rounds of "everything free leaves"). */
  depth: number
  tier: Tier
  seed: number
}

const TRIES = 4

/** Difficulty by level: fuller boards and deeper chains, mirrors from 3, walls from 25. */
export function spec(level: number): LevelSpec {
  const tier: Tier = level % 25 === 0 ? 'super' : level % 10 === 0 ? 'hard' : 'normal'
  const w = Math.min(9, 4 + Math.floor(level / 14))
  const h = Math.min(14, 5 + Math.floor(level / 9))
  const ramp = Math.min(1, Math.max(0, (level - 3) / 110))
  // The first hard level is a nudge, not a wall.
  const early = level <= 10 ? 0.5 : 1
  const fill = level <= 3 ? 0.2 + level * 0.1
    : Math.min(0.9, 0.55 + 0.29 * ramp + (tier === 'super' ? 0.07 : tier === 'hard' ? 0.04 : 0) * early)
  const pieces = level <= 3 ? level + 2 : 999
  const mirrors = level < 3 ? 0 : Math.min(14, 1 + Math.floor(level / 6) + (tier !== 'normal' ? 2 : 0))
  const walls = level < 25 ? 0 : Math.min(10, 1 + Math.floor((level - 25) / 12))
  const maxLen = level < 5 ? 2 : level < 20 ? 3 : level < 60 ? 4 : 5
  const bite = level === 2 ? 3 : level <= 3 ? 0 : Math.min(3, 0.6 + level * 0.04) * (tier === 'normal' ? 1 : 1.4)
  // A breather right after each hard level.
  const after = level > 10 && ((level - 1) % 25 === 0 || (level - 1) % 10 === 0)
  const base = level === 2 ? 2 : level <= 3 ? 1 : Math.min(8, 2 + 6 * (1 - Math.exp(-(level - 3) / 70)))
  const bump = tier === 'super' ? (level <= 25 ? 1.5 : 2.5) : tier === 'hard' ? (level <= 10 ? 0.5 : 1.5) : 0
  const depth = base + bump - (after ? 1 : 0)
  return { level, w, h, pieces, mirrors, walls, maxLen, bite, fill, depth, tier, seed: level * 2654435761 + 97 }
}

const DIRS: Dir[] = [0, 1, 2, 3]

/** A snake body grown back from the head, never through a taken cell; may come out shorter. */
function body(b: Board, taken: Set<number>, hx: number, hy: number, d: Dir, len: number, r: () => number): Array<[number, number]> {
  const cells: Array<[number, number]> = [[hx, hy]]
  const used = new Set([key(b, hx, hy)])
  let back = ((d + 2) % 4) as Dir
  for (let i = 1; i < len; i++) {
    const [cx, cy] = cells[cells.length - 1]
    const side1 = ((back + 1) % 4) as Dir, side2 = ((back + 3) % 4) as Dir
    // The neck is always straight so the arrowhead reads clearly.
    const turns: Dir[] = i === 1 ? [back] : r() < 0.6 ? [back, side1, side2] : [side1, side2, back]
    let placed = false
    for (const t of turns) {
      const nx = cx + DX[t], ny = cy + DY[t]
      const k = key(b, nx, ny)
      if (!inside(b, nx, ny) || taken.has(k) || used.has(k) || b.mirrors.has(k) || b.walls.has(k)) continue
      cells.push([nx, ny]); used.add(k); back = t; placed = true
      break
    }
    if (!placed) break
  }
  return cells
}

/** One candidate board from one seed. */
function build(s: LevelSpec, seed: number): Board {
  const r = rng(seed)
  const b: Board = { w: s.w, h: s.h, pieces: [], mirrors: new Map<number, Mirror>(), walls: new Set<number>() }
  const cell = (): [number, number] => [Math.floor(r() * s.w), Math.floor(r() * s.h)]
  // Mirrors stay off the rim: one there could only ever turn an arrow straight out.
  for (let i = 0, t = 0; i < s.mirrors && t < 200; t++) {
    const [x, y] = cell()
    if (x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1) continue
    const k = key(b, x, y)
    if (b.mirrors.has(k)) continue
    b.mirrors.set(k, r() < 0.5 ? '/' : '\\'); i++
  }
  for (let i = 0, t = 0; i < s.walls && t < 200; t++) {
    const [x, y] = cell()
    const k = key(b, x, y)
    if (b.mirrors.has(k) || b.walls.has(k)) continue
    b.walls.add(k); i++
  }

  const goal = Math.round((s.w * s.h - b.mirrors.size - b.walls.size) * s.fill)
  let id = 1, occ = 0
  for (let step = 0; occ < goal && b.pieces.length < s.pieces && step < s.w * s.h; step++) {
    const taken = cellsOf(b, b.pieces)
    // Every empty cell and direction whose way out is open right now.
    const heads: Array<[number, number, Dir]> = []
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const k = key(b, x, y)
      if (taken.has(k) || b.mirrors.has(k) || b.walls.has(k)) continue
      for (const d of DIRS) if (trace(b, { id: 0, cells: [[x, y]], dir: d, hue: 0 }, taken).exits) heads.push([x, y, d])
    }
    if (!heads.length) break
    const paths = b.pieces.map((q) => trace(b, q, taken).path)
    let best: Piece | null = null, bestScore = -1
    for (let c = 0; c < Math.min(40, heads.length); c++) {
      const [hx, hy, d] = heads.splice(Math.floor(r() * heads.length), 1)[0]
      const cells = body(b, taken, hx, hy, d, 2 + Math.floor(r() * (s.maxLen - 1)), r)
      const p: Piece = { id, cells, dir: d, hue: Math.floor(r() * 6) }
      const own = cells.map(([x, y]) => key(b, x, y))
      const tr = trace(b, p, new Set([...taken, ...own]))
      if (!tr.exits) continue
      // How many placed pieces would this one stand in the way of?
      const mine = new Set(own)
      let blocks = 0
      for (const path of paths) if (path.some(([x, y]) => mine.has(key(b, x, y)))) blocks++
      const bends = s.level >= 3 && tr.path.some(([x, y]) => b.mirrors.has(key(b, x, y))) ? 3 : 0
      // An arrow on the rim facing straight out asks nothing of the player.
      const reach = tr.path.length === 0 ? -2.5 : Math.min(4, tr.path.length) * 0.25
      const score = blocks * s.bite + cells.length * 0.8 + bends + reach + r()
      if (score > bestScore) { bestScore = score; best = p }
    }
    if (!best) break
    b.pieces.push(best); occ += best.cells.length; id++
  }
  if (s.level > 3) grow(b, goal - occ, s.maxLen + 1, r)
  pruneMirrors(b)
  // The newest pieces were placed last; the player sees them in a stable order.
  b.pieces.sort((a, c) => a.id - c.id)
  return b
}

/**
 * Densifier: lengthens tails into empty cells. A cell may join piece P only if
 * neither P nor any piece placed after it (and so removed before it) flies
 * through that cell, which keeps the reverse-insertion order valid.
 */
function grow(b: Board, budget: number, cap: number, r: () => number): void {
  const paths = b.pieces.map((q) => {
    const own = new Set(q.cells.map(([x, y]) => key(b, x, y)))
    return trace(b, q, own).path.map(([x, y]) => key(b, x, y))
  })
  const forbidden: Array<Set<number>> = []
  const acc = new Set<number>()
  for (let i = b.pieces.length - 1; i >= 0; i--) { for (const k of paths[i]) acc.add(k); forbidden[i] = new Set(acc) }
  const taken = cellsOf(b, b.pieces)
  for (let changed = true; changed && budget > 0;) {
    changed = false
    const order = b.pieces.map((_, i) => i).sort(() => r() - 0.5)
    for (const i of order) {
      const p = b.pieces[i]
      if (p.cells.length >= cap || budget <= 0) continue
      const [tx, ty] = p.cells[p.cells.length - 1]
      let opts = DIRS.map((d) => [tx + DX[d], ty + DY[d]] as [number, number]).filter(([x, y]) => {
        if (!inside(b, x, y)) return false
        const k = key(b, x, y)
        return !taken.has(k) && !b.mirrors.has(k) && !b.walls.has(k) && !forbidden[i].has(k)
      })
      // A one-cell arrow grows a straight neck first.
      if (p.cells.length === 1) {
        const [hx, hy] = p.cells[0]
        opts = opts.filter(([x, y]) => x === hx - DX[p.dir] && y === hy - DY[p.dir])
      }
      if (!opts.length) continue
      const c = opts[Math.floor(r() * opts.length)]
      p.cells.push(c); taken.add(key(b, c[0], c[1])); budget--; changed = true
    }
  }
}

/**
 * Drops mirrors no arrow's way out ever crosses: they would only be decoration.
 * Safe, since no path enters those cells, so no path changes.
 */
function pruneMirrors(b: Board): void {
  const crossed = new Set<number>()
  for (const q of b.pieces) {
    const own = new Set(q.cells.map(([x, y]) => key(b, x, y)))
    for (const [x, y] of trace(b, q, own).path) crossed.add(key(b, x, y))
  }
  for (const k of [...b.mirrors.keys()]) if (!crossed.has(k)) b.mirrors.delete(k)
}

/** Rounds of "every free piece leaves at once" needed to clear the board. */
export function depthOf(b: Board): number {
  let ps = b.pieces.slice(), d = 0
  while (ps.length) {
    const occ = cellsOf(b, ps)
    const bb = { ...b, pieces: ps }
    const out = new Set(ps.filter((p) => trace(bb, p, occ).exits))
    if (!out.size) return 99
    ps = ps.filter((p) => !out.has(p)); d++
  }
  return d
}

/** Builds a few candidates from derived seeds and keeps the one nearest the depth target. */
export function generate(s: LevelSpec): Board {
  let best: Board | null = null, bestGap = Infinity
  for (let i = 0; i < TRIES; i++) {
    const b = build(s, s.seed + i * 7919)
    // Ties go to the fuller board.
    const gap = Math.abs(depthOf(b) - s.depth) - b.pieces.reduce((a, p) => a + p.cells.length, 0) * 1e-3
    if (gap < bestGap) { bestGap = gap; best = b }
  }
  return best!
}

/** Today's puzzle: the same for everyone on a given day, a notch above the player. */
export function dailySpec(date: Date, playerLevel: number): LevelSpec {
  const day = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  const base = spec(Math.max(12, Math.round(playerLevel * 0.8) + 10))
  return { ...base, tier: 'hard', depth: base.depth + 1, seed: day * 7919 + 13 }
}
