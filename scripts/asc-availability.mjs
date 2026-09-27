/**
 * Sets price (free) and territory availability (worldwide).
 *
 * A freshly created app record has neither, and TestFlight can then report
 * "요청된 앱은 사용할 수 없거나 존재하지 않습니다" to a tester whose storefront the
 * app is not available in. Both values are required before release anyway.
 *
 *   node scripts/asc-availability.mjs            # dry run
 *   node scripts/asc-availability.mjs --apply
 */

import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const APPLY = process.argv.includes('--apply')
const BUNDLE_ID = 'kr.co.ddstudio.ricochet'
const BASE_TERRITORY = 'KOR'

const token = execFileSync('python3', [resolve(homedir(), '.appstoreconnect/asc_token.py')])
  .toString().trim().split('\n').pop().trim()
const API = 'https://api.appstoreconnect.apple.com'

async function req(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
  return { ok: res.ok, status: res.status, body }
}

async function must(path, init) {
  const r = await req(path, init)
  if (!r.ok) {
    const e = r.body?.errors?.[0]
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${r.status} ${e?.title ?? ''} ${e?.detail ?? ''}`)
  }
  return r.body
}

const app = (await must(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`)).data[0]
if (!app) throw new Error(`no app record for ${BUNDLE_ID}`)
console.log(`• app ${app.attributes.name} (${app.id})`)

// --- Territories -----------------------------------------------------------
const territories = []
let next = '/v1/territories?limit=200'
while (next) {
  const page = await must(next.replace(API, ''))
  territories.push(...page.data.map((t) => t.id))
  next = page.links?.next ?? null
}
console.log(`• ${territories.length} territories available`)

// --- Availability ----------------------------------------------------------
const current = await req(`/v2/appAvailabilities/${app.id}`)
if (current.ok) {
  console.log('• availability already configured')
} else if (!APPLY) {
  console.log(`  + would make the app available in all ${territories.length} territories`)
} else {
  await must('/v2/appAvailabilities', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: { data: { type: 'apps', id: app.id } },
          territoryAvailabilities: {
            // Inline-created entities must use local ids, not the real ones.
            data: territories.map((_, i) => ({ type: 'territoryAvailabilities', id: `\${t${i}}` })),
          },
        },
      },
      included: territories.map((id, i) => ({
        type: 'territoryAvailabilities',
        id: `\${t${i}}`,
        attributes: { available: true },
        relationships: { territory: { data: { type: 'territories', id } } },
      })),
    }),
  })
  console.log(`  ✓ available in all ${territories.length} territories`)
}

// --- Price (free) ----------------------------------------------------------
const prices = await req(`/v1/appPriceSchedules/${app.id}/manualPrices?limit=5`)
if (prices.ok && prices.body.data?.length) {
  console.log('• price already scheduled')
} else if (!APPLY) {
  console.log('  + would schedule the app as free')
} else {
  // The free tier is the price point whose customerPrice is "0.00".
  const points = await must(
    `/v1/apps/${app.id}/appPricePoints?filter[territory]=${BASE_TERRITORY}&limit=200`,
  )
  const free = points.data.find((p) => Number(p.attributes.customerPrice) === 0)
  if (!free) throw new Error('no zero-price point offered for this app')

  await must('/v1/appPriceSchedules', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: app.id } },
          baseTerritory: { data: { type: 'territories', id: BASE_TERRITORY } },
          manualPrices: { data: [{ type: 'appPrices', id: '${price}' }] },
        },
      },
      included: [{
        type: 'appPrices',
        id: '${price}',
        attributes: { startDate: null, endDate: null },
        relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } },
      }],
    }),
  })
  console.log(`  ✓ scheduled as free (base territory ${BASE_TERRITORY})`)
}

if (!APPLY) console.log('\ndry run — re-run with --apply')
