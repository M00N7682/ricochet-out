/**
 * First-party event log. Every funnel step the store listing will be judged
 * on (tutorial, stage start/clear/fail, ad offers and views, day-1 return) is
 * recorded from the first build. Events stay on the device unless
 * VITE_ANALYTICS_URL is set, in which case they are beaconed there.
 */

export interface Event { e: string; t: number; p?: Record<string, string | number | boolean> }

const KEY = 'ricochet.events.v1'
const MAX = 300
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
const url = env.VITE_ANALYTICS_URL

let buffer: Event[] = []
try { buffer = JSON.parse(localStorage.getItem(KEY) || '[]') as Event[] } catch { buffer = [] }

export function track(e: string, p?: Event['p']): void {
  const ev: Event = { e, t: Date.now(), p }
  buffer.push(ev)
  if (buffer.length > MAX) buffer = buffer.slice(-MAX)
  try { localStorage.setItem(KEY, JSON.stringify(buffer)) } catch { /* full or private */ }
  if (url && navigator.sendBeacon) navigator.sendBeacon(url, JSON.stringify(ev))
}

export const events = (): Event[] => buffer.slice()
