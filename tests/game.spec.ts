import { expect, test, type Page } from '@playwright/test'

type RO = {
  profile: { level: number; dust: number; stars: Record<number, number>; boosters: { hint: number; hammer: number }; stats: { plays: number } }
  session: { state: string; hearts: number; board: { pieces: Array<{ id: number }> }; cleared: number; total: number } | null
  start(l: number): void
  daily(): void
  reset(): void
  home(): void
  free(): number[]
  tapPiece(id: number): string
  SIM: { rewardedSec: number; interstitialSec: number }
}
declare global { interface Window { __ro: RO } }

async function fresh(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear() })
  await page.reload()
  await page.evaluate(() => { window.__ro.SIM.rewardedSec = 0; window.__ro.SIM.interstitialSec = 0 })
  await page.waitForTimeout(200)
}

/** Taps free pieces until the board is empty. */
async function solve(page: Page): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(() => { const f = window.__ro.free(); if (f.length) window.__ro.tapPiece(f[0]); return window.__ro.session?.state })
    if (st !== 'play') break
    await page.waitForTimeout(60)
  }
  await expect.poll(() => page.evaluate(() => window.__ro.session?.state)).toBe('won')
}

test('first launch drops straight into level 1 with the tip', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await fresh(page)
  await expect(page.getByText('화살표를 탭하면 그 방향으로 날아가요')).toBeVisible()
  await expect(page.getByText('레벨 1', { exact: true })).toBeVisible()
  await expect(page.locator('.boosters')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('tapping a free piece on the canvas sends it off', async ({ page }) => {
  await fresh(page)
  const box = await page.evaluate(() => {
    const ro = window.__ro as unknown as { free(): number[]; session: { board: { pieces: Array<{ id: number; cells: number[][] }> } }; layout: { cell: number; ox: number; oy: number } }
    const id = ro.free()[0]
    const p = ro.session.board.pieces.find((q) => q.id === id)!
    const [x, y] = p.cells[0]
    return { x: ro.layout.ox + (x + 0.5) * ro.layout.cell, y: ro.layout.oy + (y + 0.5) * ro.layout.cell }
  })
  await page.mouse.click(box.x, box.y)
  await expect.poll(() => page.evaluate(() => window.__ro.session!.cleared)).toBe(1)
})

test('clearing a level pays stardust and opens the next', async ({ page }) => {
  await fresh(page)
  await solve(page)
  await expect(page.getByText('레벨 1 클리어!')).toBeVisible()
  await page.getByRole('button', { name: '다음 레벨 ▶' }).click()
  await expect.poll(() => page.evaluate(() => window.__ro.profile.level)).toBe(2)
  expect(await page.evaluate(() => window.__ro.profile.dust)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.__ro.session!.board.pieces.length)).toBeGreaterThan(0)
})

test('three bumps lose the level; an ad buys one more heart', async ({ page }) => {
  await fresh(page)
  await page.evaluate(() => window.__ro.start(30))
  for (let n = 0; n < 3; n++) {
    await page.waitForTimeout(900)
    expect(await page.evaluate(() => {
      const ro = window.__ro
      const free = new Set(ro.free())
      const stuck = ro.session!.board.pieces.find((p) => !free.has(p.id))!
      return ro.tapPiece(stuck.id)
    })).toBe('bump')
  }
  await expect(page.getByText('하트를 다 썼어요')).toBeVisible()
  await page.getByRole('button', { name: /하나 더/ }).click()
  await page.locator('.ad-close').click()
  await expect.poll(() => page.evaluate(() => window.__ro.session!.state)).toBe('play')
  expect(await page.evaluate(() => window.__ro.session!.hearts)).toBe(1)
})

test('the hammer lifts any piece off the board', async ({ page }) => {
  await fresh(page)
  await page.evaluate(() => window.__ro.start(10))
  await page.getByRole('button', { name: /망치/ }).click()
  await expect(page.getByText(/지울 화살표를 탭하세요/)).toBeVisible()
  const before = await page.evaluate(() => window.__ro.session!.board.pieces.length)
  const pt = await page.evaluate(() => {
    const ro = window.__ro as unknown as { free(): number[]; session: { board: { pieces: Array<{ id: number; cells: number[][] }> } }; layout: { cell: number; ox: number; oy: number } }
    const free = new Set(ro.free())
    const p = ro.session.board.pieces.find((q) => !free.has(q.id))!
    const [x, y] = p.cells[0]
    return { x: ro.layout.ox + (x + 0.5) * ro.layout.cell, y: ro.layout.oy + (y + 0.5) * ro.layout.cell }
  })
  await page.mouse.click(pt.x, pt.y)
  expect(await page.evaluate(() => window.__ro.session!.board.pieces.length)).toBe(before - 1)
  expect(await page.evaluate(() => window.__ro.profile.boosters.hammer)).toBe(0)
  expect(await page.evaluate(() => window.__ro.session!.hearts)).toBe(3)
})

test('home, daily puzzle, and streak', async ({ page }) => {
  await fresh(page)
  await page.evaluate(() => { window.__ro.profile.level = 9; window.__ro.home() })
  await expect(page.getByRole('button', { name: '레벨 9' })).toBeVisible()
  await page.getByRole('button', { name: /오늘의 퍼즐/ }).click()
  await solve(page)
  await expect(page.getByText(/오늘의 퍼즐 완료!/)).toBeVisible()
  await page.getByRole('button', { name: '홈으로' }).click()
  await expect(page.getByRole('button', { name: '오늘의 퍼즐 완료 ✓' })).toBeVisible()
  expect(await page.evaluate(() => window.__ro.profile.level)).toBe(9)
})

test('skins can be bought with stardust', async ({ page }) => {
  await fresh(page)
  await page.evaluate(() => { window.__ro.profile.level = 6; window.__ro.profile.dust = 400; window.__ro.home() })
  await page.getByRole('button', { name: '스킨' }).click()
  await page.getByRole('button', { name: /심해/ }).click()
  await expect.poll(() => page.evaluate(() => window.__ro.profile.dust)).toBe(100)
})

test('sampled levels up to 200 play out to a clear', async ({ page }) => {
  await fresh(page)
  for (const lv of [1, 5, 10, 25, 26, 50, 75, 100, 150, 200]) {
    await page.evaluate((l) => window.__ro.start(l), lv)
    await solve(page)
  }
})

test('leaving right after the last arrow does not pop the win dialog over home', async ({ page }) => {
  await fresh(page)
  await page.evaluate(() => { window.__ro.profile.level = 6; window.__ro.start(5) })
  await solve(page)
  await page.evaluate(() => window.__ro.home())
  await page.waitForTimeout(900)
  await expect(page.locator('#win')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '레벨 6' })).toBeVisible()
})

test('buying a hammer charges once, and a second tap cancels hammer mode', async ({ page }) => {
  await fresh(page)
  await page.evaluate(() => { const p = window.__ro.profile; p.boosters.hammer = 0; p.dust = 500; window.__ro.start(12) })
  await page.getByRole('button', { name: /망치/ }).click()
  await page.getByRole('button', { name: /망치/ }).click()
  expect(await page.evaluate(() => window.__ro.profile.dust)).toBe(380)
  await expect(page.getByText(/지울 화살표를 탭하세요/)).toHaveCount(0)
  expect(await page.evaluate(() => window.__ro.profile.boosters.hammer)).toBe(1)
})
