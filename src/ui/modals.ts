/** End-of-level dialogs: the clear with its stars, and running out of hearts. */

import { showRewarded } from '../ads'
import { play } from '../audio'
import { btn, closeLayer, fmt, h, layer } from './dom'

export function showWin(opts: { title: string; stars: number; dust: number; next: string; onNext(mult: number): void; adOffer: boolean }): void {
  const root = layer('win', 'layer modal-bg')
  const box = h('div', 'modal')
  box.appendChild(h('div', 'modal-title', opts.title))
  const stars = h('div', 'stars')
  for (let i = 0; i < 3; i++) {
    const s = h('span', 'star', '★')
    if (i < opts.stars) setTimeout(() => { s.classList.add('on'); play('star') }, 250 + i * 260)
    stars.appendChild(s)
  }
  box.appendChild(stars)
  box.appendChild(h('div', 'reward', '✦ ' + fmt(opts.dust)))
  if (opts.adOffer) box.appendChild(btn(`광고 보고 ✦ ${fmt(opts.dust * 2)} 받기`, 'ad', () => void showRewarded('win_x2').then((ok) => { closeLayer('win'); opts.onNext(ok ? 2 : 1) })))
  box.appendChild(btn(opts.next, 'play', () => { closeLayer('win'); opts.onNext(1) }))
  root.appendChild(box)
}

export function showLose(opts: { onHeart(): void; onRetry(): void; onHome(): void }): void {
  const root = layer('lose', 'layer modal-bg')
  const box = h('div', 'modal')
  box.appendChild(h('div', 'modal-title lose', '하트를 다 썼어요'))
  box.appendChild(h('div', 'modal-sub', '조금만 더 하면 풀려요'))
  box.appendChild(btn('광고 보고 ♥ 하나 더', 'ad', () => void showRewarded('extra_heart').then((ok) => { if (ok) { closeLayer('lose'); opts.onHeart() } })))
  box.appendChild(btn('다시 하기', 'play', () => { closeLayer('lose'); opts.onRetry() }))
  box.appendChild(btn('홈으로', 'ghost', () => { closeLayer('lose'); opts.onHome() }))
  root.appendChild(box)
}
