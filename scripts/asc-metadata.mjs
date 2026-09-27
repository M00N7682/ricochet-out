/**
 * Fills the App Store listing from store/listing/*.md.
 *
 * Apple blocks creating the app record over the API, but everything after that
 * — name, subtitle, description, keywords, URLs and screenshots — is writable,
 * so none of it has to be pasted by hand.
 *
 *   node scripts/asc-metadata.mjs              # dry run
 *   node scripts/asc-metadata.mjs --apply      # write text
 *   node scripts/asc-metadata.mjs --apply --screenshots
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')
const WITH_SHOTS = process.argv.includes('--screenshots')
/** Replace screenshots that are already on the listing. */
const REPLACE = process.argv.includes('--replace')
const BUNDLE_ID = 'kr.co.ddstudio.ricochet'
const VERSION = '1.0.0'
const SUPPORT_URL = 'https://ricochet-out.vercel.app/support.html'
const PRIVACY_URL = 'https://ricochet-out.vercel.app/privacy.html'

const token = execFileSync('python3', [resolve(homedir(), '.appstoreconnect/asc_token.py')])
  .toString().trim().split('\n').pop().trim()
const API = 'https://api.appstoreconnect.apple.com/v1'

async function call(path, init = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    const e = body?.errors?.[0]
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${e?.title ?? ''} ${e?.detail ?? ''}`)
  }
  return body
}

/**
 * Pulls one `## heading` section out of a listing markdown file.
 *
 * Done by splitting rather than a lookahead regex: with the `m` flag `$` means
 * end-of-line, so `(?=\n## |$)` truncated every section to its first line.
 */
function section(md, headings) {
  for (const part of md.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n')
    const head = (nl < 0 ? part : part.slice(0, nl)).trim()
    if (headings.some((h) => head.startsWith(h))) {
      return nl < 0 ? '' : part.slice(nl + 1).trim()
    }
  }
  return ''
}

/**
 * App Store wants plain text: no markdown, and — per a 409 from the API — no
 * emoji in the description at all. The markdown source keeps them for humans.
 */
function plain(md) {
  return md
    .replace(/^---$/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const LOCALES = [
  { asc: 'ko', file: 'ko.md' },
  { asc: 'en-US', file: 'en.md' },
]

const copy = {}
for (const { asc, file } of LOCALES) {
  const md = readFileSync(resolve(ROOT, 'store/listing', file), 'utf8')
  copy[asc] = {
    name: section(md, ['앱 이름', 'App name']).split('\n')[0] || '리코셰 아웃',
    subtitle: plain(section(md, ['부제', 'Subtitle'])).split('\n')[0],
    description: plain(section(md, ['전체 설명', 'Full description'])),
    keywords: section(md, ['태그 / 키워드', 'Keywords']).split('\n').pop().trim(),
    promotionalText: plain(section(md, ['프로모션 텍스트', 'Promotional text'])),
  }
}

/** Apple rejects over-long fields with a 409; catch it before the round trip. */
const LIMITS = { subtitle: 30, keywords: 100, promotionalText: 170, description: 4000 }
let overLimit = false
for (const [asc, c] of Object.entries(copy)) {
  for (const [field, max] of Object.entries(LIMITS)) {
    const len = (c[field] ?? '').length
    if (len > max) {
      console.error(`✗ ${asc}.${field}: ${len}자 / 최대 ${max}자`)
      overLimit = true
    }
  }
}
if (overLimit) {
  console.error('\nstore/listing/*.md 를 줄인 뒤 다시 실행하세요.')
  process.exit(1)
}

const apps = await call(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`)
const app = apps.data?.[0]
if (!app) {
  console.error(`✗ no app record for ${BUNDLE_ID}.`)
  console.error('  Create it once at https://appstoreconnect.apple.com/apps (Apple blocks API creation),')
  console.error('  then re-run this script.')
  process.exit(1)
}
console.log(`• app: ${app.attributes.name} (${app.id})`)

// --- App-level info (name, subtitle, privacy URL) --------------------------
const infos = await call(`/apps/${app.id}/appInfos?limit=10`)
const info = infos.data.find((i) => ['PREPARE_FOR_SUBMISSION', 'READY_FOR_DISTRIBUTION',
  'DEVELOPER_REJECTED', 'REJECTED'].includes(i.attributes.appStoreState)) ?? infos.data[0]

const infoLocs = await call(`/appInfos/${info.id}/appInfoLocalizations?limit=50`)
for (const { asc } of LOCALES) {
  const c = copy[asc]
  const existing = infoLocs.data.find((l) => l.attributes.locale === asc)
  const attributes = { name: c.name, subtitle: c.subtitle, privacyPolicyUrl: PRIVACY_URL }
  if (!APPLY) {
    console.log(`  ${existing ? '~' : '+'} appInfo[${asc}] name="${c.name}" subtitle="${c.subtitle}"`)
    continue
  }
  if (existing) {
    await call(`/appInfoLocalizations/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'appInfoLocalizations', id: existing.id, attributes } }),
    })
  } else {
    await call('/appInfoLocalizations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appInfoLocalizations',
          attributes: { locale: asc, ...attributes },
          relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } },
        },
      }),
    })
  }
  console.log(`  ✓ appInfo[${asc}]`)
}

// --- Version-level info (description, keywords, screenshots) ---------------
const versions = await call(`/apps/${app.id}/appStoreVersions?limit=10`)
let version = versions.data.find((v) => v.attributes.versionString === VERSION)
  ?? versions.data.find((v) => v.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION')

if (!version) {
  if (!APPLY) {
    console.log(`  + would create appStoreVersion ${VERSION}`)
  } else {
    const r = await call('/appStoreVersions', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appStoreVersions',
          attributes: { platform: 'IOS', versionString: VERSION },
          relationships: { app: { data: { type: 'apps', id: app.id } } },
        },
      }),
    })
    version = r.data
    console.log(`  ✓ created version ${VERSION}`)
  }
}
if (!version) { console.log('\ndry run — re-run with --apply'); process.exit(0) }

const verLocs = await call(`/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)
const locIds = {}
for (const { asc } of LOCALES) {
  const c = copy[asc]
  const existing = verLocs.data.find((l) => l.attributes.locale === asc)
  const attributes = {
    description: c.description,
    keywords: c.keywords,
    promotionalText: c.promotionalText,
    supportUrl: SUPPORT_URL,
  }
  if (!APPLY) {
    console.log(`  ${existing ? '~' : '+'} version[${asc}] description=${c.description.length}자 keywords="${c.keywords.slice(0, 40)}…"`)
    continue
  }
  if (existing) {
    await call(`/appStoreVersionLocalizations/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'appStoreVersionLocalizations', id: existing.id, attributes } }),
    })
    locIds[asc] = existing.id
  } else {
    const r = await call('/appStoreVersionLocalizations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: { locale: asc, ...attributes },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
        },
      }),
    })
    locIds[asc] = r.data.id
  }
  console.log(`  ✓ version[${asc}]`)
}

if (!APPLY) { console.log('\ndry run — re-run with --apply'); process.exit(0) }
if (!WITH_SHOTS) {
  console.log('\ntext written. add --screenshots (and --replace) to upload store/screenshots/ios67-*.png')
  process.exit(0)
}

// --- Screenshots -----------------------------------------------------------
const shotDir = resolve(ROOT, 'store/screenshots')
const shots = readdirSync(shotDir).filter((f) => f.startsWith('ios67-')).sort()
console.log(`\n• uploading ${shots.length} screenshots to each locale`)

for (const asc of Object.keys(locIds)) {
  const sets = await call(`/appStoreVersionLocalizations/${locIds[asc]}/appScreenshotSets?limit=20`)
  let set = sets.data.find((s) => s.attributes.screenshotDisplayType === 'APP_IPHONE_67')
  if (!set) {
    const r = await call('/appScreenshotSets', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: 'APP_IPHONE_67' },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: 'appStoreVersionLocalizations', id: locIds[asc] },
            },
          },
        },
      }),
    })
    set = r.data
  }

  const already = await call(`/appScreenshotSets/${set.id}/appScreenshots?limit=20`)
  if (already.data.length > 0) {
    // The listing must show the build being submitted, so a re-run replaces
    // what is there rather than leaving last month's art in place.
    if (!REPLACE) {
      console.log(`  • ${asc}: ${already.data.length} already present — pass --replace to update`)
      continue
    }
    for (const old of already.data) {
      await call(`/appScreenshots/${old.id}`, { method: 'DELETE' })
    }
    console.log(`  • ${asc}: removed ${already.data.length} stale screenshots`)
  }

  for (const name of shots) {
    const bytes = readFileSync(resolve(shotDir, name))
    const reserve = await call('/appScreenshots', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appScreenshots',
          attributes: { fileSize: bytes.length, fileName: name },
          relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
        },
      }),
    })
    const shot = reserve.data
    for (const op of shot.attributes.uploadOperations) {
      const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]))
      const res = await fetch(op.url, {
        method: op.method,
        headers,
        body: bytes.subarray(op.offset, op.offset + op.length),
      })
      if (!res.ok) throw new Error(`upload ${name} → ${res.status}`)
    }
    await call(`/appScreenshots/${shot.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'appScreenshots',
          id: shot.id,
          attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') },
        },
      }),
    })
    console.log(`  ✓ ${asc} ← ${name}`)
  }
}

console.log('\n✓ listing populated. Review it in App Store Connect before submitting.')
