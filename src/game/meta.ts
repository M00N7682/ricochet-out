/**
 * The profile between levels: progress, stars, stardust, boosters, skins,
 * the daily streak and settings. Saved on the device only.
 */

export interface Profile {
  v: 1
  /** Next level to play. */
  level: number
  /** Best stars per cleared level, 1-3. */
  stars: Record<number, number>
  dust: number
  boosters: { hint: number; hammer: number }
  skin: string
  skins: string[]
  daily: { day: string; streak: number; done: boolean }
  settings: { sound: boolean; haptics: boolean; colorblind: boolean }
  stats: { plays: number; clears: number; taps: number; bumps: number }
  firstSeen: number
}

const KEY = 'ricochet.save.v1'

export function fresh(now = Date.now()): Profile {
  return {
    v: 1, level: 1, stars: {}, dust: 0,
    boosters: { hint: 3, hammer: 1 },
    skin: 'neon', skins: ['neon'],
    daily: { day: '', streak: 0, done: false },
    settings: { sound: true, haptics: true, colorblind: false },
    stats: { plays: 0, clears: 0, taps: 0, bumps: 0 },
    firstSeen: now,
  }
}

export function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fresh()
    const p = JSON.parse(raw) as Profile
    const f = fresh()
    return { ...f, ...p, boosters: { ...f.boosters, ...p.boosters }, settings: { ...f.settings, ...p.settings }, stats: { ...f.stats, ...p.stats }, daily: { ...f.daily, ...p.daily } }
  } catch {
    return fresh()
  }
}

export function save(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
}

/** Stardust for a clear: more for stars and for the harder levels. */
export const dustFor = (stars: number, tier: 'normal' | 'hard' | 'super'): number =>
  (10 + stars * 5) * (tier === 'super' ? 3 : tier === 'hard' ? 2 : 1)

export interface Skin { id: string; name: string; price: number; hues: string[]; bg: [string, string] }

export const SKINS: Skin[] = [
  { id: 'neon', name: '네온', price: 0, hues: ['#4cc9f0', '#f72585', '#b8f35d', '#ffd166', '#9d7bff', '#ff8c42'], bg: ['#0b1026', '#1a1045'] },
  { id: 'ocean', name: '심해', price: 300, hues: ['#48cae4', '#4361ee', '#00b4d8', '#f15bb5', '#2ec4b6', '#fee440'], bg: ['#03071e', '#023e8a'] },
  { id: 'sunset', name: '노을', price: 600, hues: ['#ffba08', '#faa307', '#f48c06', '#e85d04', '#ff6d00', '#ffd6a5'], bg: ['#240046', '#5a189a'] },
  { id: 'candy', name: '캔디', price: 900, hues: ['#ff85a1', '#ff5d8f', '#a0c4ff', '#bdb2ff', '#9ef01a', '#ffd166'], bg: ['#2b193d', '#3a2051'] },
  { id: 'aurora', name: '오로라', price: 1400, hues: ['#80ffdb', '#72efdd', '#64dfdf', '#5390d9', '#7400b8', '#b8f35d'], bg: ['#001219', '#10002b'] },
  { id: 'gold', name: '황금', price: 2200, hues: ['#ffd700', '#ff9f1c', '#e76f51', '#e9c46a', '#f4a261', '#c08552'], bg: ['#1b1b1b', '#3a2e05'] },
]
export const skinOf = (p: Profile): Skin => SKINS.find((s) => s.id === p.skin) ?? SKINS[0]

/** Constellations: one per 30 levels, a star lit per level cleared in it. */
export const CONSTELLATIONS = ['오리온', '카시오페이아', '북두칠성', '백조', '거문고', '전갈', '사자', '페가수스', '큰곰', '용']
export function constellation(level: number): { index: number; name: string; lit: number; of: number } {
  const i = Math.floor((level - 1) / 30)
  return { index: i, name: CONSTELLATIONS[i % CONSTELLATIONS.length], lit: (level - 1) % 30, of: 30 }
}

const day = (now: number): string => { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

export function dailyState(p: Profile, now = Date.now()): { available: boolean; streak: number } {
  const today = day(now)
  if (p.daily.day === today) return { available: !p.daily.done, streak: p.daily.streak }
  const yesterday = day(now - 86_400_000)
  return { available: true, streak: p.daily.day === yesterday && p.daily.done ? p.daily.streak : 0 }
}

/** Marks today's puzzle done and returns the reward. */
export function finishDaily(p: Profile, now = Date.now()): number {
  const st = dailyState(p, now)
  if (!st.available) return 0
  const streak = st.streak + 1
  p.daily = { day: day(now), streak, done: true }
  const reward = 50 + Math.min(7, streak) * 20
  p.dust += reward
  return reward
}

export const BOOSTER_PRICE = { hint: 60, hammer: 120 }
