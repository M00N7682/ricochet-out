/**
 * Registers the Ricochet Out bundle ID and (re)creates its two profiles, signed
 * by the team's distribution certificate: ad hoc (every registered iPhone) and
 * App Store. Idempotent; profiles are recreated so new phones are included.
 *
 *   node scripts/ios-provision.mjs <outDir>
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const BUNDLE_ID = 'kr.co.ddstudio.ricochet'
const NAME = 'Ricochet Out'
const PROFILES = [['Ricochet Out Ad Hoc', 'IOS_APP_ADHOC', 'adhoc'], ['Ricochet Out App Store', 'IOS_APP_STORE', 'appstore']]
const CERT_ID = readFileSync(resolve(homedir(), '.appstoreconnect/signing/cert.id'), 'utf8').trim()
const OUT = process.argv[2] || '.work/profiles'
mkdirSync(OUT, { recursive: true })

const token = execFileSync('python3', [resolve(homedir(), '.appstoreconnect/asc_token.py')]).toString().trim().split('\n').pop().trim()
const API = 'https://api.appstoreconnect.apple.com/v1'
const pause = () => new Promise((r) => setTimeout(r, 400))
async function call(path, init = {}) {
  await pause()
  const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${path} → ${res.status} ${body?.errors?.[0]?.detail ?? ''}`)
  return body
}

let bundle = (await call(`/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}&limit=5`)).data.find((b) => b.attributes.identifier === BUNDLE_ID)
if (!bundle) {
  bundle = (await call('/bundleIds', { method: 'POST', body: JSON.stringify({ data: { type: 'bundleIds', attributes: { identifier: BUNDLE_ID, name: NAME, platform: 'IOS' } } }) })).data
  console.log(`✓ registered bundle ${BUNDLE_ID}`)
} else console.log(`• bundle ${BUNDLE_ID} exists`)

const devices = (await call('/devices?filter[status]=ENABLED&limit=200')).data.filter((d) => ['IPHONE', 'IPAD', 'IOS'].includes(d.attributes.deviceClass) || d.attributes.platform === 'IOS')
console.log(`• ${devices.length} registered iOS devices`)
const all = (await call('/profiles?limit=200')).data

for (const [name, type, file] of PROFILES) {
  for (const p of all.filter((q) => q.attributes.name === name)) await call(`/profiles/${p.id}`, { method: 'DELETE' })
  const rel = { bundleId: { data: { type: 'bundleIds', id: bundle.id } }, certificates: { data: [{ type: 'certificates', id: CERT_ID }] } }
  if (type === 'IOS_APP_ADHOC') rel.devices = { data: devices.map((d) => ({ type: 'devices', id: d.id })) }
  const made = (await call('/profiles', { method: 'POST', body: JSON.stringify({ data: { type: 'profiles', attributes: { name, profileType: type }, relationships: rel } }) })).data
  writeFileSync(`${OUT}/${file}.mobileprovision`, Buffer.from(made.attributes.profileContent, 'base64'))
  console.log(`✓ ${name} ${made.attributes.uuid} → ${OUT}/${file}.mobileprovision`)
}
