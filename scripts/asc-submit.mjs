/**
 * Puts the newest processed build on the 1.0 version and sends it to App Review.
 *
 *   node scripts/asc-submit.mjs                 # dry run: what is missing
 *   node scripts/asc-submit.mjs --apply         # attach build, copyright, review contact
 *   node scripts/asc-submit.mjs --apply --submit
 *
 * Review contact comes from the environment so no personal detail is committed:
 *   ASC_REVIEW_FIRST, ASC_REVIEW_LAST, ASC_REVIEW_PHONE (+82…), ASC_REVIEW_EMAIL
 * ASC_COPYRIGHT sets the copyright line ("2026 Name").
 */

import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const APPLY = process.argv.includes('--apply')
const SUBMIT = process.argv.includes('--submit')
const token = execFileSync('python3', [resolve(homedir(), '.appstoreconnect/asc_token.py')])
  .toString().trim().split('\n').pop().trim()
const API = 'https://api.appstoreconnect.apple.com/v1'

async function call(path, init = {}) {
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const body = r.status === 204 ? null : await r.json().catch(() => null)
  if (!r.ok) {
    const e = new Error(`${init.method || 'GET'} ${path} → ${r.status}`)
    e.details = (body?.errors || []).flatMap((x) => [
      `${x.code}: ${x.detail}`,
      ...Object.values(x.meta?.associatedErrors || {}).flat().map((a) => `  - ${a.code}: ${a.detail}`),
    ])
    throw e
  }
  return body
}

const env = process.env
const found = (await call(`/apps?filter[bundleId]=kr.co.ddstudio.ricochet&limit=1`)).data[0]
if (!found) { console.log('no app record for kr.co.ddstudio.ricochet — create it in App Store Connect first'); process.exit(1) }
const APP = found.id
const version = (await call(`/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=5`)).data
  .find((v) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState))
if (!version) { console.log('no editable version'); process.exit(1) }
console.log(`version ${version.attributes.versionString}  ${version.attributes.appStoreState}`)

const builds = (await call(`/builds?filter[app]=${APP}&sort=-uploadedDate&limit=5`)).data
const build = builds.find((b) => b.attributes.processingState === 'VALID')
console.log(`newest build ${builds[0]?.attributes.version} ${builds[0]?.attributes.processingState}; using ${build?.attributes.version ?? 'none'}`)

const attached = (await call(`/appStoreVersions/${version.id}/build`)).data
console.log(`attached build ${attached?.attributes.version ?? 'none'}   copyright ${version.attributes.copyright ?? '(empty)'}`)

let detail = null
try { detail = (await call(`/appStoreVersions/${version.id}/appStoreReviewDetail`)).data } catch { detail = null }
console.log(`review contact ${detail ? JSON.stringify({ n: detail.attributes.contactFirstName, p: !!detail.attributes.contactPhone, e: detail.attributes.contactEmail }) : '(none)'}`)

if (!APPLY) { console.log('\ndry run — re-run with --apply'); process.exit(0) }

if (build && attached?.id !== build.id) {
  await call(`/appStoreVersions/${version.id}/relationships/build`, { method: 'PATCH', body: JSON.stringify({ data: { type: 'builds', id: build.id } }) })
  console.log(`✓ build ${build.attributes.version} attached`)
}
if (env.ASC_COPYRIGHT && version.attributes.copyright !== env.ASC_COPYRIGHT) {
  await call(`/appStoreVersions/${version.id}`, { method: 'PATCH', body: JSON.stringify({ data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: env.ASC_COPYRIGHT } } }) })
  console.log('✓ copyright set')
}
const contact = {
  contactFirstName: env.ASC_REVIEW_FIRST, contactLastName: env.ASC_REVIEW_LAST,
  contactPhone: env.ASC_REVIEW_PHONE, contactEmail: env.ASC_REVIEW_EMAIL,
  demoAccountRequired: false,
  notes: '로그인·계정이 없는 오프라인 퍼즐 게임입니다. 화살표를 탭하면 가리키는 방향으로 날아가고, 거울(/ \\)에 닿으면 90도로 꺾입니다. 막히면 하트를 잃습니다. 모든 화살표를 내보내면 클리어. 광고와 인앱 결제가 없습니다. No account or login. Tap an arrow to send it flying; mirrors turn it 90 degrees; clear every arrow to win. The app contains no ads and no in-app purchases.',
}
for (const k of Object.keys(contact)) if (contact[k] === undefined || contact[k] === '') delete contact[k]
if (Object.keys(contact).length > 2) {
  if (detail) await call(`/appStoreReviewDetails/${detail.id}`, { method: 'PATCH', body: JSON.stringify({ data: { type: 'appStoreReviewDetails', id: detail.id, attributes: contact } }) })
  else await call('/appStoreReviewDetails', { method: 'POST', body: JSON.stringify({ data: { type: 'appStoreReviewDetails', attributes: contact, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } }) })
  console.log('✓ review contact written')
}

if (!SUBMIT) { console.log('\nready — add --submit to send it to review'); process.exit(0) }

try {
  let sub = (await call(`/reviewSubmissions?filter[app]=${APP}&filter[state]=READY_FOR_REVIEW&limit=1`)).data[0]
  if (!sub) sub = (await call('/reviewSubmissions', { method: 'POST', body: JSON.stringify({ data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP } } } } }) })).data
  const items = (await call(`/reviewSubmissions/${sub.id}/items`)).data
  if (items.length === 0) {
    await call('/reviewSubmissionItems', { method: 'POST', body: JSON.stringify({ data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } }) })
  }
  await call(`/reviewSubmissions/${sub.id}`, { method: 'PATCH', body: JSON.stringify({ data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } }) })
  console.log(`✓ submitted for review (${sub.id})`)
} catch (e) {
  console.log(`✗ ${e.message}`)
  for (const d of e.details || []) console.log('   ' + d)
  process.exit(2)
}
