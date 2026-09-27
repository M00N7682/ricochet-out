/**
 * The board on a 2D canvas, drawn as light: glowing snakes with arrowheads,
 * mirrors as bright diagonal bars, walls as dark blocks. Everything is sized
 * from one cell length so any board fits any phone.
 */

import type { Piece } from '../game/board'
import { traceNow } from '../game/board'
import type { Mover, Session } from '../game/session'
import type { Skin } from '../game/meta'

export interface Layout { cell: number; ox: number; oy: number; w: number; h: number }

/** Fits the board between the top bar and the booster bar, with a margin of half a cell. */
export function layout(s: Session, W: number, H: number, top: number, bottom: number): Layout {
  const { w, h } = s.board
  const cell = Math.min((W - 24) / (w + 1), (H - top - bottom) / (h + 1))
  const bw = cell * w, bh = cell * h
  return { cell, ox: (W - bw) / 2, oy: top + (H - top - bottom - bh) / 2, w: bw, h: bh }
}

export function cellAt(L: Layout, px: number, py: number): [number, number] {
  return [Math.floor((px - L.ox) / L.cell), Math.floor((py - L.oy) / L.cell)]
}

const cx = (L: Layout, x: number): number => L.ox + (x + 0.5) * L.cell
const cy = (L: Layout, y: number): number => L.oy + (y + 0.5) * L.cell

export function draw(c: CanvasRenderingContext2D, s: Session, L: Layout, skin: Skin, W: number, H: number, colorblind: boolean): void {
  const g = c.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, skin.bg[0]); g.addColorStop(1, skin.bg[1])
  c.fillStyle = g
  c.fillRect(0, 0, W, H)

  c.save()
  if (s.shake > 0) c.translate((Math.random() - 0.5) * s.shake * 10, (Math.random() - 0.5) * s.shake * 10)

  // Board plate and dot grid.
  round(c, L.ox - L.cell * 0.3, L.oy - L.cell * 0.3, L.w + L.cell * 0.6, L.h + L.cell * 0.6, L.cell * 0.4, 'rgba(255,255,255,0.04)')
  c.fillStyle = 'rgba(255,255,255,0.14)'
  for (let y = 0; y < s.board.h; y++) for (let x = 0; x < s.board.w; x++) {
    c.beginPath(); c.arc(cx(L, x), cy(L, y), Math.max(1, L.cell * 0.05), 0, Math.PI * 2); c.fill()
  }

  for (const k of s.board.walls) {
    const x = k % s.board.w, y = Math.floor(k / s.board.w)
    round(c, L.ox + x * L.cell + L.cell * 0.1, L.oy + y * L.cell + L.cell * 0.1, L.cell * 0.8, L.cell * 0.8, L.cell * 0.18, '#2a3358')
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.stroke()
    // Cross-hatch so a wall never reads as an empty cell.
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1.5
    const x0 = L.ox + x * L.cell + L.cell * 0.25, y0 = L.oy + y * L.cell + L.cell * 0.25, q = L.cell * 0.5
    c.beginPath(); c.moveTo(x0, y0 + q); c.lineTo(x0 + q, y0); c.moveTo(x0, y0 + q * 0.5); c.lineTo(x0 + q * 0.5, y0); c.moveTo(x0 + q * 0.5, y0 + q); c.lineTo(x0 + q, y0 + q * 0.5); c.stroke()
  }

  for (const [k, m] of s.board.mirrors) {
    const x = k % s.board.w, y = Math.floor(k / s.board.w)
    const r = L.cell * 0.38
    const [x0, y0, x1, y1] = m === '/' ? [-r, r, r, -r] : [-r, -r, r, r]
    glow(c, '#e0fbfc', L.cell * 0.35)
    c.strokeStyle = '#e0fbfc'; c.lineWidth = L.cell * 0.12; c.lineCap = 'round'
    c.beginPath(); c.moveTo(cx(L, x) + x0, cy(L, y) + y0); c.lineTo(cx(L, x) + x1, cy(L, y) + y1); c.stroke()
    c.shadowBlur = 0
  }

  // A hinted piece shows the way it would go.
  if (s.hint) {
    const p = s.board.pieces.find((q) => q.id === s.hint!.id)
    if (p) {
      const col = skin.hues[p.hue % skin.hues.length]
      drawPath(c, s, L, p, col, s.t)
      // A ring on the arrow itself: many hinted arrows sit on the rim with no path to show.
      const k = (s.t * 1.4) % 1
      c.strokeStyle = '#ffffff'; c.globalAlpha = 1 - k; c.lineWidth = L.cell * 0.08
      c.beginPath(); c.arc(cx(L, p.cells[0][0]), cy(L, p.cells[0][1]), L.cell * (0.45 + k * 0.45), 0, Math.PI * 2); c.stroke()
      c.globalAlpha = 1
    }
  }

  const moving = new Set(s.movers.map((m) => m.piece.id))
  for (const p of s.board.pieces) {
    if (moving.has(p.id)) continue
    const col = skin.hues[p.hue % skin.hues.length]
    const pts = p.cells.map(([x, y]) => [cx(L, x), cy(L, y)] as [number, number])
    const pulse = s.hint?.id === p.id ? 1 + Math.sin(s.t * 10) * 0.12 : 1
    snake(c, pts, p.dir, col, L.cell * pulse, colorblind ? p.hue : -1)
  }
  for (const m of s.movers) {
    const col = skin.hues[m.piece.hue % skin.hues.length]
    const pts = moverPoints(m).map(([x, y]) => [cx(L, x), cy(L, y)] as [number, number])
    snake(c, pts, null, col, L.cell, colorblind ? m.piece.hue : -1)
  }

  for (const f of s.flashes) {
    const k = 1 - f.t / 0.5
    c.strokeStyle = f.color; c.globalAlpha = k; c.lineWidth = L.cell * 0.12
    c.beginPath(); c.arc(cx(L, f.x), cy(L, f.y), L.cell * (0.35 + f.t), 0, Math.PI * 2); c.stroke()
    c.globalAlpha = 1
  }
  for (const p of s.sparks) {
    c.globalAlpha = Math.max(0, 1 - p.t / 0.7)
    glow(c, p.color, L.cell * 0.4)
    c.fillStyle = p.color
    c.beginPath(); c.arc(cx(L, p.x), cy(L, p.y), L.cell * 0.08, 0, Math.PI * 2); c.fill()
  }
  c.globalAlpha = 1; c.shadowBlur = 0
  c.restore()
}

/** Where a moving snake's cells are right now, head first, interpolated along its track. */
function moverPoints(m: Mover): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i < m.piece.cells.length; i++) out.push(along(m.track, m.pos - i))
  return out
}

function along(track: Array<[number, number]>, t: number): [number, number] {
  const i = Math.max(0, Math.min(track.length - 1, Math.floor(t)))
  const j = Math.min(track.length - 1, i + 1)
  const f = Math.max(0, Math.min(1, t - i))
  return [track[i][0] + (track[j][0] - track[i][0]) * f, track[i][1] + (track[j][1] - track[i][1]) * f]
}

const ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2]

/** A glowing snake from head (first point) to tail, with an arrowhead on the head. */
function snake(c: CanvasRenderingContext2D, pts: Array<[number, number]>, dir: number | null, col: string, cell: number, mark: number): void {
  const [hx, hy] = pts[0]
  let a: number
  if (dir !== null) a = ANGLE[dir]
  else if (pts.length > 1) a = Math.atan2(hy - pts[1][1], hx - pts[1][0])
  else a = 0
  glow(c, col, cell * 0.5)
  c.strokeStyle = col; c.lineWidth = cell * 0.3; c.lineCap = 'round'; c.lineJoin = 'round'
  // Start the body behind the arrowhead so its round cap does not poke out past it.
  c.beginPath(); c.moveTo(pts.length > 1 ? hx - Math.cos(a) * cell * 0.18 : hx, pts.length > 1 ? hy - Math.sin(a) * cell * 0.18 : hy)
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1])
  if (pts.length === 1) c.lineTo(hx - Math.cos(a) * cell * 0.25, hy - Math.sin(a) * cell * 0.25)
  c.stroke()
  // Arrowhead.
  const tip = cell * 0.42, wide = cell * 0.3
  c.fillStyle = col
  c.beginPath()
  c.moveTo(hx + Math.cos(a) * tip, hy + Math.sin(a) * tip)
  c.lineTo(hx + Math.cos(a + 2.3) * wide, hy + Math.sin(a + 2.3) * wide)
  c.lineTo(hx + Math.cos(a - 2.3) * wide, hy + Math.sin(a - 2.3) * wide)
  c.closePath(); c.fill()
  c.shadowBlur = 0
  // Colour-blind mode: a small shape on the tail says which colour it is.
  if (mark >= 0) {
    const [tx, ty] = pts[pts.length - 1]
    c.fillStyle = '#0b1026'
    c.font = `900 ${Math.round(cell * 0.28)}px system-ui`
    c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText('●▲■◆★✚'[mark % 6], tx, ty)
  }
}

function drawPath(c: CanvasRenderingContext2D, s: Session, L: Layout, p: Piece, col: string, t: number): void {
  const tr = traceNow({ ...s.board, pieces: s.board.pieces.filter((q) => !s.leaving.has(q.id)) }, p)
  const pts: Array<[number, number]> = [[cx(L, p.cells[0][0]), cy(L, p.cells[0][1])], ...tr.path.map(([x, y]) => [cx(L, x), cy(L, y)] as [number, number])]
  // Carry the line past the edge so the way out is unmistakable.
  const d = tr.dirs.length ? tr.dirs[tr.dirs.length - 1] : p.dir
  const [lx, ly] = pts[pts.length - 1]
  pts.push([lx + Math.cos(ANGLE[d]) * L.cell * 1.3, ly + Math.sin(ANGLE[d]) * L.cell * 1.3])
  c.save()
  c.setLineDash([L.cell * 0.2, L.cell * 0.2])
  c.lineDashOffset = -t * L.cell * 2
  c.strokeStyle = col; c.globalAlpha = 0.85; c.lineWidth = L.cell * 0.14
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1])
  for (const q of pts.slice(1)) c.lineTo(q[0], q[1])
  c.stroke()
  c.restore()
}

function glow(c: CanvasRenderingContext2D, col: string, blur: number): void {
  c.shadowColor = col; c.shadowBlur = blur
}

export function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r)
  c.closePath(); c.fillStyle = fill; c.fill()
}
