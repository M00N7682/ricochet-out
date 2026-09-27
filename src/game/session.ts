/**
 * One level being played: the board, hearts, pieces in motion, and the result.
 * Plain data advanced by `tick`; the renderer only reads it.
 */

import type { Board, Dir, Piece } from './board'
import { DX, DY, free, key, traceNow } from './board'
import type { LevelSpec } from './generate'
import { generate } from './generate'

export interface Mover {
  piece: Piece
  /** Tail-to-head cells, then the path, then a run-out past the edge. */
  track: Array<[number, number]>
  /** Head position along `track`, in cells. */
  pos: number
  /** Where the head stops: the far end for an exit, the last free cell for a bump. */
  goal: number
  exits: boolean
  /** A bump goes out and comes back. */
  back: boolean
  /** The cell it hit, for the flash. */
  hit: [number, number] | null
}

export interface Session {
  spec: LevelSpec
  board: Board
  hearts: number
  maxHearts: number
  mistakes: number
  movers: Mover[]
  /** Piece ids currently leaving; they no longer block, and cannot be tapped again. */
  leaving: Set<number>
  state: 'play' | 'won' | 'lost'
  t: number
  /** Short-lived effects for the renderer. */
  flashes: Array<{ x: number; y: number; t: number; color: string }>
  sparks: Array<{ x: number; y: number; vx: number; vy: number; t: number; color: string }>
  hint: { id: number; t: number } | null
  shake: number
  cleared: number
  total: number
}

const SPEED = 22 // cells per second
const RUNOUT = 6
/** Bumps run slower both ways so the push into the blocker reads. */
const BUMP = 9

export function start(spec: LevelSpec): Session {
  const board = generate(spec)
  return {
    spec, board, hearts: 3, maxHearts: 3, mistakes: 0, movers: [], leaving: new Set(),
    state: 'play', t: 0, flashes: [], sparks: [], hint: null, shake: 0, cleared: 0, total: board.pieces.length,
  }
}

/** The board as the rules see it: pieces already leaving are gone. */
function standing(s: Session): Board {
  return { ...s.board, pieces: s.board.pieces.filter((p) => !s.leaving.has(p.id)) }
}

export type TapResult = 'exit' | 'bump' | 'none'

export function tap(s: Session, id: number): TapResult {
  if (s.state !== 'play' || s.leaving.has(id)) return 'none'
  const piece = s.board.pieces.find((p) => p.id === id)
  if (!piece || s.movers.some((m) => m.piece.id === id)) return 'none'
  const b = standing(s)
  const tr = traceNow(b, piece)
  const body = piece.cells.slice().reverse()
  const track: Array<[number, number]> = [...body, ...tr.path]
  if (tr.exits) {
    // Run on past the edge so the whole snake slides off before it is dropped.
    const last = track[track.length - 1]
    const d: Dir = tr.dirs.length ? tr.dirs[tr.dirs.length - 1] : piece.dir
    for (let i = 1; i <= RUNOUT + piece.cells.length; i++) track.push([last[0] + DX[d] * i, last[1] + DY[d] * i])
    s.leaving.add(id)
    s.movers.push({ piece, track, pos: body.length - 1, goal: track.length - 1, exits: true, back: false, hit: null })
    if (s.hint?.id === id) s.hint = null
    return 'exit'
  }
  // Overshoot a little into the blocker so even a piece that cannot move at all visibly tries.
  const end = track[track.length - 1]
  const dLast: Dir = tr.dirs.length ? tr.dirs[tr.dirs.length - 1] : piece.dir
  track.push([end[0] + DX[dLast] * 0.4, end[1] + DY[dLast] * 0.4])
  s.movers.push({ piece, track, pos: body.length - 1, goal: track.length - 1, exits: false, back: false, hit: tr.blockedAt })
  s.hearts--
  s.mistakes++
  s.shake = 0.6
  if (tr.blockedAt) s.flashes.push({ x: tr.blockedAt[0], y: tr.blockedAt[1], t: 0, color: '#ff4d6d' })
  if (s.hearts <= 0) s.state = 'lost'
  return 'bump'
}

export function tick(s: Session, dt: number): void {
  s.t += dt
  s.shake = Math.max(0, s.shake - dt * 3)
  for (const f of s.flashes) f.t += dt
  s.flashes = s.flashes.filter((f) => f.t < 0.5)
  for (const p of s.sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt }
  s.sparks = s.sparks.filter((p) => p.t < 0.7)
  if (s.hint) { s.hint.t += dt; if (s.hint.t > 3) s.hint = null }
  const done: Mover[] = []
  for (const m of s.movers) {
    const start = m.piece.cells.length - 1
    if (!m.back) {
      m.pos = Math.min(m.goal, m.pos + (m.exits ? SPEED : BUMP) * dt)
      if (m.pos >= m.goal) {
        if (m.exits) done.push(m)
        else m.back = true
      }
    } else {
      m.pos = Math.max(start, m.pos - BUMP * dt)
      if (m.pos <= start) done.push(m)
    }
  }
  for (const m of done) {
    s.movers = s.movers.filter((x) => x !== m)
    if (m.exits) {
      s.board.pieces = s.board.pieces.filter((p) => p.id !== m.piece.id)
      s.leaving.delete(m.piece.id)
      s.cleared++
      // The last cell still on the board, where the snake crossed the edge.
      const exitCell = m.track[m.track.length - 1 - (RUNOUT + m.piece.cells.length)] ?? m.track[m.track.length - 1]
      burst(s, exitCell[0], exitCell[1], m.piece.hue)
    }
  }
  if (s.state === 'play' && s.board.pieces.length === 0 && s.movers.length === 0) s.state = 'won'
}

const HUES = ['#4cc9f0', '#f72585', '#b8f35d', '#ffd166', '#9d7bff', '#ff8c42']

export function burst(s: Session, x: number, y: number, hue: number): void {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 3 + Math.random() * 5
    s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, color: HUES[hue % HUES.length] })
  }
}

/** Stars for a clear: three with no bumps, two with one, one otherwise. */
export const starsFor = (s: Session): number => (s.mistakes === 0 ? 3 : s.mistakes === 1 ? 2 : 1)

/** Booster: point at a piece that can leave right now. */
export function hint(s: Session): boolean {
  if (s.hint) return false
  const f = free(standing(s)).filter((p) => !s.leaving.has(p.id))
  if (!f.length) return false
  s.hint = { id: f[Math.floor(Math.random() * f.length)].id, t: 0 }
  return true
}

/** Booster: lift one piece straight off the board, whatever is in its way. */
export function hammer(s: Session, id: number): boolean {
  const p = s.board.pieces.find((q) => q.id === id)
  if (!p || s.leaving.has(id)) return false
  s.board.pieces = s.board.pieces.filter((q) => q.id !== id)
  s.cleared++
  for (const [x, y] of p.cells) burst(s, x, y, p.hue)
  s.shake = 0.3
  if (s.board.pieces.length === 0 && s.movers.length === 0) s.state = 'won'
  return true
}

/** A second chance after running out of hearts. */
export function addHeart(s: Session): void {
  if (s.state !== 'lost') return
  s.hearts = 1
  s.state = 'play'
}

export const pieceAt = (s: Session, x: number, y: number): Piece | undefined =>
  s.board.pieces.find((p) => !s.leaving.has(p.id) && p.cells.some(([cx, cy]) => cx === x && cy === y))

export const cellKey = key
export { HUES }
