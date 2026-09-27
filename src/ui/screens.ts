/** The home screen, the in-level bars, and the sheets (skins, settings). */

import type { Profile } from '../game/meta'
import { BOOSTER_PRICE, SKINS, constellation, dailyState, save } from '../game/meta'
import type { LevelSpec } from '../game/generate'
import { spec } from '../game/generate'
import { NO_ADS, showRewarded } from '../ads'
import { track } from '../analytics'
import { setMuted } from '../audio'
import { setHaptics } from '../haptics'
import { btn, closeLayer, fmt, h, layer, toast } from './dom'

export interface Ctx {
  profile: Profile
  play(s: LevelSpec, daily?: boolean): void
  home(): void
  daily(): void
}

const tierLabel = (s: LevelSpec): string => (s.tier === 'super' ? '슈퍼 하드' : s.tier === 'hard' ? '하드' : '')

export function showHome(ctx: Ctx): void {
  const p = ctx.profile
  const root = layer('home', 'layer home')
  const top = h('div', 'topbar')
  top.appendChild(h('div', 'pill dust', '✦ ' + fmt(p.dust)))
  top.appendChild(btn('⚙', 'icon', () => settingsSheet(ctx)))
  root.appendChild(top)

  const title = h('div', 'title')
  title.appendChild(h('div', 'logo', 'RICOCHET'))
  title.appendChild(h('div', 'logo2', 'OUT'))
  title.appendChild(h('div', 'sub', '리코셰 아웃 · 거울 반사 퍼즐'))
  root.appendChild(title)

  const con = constellation(p.level)
  const card = h('div', 'card constellation')
  card.appendChild(h('div', 'card-title', `${con.name}자리`))
  const dots = h('div', 'dots')
  for (let i = 0; i < con.of; i++) dots.appendChild(h('span', i < con.lit ? 'dot lit' : 'dot'))
  card.appendChild(dots)
  card.appendChild(h('div', 'card-sub', `${con.lit} / ${con.of} · 레벨을 깰 때마다 별이 하나씩 켜져요`))
  root.appendChild(card)

  const s = spec(p.level)
  const bottom = h('div', 'bottom')
  const play = btn(`레벨 ${p.level}`, 'play' + (s.tier !== 'normal' ? ' ' + s.tier : ''), () => ctx.play(s))
  if (s.tier !== 'normal') play.appendChild(h('span', 'tier', tierLabel(s)))
  bottom.appendChild(play)
  const row = h('div', 'row')
  const d = dailyState(p)
  if (p.level > 5) row.appendChild(btn(d.available ? `오늘의 퍼즐${d.streak ? ` · ${d.streak}일째` : ''}` : '오늘의 퍼즐 완료 ✓', 'tab' + (d.available ? ' glow' : ''), () => { if (d.available) ctx.daily() }))
  if (p.level > 3) row.appendChild(btn('스킨', 'tab', () => skinsSheet(ctx)))
  if (row.childElementCount) bottom.appendChild(row)
  root.appendChild(bottom)
}

function sheet(id: string, title: string, ctx: Ctx): HTMLDivElement {
  const bg = layer(id, 'layer sheet-bg')
  bg.addEventListener('click', () => { closeLayer(id); ctx.home() })
  const s = h('div', 'sheet')
  s.addEventListener('click', (e) => e.stopPropagation())
  s.appendChild(h('div', 'sheet-title', title))
  bg.appendChild(s)
  return s
}

export function skinsSheet(ctx: Ctx): void {
  const p = ctx.profile
  const s = sheet('sheet', '스킨', ctx)
  s.appendChild(h('div', 'sheet-sub', '✦ ' + fmt(p.dust) + ' · 레벨을 깨면 별가루가 쌓여요'))
  const grid = h('div', 'skins')
  for (const k of SKINS) {
    const owned = p.skins.includes(k.id)
    const cell = h('button', 'skin' + (p.skin === k.id ? ' on' : ''), '', () => {
      if (owned) { p.skin = k.id; save(p); skinsSheet(ctx); return }
      if (p.dust < k.price) { toast('별가루가 부족해요'); return }
      p.dust -= k.price; p.skins.push(k.id); p.skin = k.id; save(p)
      track('skin', { id: k.id }); skinsSheet(ctx)
    })
    const sw = h('div', 'swatch')
    sw.style.background = `linear-gradient(135deg, ${k.bg[0]}, ${k.bg[1]})`
    for (const c of k.hues.slice(0, 4)) { const b = h('i'); b.style.background = c; b.style.boxShadow = `0 0 8px ${c}`; sw.appendChild(b) }
    cell.appendChild(sw)
    cell.appendChild(h('div', 'skin-name', k.name))
    cell.appendChild(h('div', 'skin-price', owned ? (p.skin === k.id ? '사용 중' : '보유') : `✦ ${fmt(k.price)}`))
    grid.appendChild(cell)
  }
  s.appendChild(grid)
}

export function settingsSheet(ctx: Ctx): void {
  const p = ctx.profile
  const s = sheet('sheet', '설정', ctx)
  const toggle = (label: string, on: boolean, flip: () => void): void => {
    const row = h('div', 'setting')
    row.appendChild(h('div', '', label))
    row.appendChild(btn(on ? '켜짐' : '꺼짐', on ? 'switch on' : 'switch', () => { flip(); save(p); settingsSheet(ctx) }))
    s.appendChild(row)
  }
  toggle('효과음', p.settings.sound, () => { p.settings.sound = !p.settings.sound; setMuted(!p.settings.sound) })
  toggle('진동', p.settings.haptics, () => { p.settings.haptics = !p.settings.haptics; setHaptics(p.settings.haptics) })
  toggle('색약 모드 (조각에 모양 표시)', p.settings.colorblind, () => { p.settings.colorblind = !p.settings.colorblind })
  const links = h('div', 'links')
  const a1 = h('a', 'link', '개인정보처리방침'); a1.setAttribute('href', 'https://ricochet-out.vercel.app/privacy.html'); a1.setAttribute('target', '_blank')
  const a2 = h('a', 'link', '고객 지원'); a2.setAttribute('href', 'https://ricochet-out.vercel.app/support.html'); a2.setAttribute('target', '_blank')
  links.append(a1, a2)
  s.appendChild(links)
  s.appendChild(h('div', 'stats', `클리어 ${p.stats.clears} · 탭 ${p.stats.taps} · 버전 1.0.0`))
}

export interface HudCtx {
  spec: LevelSpec
  daily: boolean
  profile: Profile
  hearts(): number
  maxHearts(): number
  exit(): void
  hint(): void
  hammer(): void
}

/** Top bar (level, hearts) and booster bar. Rebuilt whenever a count changes. */
export function showHud(c: HudCtx): void {
  const root = layer('hud', 'layer hud')
  const top = h('div', 'hud-top')
  top.appendChild(btn('‹', 'icon', () => c.exit()))
  const mid = h('div', 'hud-level')
  mid.appendChild(h('div', 'hud-title', c.daily ? '오늘의 퍼즐' : `레벨 ${c.spec.level}`))
  if (c.spec.tier !== 'normal') mid.appendChild(h('div', 'hud-tier ' + c.spec.tier, tierLabel(c.spec)))
  top.appendChild(mid)
  const hearts = h('div', 'hearts')
  for (let i = 0; i < c.maxHearts(); i++) hearts.appendChild(h('span', i < c.hearts() ? 'heart' : 'heart off', '♥'))
  top.appendChild(hearts)
  root.appendChild(top)
  if (c.spec.level < 4 && !c.daily) return
  const bar = h('div', 'boosters')
  const booster = (label: string, icon: string, n: number, price: number, use: () => void): void => {
    const b = btn('', 'booster', () => {
      if (n > 0) { use(); return }
      // Out of this booster: buy with stardust, or watch an ad for one.
      if (c.profile.dust >= price) { c.profile.dust -= price; addBooster(c.profile, label); save(c.profile); use(); return }
      if (NO_ADS) { toast('별가루가 부족해요'); return }
      void showRewarded('booster_' + label).then((ok) => { if (ok) { addBooster(c.profile, label); save(c.profile); use() } })
    })
    b.appendChild(h('div', 'booster-icon', icon))
    b.appendChild(h('div', 'booster-name', label === 'hint' ? '힌트' : '망치'))
    b.appendChild(h('div', 'booster-count', n > 0 ? String(n) : c.profile.dust >= price || NO_ADS ? `✦${price}` : '▶ 광고'))
    bar.appendChild(b)
  }
  booster('hint', '💡', c.profile.boosters.hint, BOOSTER_PRICE.hint, c.hint)
  booster('hammer', '🔨', c.profile.boosters.hammer, BOOSTER_PRICE.hammer, c.hammer)
  root.appendChild(bar)
}

function addBooster(p: Profile, name: string): void {
  if (name === 'hint') p.boosters.hint++
  else p.boosters.hammer++
}
