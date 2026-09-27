/**
 * Raw App Store screenshots (1290x2796) from staged scenes through window.__ro.
 * store-captions.py then puts each on a captioned poster.
 *
 * Run against the store build (VITE_STORE_RELEASE=1): no ad buttons.
 *
 *   node scripts/store-shots.mjs http://localhost:4201/ store/raw
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const URL = process.argv[2] || 'http://localhost:4200/'
const OUT = process.argv[3] || 'store/raw'
mkdirSync(OUT, { recursive: true })

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => { localStorage.clear() })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)

/** A returning player: some progress, boosters, stardust. */
async function veteran(level, extra = {}) {
  await page.evaluate(({ level, extra }) => {
    const ro = window.__ro
    const p = ro.profile
    p.level = level; p.dust = 1840; p.stats.plays = 60; p.stats.clears = 58
    p.boosters.hint = 3; p.boosters.hammer = 2
    for (let i = 1; i < level; i++) p.stars[i] = i % 4 === 0 ? 2 : 3
    Object.assign(p, extra)
    ro.save()
  }, { level, extra })
}

/**
 * Starts `level` and fires a free arrow whose way out bends on a mirror,
 * frozen `ms` into its flight. Falls back to any free arrow.
 */
async function midFlight(levels, ms) {
  return page.evaluate(({ levels, ms }) => {
    const ro = window.__ro
    const on = (x, y) => x >= 0 && y >= 0 && x < ro.session.board.w && y < ro.session.board.h && ro.session.board.mirrors.has(y * ro.session.board.w + x)
    let level = levels[0], pick = null
    for (const L of levels) {
      ro.start(L)
      for (const id of ro.free()) {
        ro.start(L); ro.tapPiece(id)
        const m = ro.session.movers[0]
        if (m && m.exits && m.track.some(([x, y]) => on(x, y))) { level = L; pick = id; break }
      }
      if (pick !== null) break
    }
    ro.start(level)
    ro.pause(true)
    if (pick === null) return level
    // ms < 0: show the way out as the hint path instead of flying it.
    if (ms < 0) { ro.session.hint = { id: pick, t: 0.35 }; return level }
    ro.tapPiece(pick)
    // Step the flight until the head is just past the mirror it bends on.
    const m = ro.session.movers[0]
    const at = m.track.findIndex(([x, y], i) => i > m.pos && on(x, y))
    ro.tick(Math.max(1, Math.round((at + ms - m.pos) / (22 / 60))))
    return level
  }, { levels, ms })
}

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })

// 1. The rule in one picture: an arrow bending off a mirror.
await veteran(14)
console.log('bounce level', await midFlight([14, 13, 15, 16, 17, 18, 19, 21, 22, 23], -1))
await page.waitForTimeout(150)
await shot('1-bounce')

// 2. A dense hard board with the hint path showing.
await veteran(40)
await page.evaluate(() => { const ro = window.__ro; ro.pause(false); ro.start(40) })
await page.getByRole('button', { name: /힌트/ }).click()
await page.waitForTimeout(500)
await page.evaluate(() => window.__ro.pause(true))
await shot('2-hint')

// 3. Super hard with walls.
await veteran(75)
console.log('super level', await midFlight([75, 50, 100], 1.2))
await page.waitForTimeout(150)
await shot('3-super')

// 4. Three stars.
await page.evaluate(() => { const ro = window.__ro; ro.pause(false); ro.start(12) })
for (let i = 0; i < 200; i++) {
  const st = await page.evaluate(() => { const f = window.__ro.free(); if (f.length) window.__ro.tapPiece(f[0]); return window.__ro.session?.state })
  if (st !== 'play') break
  await page.waitForTimeout(90)
}
await page.waitForTimeout(1800)
await shot('4-stars')

// 5. Home with a constellation half lit.
await page.evaluate(() => { document.querySelectorAll('#win').forEach((e) => e.parentNode.removeChild(e)) })
await veteran(47)
await page.evaluate(() => { window.__ro.pause(false); window.__ro.home() })
await page.waitForTimeout(400)
await shot('5-home')

// 6. Skins.
await veteran(47, { skins: ['neon', 'ocean', 'sunset'], skin: 'sunset' })
await page.evaluate(() => window.__ro.home())
await page.getByRole('button', { name: '스킨' }).click()
await page.waitForTimeout(500)
await shot('6-skins')

await b.close()
console.log('wrote', OUT)
