/**
 * Levels are built backwards. Starting from an empty board with its mirrors and
 * walls, pieces are added one at a time, and a piece may only be added where
 * its path out is clear of everything already placed. Taking the pieces away
 * in the reverse of that order then always works, so every generated level is
 * solvable by construction; later pieces sitting across earlier pieces' paths
 * are what make the order matter.
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
  pieces: number
  mirrors: number
  walls: number
  maxLen: number
  /** How strongly the generator prefers pieces that block others: the puzzle's depth. */
  bite: number
  tier: Tier
  seed: number
}

/** Difficulty by level: bigger boards, more pieces, mirrors from 3, walls from 25. */
export function spec(level: number): LevelSpec {
  const tier: Tier = level % 25 === 0 ? 'super' : level % 10 === 0 ? 'hard' : 'normal'
  const mult = tier === 'super' ? 1.6 : tier === 'hard' ? 1.3 : 1
  const w = Math.min(10, 4 + Math.floor(level / 14))
  const h = Math.min(15, 5 + Math.floor(level / 9))
  const base = level <= 3 ? level + 2 : 4 + level * 0.55
  const pieces = Math.min(Math.floor(w * h * 0.27), Math.round(base * mult))
  const mirrors = level < 3 ? 0 : Math.min(12, 1 + Math.floor(level / 7) + (tier !== 'normal' ? 2 : 0))
  const walls = level < 25 ? 0 : Math.min(10, 1 + Math.floor((level - 25) / 12))
  const maxLen = level < 5 ? 2 : level < 20 ? 3 : level < 60 ? 4 : 5
  // Early levels teach, so few pieces depend on each other; later ones are chains.
  const bite = level <= 3 ? 0 : Math.min(3, 0.6 + level * 0.04) * (tier === 'normal' ? 1 : 1.4)
  return { level, w, h, pieces, mirrors, walls, maxLen, bite, tier, seed: level * 2654435761 + 97 }
}

const DIRS: Dir[] = [0, 1, 2, 3]

/** A snake body grown back from the head, never through a taken cell. */
function body(b: Board, taken: Set<number>, hx: number, hy: number, d: Dir, len: number, r: () => number): Array<[number, number]> | null {
  const cells: Array<[number, number]> = [[hx, hy]]
  const used = new Set([key(b, hx, hy)])
  // The first segment runs straight back from the head so the arrow reads clearly.
  let back = ((d + 2) % 4) as Dir
  for (let i = 1; i < len; i++) {
    const [cx, cy] = cells[cells.length - 1]
    const turns: Dir[] = i === 1 ? [back] : r() < 0.6 ? [back, ((back + 1) % 4) as Dir, ((back + 3) % 4) as Dir] : [((back + 1) % 4) as Dir, ((back + 3) % 4) as Dir, back]
    let placed = false
    for (const t of turns) {
      const nx = cx + DX[t], ny = cy + DY[t]
      const k = key(b, nx, ny)
      if (!inside(b, nx, ny) || taken.has(k) || used.has(k) || b.mirrors.has(k) || b.walls.has(k)) continue
      cells.push([nx, ny]); used.add(k); back = t; placed = true
      break
    }
    // Late in a fill the only openings are rim cells with no room behind them:
    // a one-cell arrow still reads, and without it boards stayed half empty.
    if (!placed) return cells
  }
  return cells
}

export function generate(s: LevelSpec): Board {
  const r = rng(s.seed)
  const b: Board = { w: s.w, h: s.h, pieces: [], mirrors: new Map<number, Mirror>(), walls: new Set<number>() }
  const rc = (): [number, number] => [Math.floor(r() * s.w), Math.floor(r() * s.h)]
  // Mirrors keep off the rim, where they could only turn a path straight out.
  for (let i = 0, tries = 0; i < s.mirrors && tries < 200; tries++) {
    const [x, y] = rc()
    if (x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1) continue
    const k = key(b, x, y)
    if (b.mirrors.has(k)) continue
    b.mirrors.set(k, r() < 0.5 ? '/' : '\\')
    i++
  }
  for (let i = 0, tries = 0; i < s.walls && tries < 200; tries++) {
    const [x, y] = rc()
    const k = key(b, x, y)
    if (b.mirrors.has(k) || b.walls.has(k)) continue
    b.walls.add(k)
    i++
  }

  let id = 1
  // Each step samples candidates and keeps the one that blocks the most pieces
  // already on the board: that is what turns a pile of arrows into an order to
  // work out, and keeps the opening board from being mostly free moves.
  for (let step = 0; b.pieces.length < s.pieces && step < s.pieces * 3; step++) {
    const taken = cellsOf(b, b.pieces)
    let best: Piece | null = null
    let bestScore = -1
    // Every empty cell and direction whose straight-out path is clear; a random
    // sample of those gets bodies and is scored.
    const heads: Array<[number, number, Dir]> = []
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const k = key(b, x, y)
      if (taken.has(k) || b.mirrors.has(k) || b.walls.has(k)) continue
      for (const d of DIRS) {
        const probe: Piece = { id: 0, cells: [[x, y]], dir: d, hue: 0 }
        if (trace(b, probe, taken).exits) heads.push([x, y, d])
      }
    }
    if (heads.length === 0) break
    const paths = b.pieces.map((q) => trace(b, q, taken).path)
    for (let c = 0; c < Math.min(40, heads.length); c++) {
      const [hx, hy, d] = heads.splice(Math.floor(r() * heads.length), 1)[0]
      const len = 2 + Math.floor(r() * (s.maxLen - 1))
      const cells = body(b, taken, hx, hy, d, len, r)
      if (!cells) continue
      const p: Piece = { id, cells, dir: d, hue: Math.floor(r() * 6) }
      const own = cells.map(([x, y]) => key(b, x, y))
      if (!trace(b, p, new Set([...taken, ...own])).exits) continue
      // How many placed pieces would this one stand in the way of?
      const mine = new Set(own)
      let blocks = 0
      for (const path of paths) if (path.some(([x, y]) => mine.has(key(b, x, y)))) blocks++
      const score = blocks * s.bite + cells.length * 0.3 + r()
      if (score > bestScore) { bestScore = score; best = p }
    }
    if (!best) break
    b.pieces.push(best)
    id++
  }
  // The newest pieces were placed last; the player sees them in a stable order.
  b.pieces.sort((a, c) => a.id - c.id)
  return b
}

/** Today's puzzle: the same for everyone on a given day, a notch above the player. */
export function dailySpec(date: Date, playerLevel: number): LevelSpec {
  const day = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  const base = spec(Math.max(12, Math.round(playerLevel * 0.8) + 10))
  return { ...base, tier: 'hard', seed: day * 7919 + 13 }
}
