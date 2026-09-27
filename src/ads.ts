/**
 * Ads behind one interface. The web build plays a short simulated placement so
 * every flow can be tried and tested; a native wrapper swaps in AdMob. Rewarded
 * ads are always the player's choice; interstitials follow strict pacing.
 */

import { track } from './analytics'

export interface AdProvider {
  rewarded(placement: string): Promise<boolean>
  interstitial(placement: string): Promise<void>
}

/**
 * Pacing from the research (docs/RESEARCH.md): no interstitial before level 6
 * or in a player's first three minutes, then at most one per two levels and 90s.
 */
export const PACE = { fromLevel: 6, gapSec: 90, everyLevels: 2, graceSec: 180 }

/**
 * A store build without real ad units shows no ads at all: rewarded buttons
 * pay out at once and interstitials never run. Test ads in a reviewed binary
 * are a rejection (Guideline 2.1).
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
export const NO_ADS = env.VITE_STORE_RELEASE === '1' && !env.VITE_ADMOB_REWARDED_IOS

let provider: AdProvider = simulated()
let levelsSince = 0
let lastInterstitial = -Infinity
let lastRewarded = -Infinity
let removed = false

export function setAdProvider(p: AdProvider): void { provider = p }
export function setAdsRemoved(v: boolean): void { removed = v }

export async function showRewarded(placement: string): Promise<boolean> {
  if (NO_ADS) { track('ad_rv_free', { placement }); return true }
  track('ad_rv_start', { placement })
  const ok = await provider.rewarded(placement)
  lastRewarded = performance.now() / 1000
  track(ok ? 'ad_rv_done' : 'ad_rv_skip', { placement })
  return ok
}

/** Between levels only, paced by PACE; never right after a rewarded ad. */
export async function maybeInterstitial(stage: number, now = performance.now() / 1000): Promise<boolean> {
  levelsSince++
  if (NO_ADS || levelsSince < PACE.everyLevels || now < PACE.graceSec) return false
  if (removed || stage < PACE.fromLevel || now - lastInterstitial < PACE.gapSec) return false
  // Someone who just chose to watch an ad has paid for this break already.
  if (now - lastRewarded < PACE.gapSec) return false
  lastInterstitial = now
  levelsSince = 0
  track('ad_int', { stage })
  await provider.interstitial('stage_end')
  return true
}

/** Seconds a simulated placement runs; tests shorten it. */
export const SIM = { rewardedSec: 3, interstitialSec: 2 }

function simulated(): AdProvider {
  const show = (label: string, secs: number, reward: boolean): Promise<boolean> => new Promise((resolve) => {
    const el = document.createElement('div')
    el.className = 'ad-sim'
    el.innerHTML = `<div class="ad-card"><div class="ad-tag">AD</div><div class="ad-title">${label}</div><div class="ad-count"></div><button class="btn ghost ad-close" disabled>닫기</button></div>`
    document.body.appendChild(el)
    const count = el.querySelector('.ad-count') as HTMLElement
    const close = el.querySelector('.ad-close') as HTMLButtonElement
    let left = secs
    count.textContent = `${left}초`
    const finish = (): void => { count.textContent = reward ? '보상 지급!' : ''; close.disabled = false }
    if (left <= 0) finish()
    const timer = setInterval(() => {
      left--
      if (left > 0) count.textContent = `${left}초`
      else { clearInterval(timer); finish() }
    }, 1000)
    close.onclick = () => { clearInterval(timer); el.parentNode?.removeChild(el); resolve(true) }
  })
  return {
    rewarded: (p) => show(`광고 시청 중 · ${p}`, SIM.rewardedSec, true),
    interstitial: async () => { await show('잠시 광고가 나와요', SIM.interstitialSec, false) },
  }
}
