/**
 * The puzzle's rules, free of rendering.
 *
 * A board is a grid of cells. Pieces are short neon snakes: a list of cells,
 * head first, with the head pointing one way. Tapping a piece sends its head
 * straight on; a mirror in a cell turns it 90 degrees ('/' or '\'), a wall
 * stops it. A piece whose path leaves the board slides out and is gone; a
 * piece whose path runs into another piece, a wall or itself bumps and costs a
 * heart. Clear every piece to win.
 */

export type Dir = 0 | 1 | 2 | 3 // right, down, left, up (screen coordinates, y grows down)
export const DX = [1, 0, -1, 0]
export const DY = [0, 1, 0, -1]

export type Mirror = '/' | '\\'

export interface Piece {
  id: number
  /** Cells as [x, y], head first. */
  cells: Array<[number, number]>
  dir: Dir
  /** Palette slot, for colour. */
  hue: number
}

export interface Board {
  w: number
  h: number
  pieces: Piece[]
  mirrors: Map<number, Mirror>
  walls: Set<number>
}

export const key = (b: { w: number }, x: number, y: number): number => y * b.w + x
export const inside = (b: { w: number; h: number }, x: number, y: number): boolean => x >= 0 && y >= 0 && x < b.w && y < b.h

/** '/' sends right→up, up→right, left→down, down→left; '\' sends right→down and so on. */
export function reflect(d: Dir, m: Mirror): Dir {
  if (m === '/') return ([3, 2, 1, 0] as Dir[])[d]
  return ([1, 0, 3, 2] as Dir[])[d]
}

export interface Trace {
  /** Cells the head passes through, in order, after leaving its own cell. */
  path: Array<[number, number]>
  /** Direction the head is travelling in at each path cell. */
  dirs: Dir[]
  exits: boolean
  /** Where it stopped, when it did not exit: the cell it could not enter. */
  blockedAt: [number, number] | null
}

/**
 * Follows a piece's head from its cell to the edge. `occupied` holds every
 * cell that stops it (other pieces and its own body). A path that loops back
 * on itself through mirrors is cut off after w*h*4 steps and counts as blocked.
 */
export function trace(b: Board, p: Piece, occupied: Set<number>): Trace {
  let [x, y] = p.cells[0]
  let d = p.dir
  const path: Array<[number, number]> = []
  const dirs: Dir[] = []
  for (let steps = 0; steps < b.w * b.h * 4; steps++) {
    const nx = x + DX[d], ny = y + DY[d]
    if (!inside(b, nx, ny)) return { path, dirs, exits: true, blockedAt: null }
    const k = key(b, nx, ny)
    if (b.walls.has(k) || occupied.has(k)) return { path, dirs, exits: false, blockedAt: [nx, ny] }
    x = nx; y = ny
    const m = b.mirrors.get(k)
    if (m) d = reflect(d, m)
    path.push([x, y])
    dirs.push(d)
  }
  return { path, dirs, exits: false, blockedAt: null }
}

/** Every cell a piece sits on, as keys. */
export function cellsOf(b: Board, pieces: Piece[]): Set<number> {
  const s = new Set<number>()
  for (const p of pieces) for (const [x, y] of p.cells) s.add(key(b, x, y))
  return s
}

/** A piece's path given the board as it stands. */
export function traceNow(b: Board, p: Piece): Trace {
  return trace(b, p, cellsOf(b, b.pieces))
}

export const canLeave = (b: Board, p: Piece): boolean => traceNow(b, p).exits

/** Pieces that could be tapped away right now. */
export const free = (b: Board): Piece[] => b.pieces.filter((p) => canLeave(b, p))

/**
 * True when the board can be cleared. Removing a piece only ever frees cells,
 * so a board is solvable exactly when repeatedly removing any free piece
 * empties it — no search, no order to get wrong.
 */
export function solvable(b: Board): boolean {
  const rest = { ...b, pieces: b.pieces.slice() }
  for (;;) {
    if (rest.pieces.length === 0) return true
    const f = rest.pieces.find((p) => canLeave(rest, p))
    if (!f) return false
    rest.pieces = rest.pieces.filter((p) => p !== f)
  }
}
