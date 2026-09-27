/**
 * Boot, the frame loop, input and flow between home and a level.
 * `window.__ro` exposes state for tests.
 */

import './ui/style.css'
import { dailySpec, spec, type LevelSpec } from './game/generate'
import { dustFor, finishDaily, fresh, load, save, skinOf, type Profile } from './game/meta'
import { addHeart, hammer, hint, pieceAt, start, starsFor, tap, tick, type Session } from './game/session'
import { free } from './game/board'
import { cellAt, draw, layout, type Layout } from './render/draw'
import { play, resetStreak, setMuted, unlockAudio } from './audio'
import { buzz, setHaptics } from './haptics'
import { NO_ADS, SIM, maybeInterstitial, setAdProvider } from './ads'
import { events, track } from './analytics'
import { showHome, showHud, type Ctx } from './ui/screens'
import { showLose, showWin } from './ui/modals'
import { closeLayer, h, layer } from './ui/dom'

const canvas = document.getElementById('board') as HTMLCanvasElement
const c = canvas.getContext('2d')!
let profile: Profile = load()
setMuted(!profile.settings.sound)
setHaptics(profile.settings.haptics)

let session: Session | null = null
let isDaily = false
let hammering = false
let ended = false
let L: Layout = { cell: 1, ox: 0, oy: 0, w: 0, h: 0 }
let dpr = 1
const TOP = 96, BOTTOM = 120

function resize(): void {
  dpr = Math.min(3, window.devicePixelRatio || 1)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
}
resize()
window.addEventListener('resize', resize)

const ctx: Ctx = {
  get profile() { return profile },
  play: (s, daily = false) => begin(s, daily),
  home: () => home(),
  daily: () => begin(dailySpec(new Date(), profile.level), true),
}

function home(): void {
  session = null
  for (const id of ['hud', 'win', 'lose', 'sheet', 'tip']) closeLayer(id)
  showHome(ctx)
}

function begin(s: LevelSpec, daily: boolean): void {
  unlockAudio()
  resetStreak()
  closeLayer('home'); closeLayer('sheet')
  session = start(s)
  isDaily = daily
  hammering = false
  ended = false
  profile.stats.plays++
  save(profile)
  track('level_start', { level: s.level, daily })
  hud()
  tutorial()
}

function hud(): void {
  if (!session) return
  const s = session
  showHud({
    spec: s.spec, daily: isDaily, profile,
    hearts: () => s.hearts, maxHearts: () => s.maxHearts,
    exit: () => { track('level_quit', { level: s.spec.level }); home() },
    hint: () => { if (hint(s)) { profile.boosters.hint--; save(profile); play('hint'); hud() } },
    hammer: () => { hammering = true; tip('지울 조각을 탭하세요') },
  })
}

/** Teaching lines, one at a time, at the moments they matter. */
function tutorial(): void {
  if (!session || isDaily) return
  const lv = session.spec.level
  if (lv === 1) tip('화살표를 탭하면 그 방향으로 날아가요')
  else if (lv === 3) tip('거울에 닿으면 90도로 꺾여요')
  else if (lv === 4) tip('막혔을 때는 💡 힌트를 써 보세요')
  else if (lv === 25) tip('벽은 통과할 수 없어요')
  else closeLayer('tip')
}

function tip(text: string): void {
  const t = layer('tip', 'layer tip-layer')
  t.appendChild(h('div', 'tip', text))
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio()
  const s = session
  if (!s || s.state !== 'play') return
  const [x, y] = cellAt(L, e.clientX, e.clientY)
  const p = pieceAt(s, x, y)
  if (!p) return
  profile.stats.taps++
  if (hammering) {
    hammering = false
    closeLayer('tip')
    if (hammer(s, p.id)) { profile.boosters.hammer--; save(profile); play('hammer'); buzz('tap'); hud() }
    return
  }
  const r = tap(s, p.id)
  if (r === 'exit') { play('swoosh'); buzz('tap'); if (s.spec.level <= 2) closeLayer('tip') }
  else if (r === 'bump') {
    play('bump'); buzz('bump'); profile.stats.bumps++; hud()
    if (profile.stats.bumps === 1) tip('막힌 화살표를 누르면 하트를 잃어요')
  }
})

function finish(): void {
  const s = session!
  ended = true
  if (s.state === 'won') {
    const stars = starsFor(s)
    const dust = dustFor(stars, s.spec.tier)
    play('win'); buzz('win')
    track(isDaily ? 'daily_clear' : 'level_clear', { level: s.spec.level, stars, mistakes: s.mistakes, t: Math.round(s.t) })
    profile.stats.clears++
    let bonus = 0
    if (isDaily) bonus = finishDaily(profile)
    else {
      profile.stars[s.spec.level] = Math.max(profile.stars[s.spec.level] ?? 0, stars)
      profile.level = Math.max(profile.level, s.spec.level + 1)
    }
    save(profile)
    const nextLabel = isDaily ? '홈으로' : '다음 레벨 ▶'
    setTimeout(() => showWin({
      title: isDaily ? `오늘의 퍼즐 완료! +${bonus}` : `레벨 ${s.spec.level} 클리어!`,
      stars, dust, next: nextLabel, adOffer: profile.stats.clears > 3,
      onNext: (mult) => {
        profile.dust += dust * mult
        save(profile)
        if (isDaily) { home(); return }
        void maybeInterstitial(profile.level).then(() => begin(spec(profile.level), false))
      },
    }), 450)
  } else {
    play('lose')
    track('level_fail', { level: s.spec.level, cleared: s.cleared, total: s.total })
    setTimeout(() => showLose({
      onHeart: () => { addHeart(s); ended = false; hud() },
      onRetry: () => begin(s.spec, isDaily),
      onHome: () => home(),
    }), 500)
  }
}

let last = 0
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000 || 0)
  last = now
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  const W = window.innerWidth, H = window.innerHeight
  if (session) {
    tick(session, dt)
    L = layout(session, W, H, TOP, session.spec.level < 4 && !isDaily ? 40 : BOTTOM)
    draw(c, session, L, skinOf(profile), W, H, profile.settings.colorblind)
    if (session.spec.level === 1 && !isDaily && session.cleared === 0) finger(session, now / 1000)
    if (!ended && session.state !== 'play') finish()
  } else {
    const sk = skinOf(profile)
    const g = c.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, sk.bg[0]); g.addColorStop(1, sk.bg[1])
    c.fillStyle = g; c.fillRect(0, 0, W, H)
  }
  requestAnimationFrame(frame)
}

/** On the very first board, a pulsing ring over a piece that can go. */
function finger(s: Session, t: number): void {
  const f = free({ ...s.board, pieces: s.board.pieces.filter((p) => !s.leaving.has(p.id)) })[0]
  if (!f) return
  const [x, y] = f.cells[0]
  const px = L.ox + (x + 0.5) * L.cell, py = L.oy + (y + 0.5) * L.cell
  const k = (t * 1.6) % 1
  c.strokeStyle = `rgba(255,255,255,${1 - k})`
  c.lineWidth = 3
  c.beginPath(); c.arc(px, py, L.cell * (0.4 + k * 0.5), 0, Math.PI * 2); c.stroke()
}

Object.assign(window, {
  __ro: {
    get profile() { return profile },
    get session() { return session },
    get layout() { return L },
    start: (level: number) => begin(spec(level), false),
    daily: () => ctx.daily(),
    reset: () => { profile = fresh(); save(profile); home() },
    home: () => home(),
    save: () => save(profile),
    tapPiece: (id: number) => (session ? tap(session, id) : 'none'),
    free: () => (session ? free({ ...session.board, pieces: session.board.pieces.filter((p) => !session!.leaving.has(p.id)) }).map((p) => p.id) : []),
    tick: (n: number, dt = 1 / 60) => { for (let i = 0; i < n; i++) if (session) tick(session, dt) },
    events, SIM, setAdProvider, NO_ADS,
  },
})

track('boot', { level: profile.level })
// A first launch goes straight onto the first board: nothing to read before the first tap.
if (profile.stats.plays === 0) begin(spec(1), false)
else home()
requestAnimationFrame(frame)
