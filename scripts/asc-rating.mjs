/**
 * Fills the App Information a new app record starts without: age rating,
 * categories and content rights.
 *
 * An app with a null age rating cannot be distributed at all — TestFlight shows
 * the app but the install fails, which is a confusing way to learn this.
 *
 *   node scripts/asc-rating.mjs            # dry run
 *   node scripts/asc-rating.mjs --apply
 */

import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const APPLY = process.argv.includes('--apply')
const BUNDLE_ID = 'kr.co.ddstudio.ricochet'
const PRIMARY_CATEGORY = 'GAMES'
const PRIMARY_SUBCATEGORY = 'GAMES_PUZZLE'
const SECONDARY_SUBCATEGORY = 'GAMES_CASUAL'

const token = execFileSync('python3', [resolve(homedir(), '.appstoreconnect/asc_token.py')])
  .toString().trim().split('\n').pop().trim()
const API = 'https://api.appstoreconnect.apple.com/v1'

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

/** Everything an abstract arrow puzzle does not contain. */
const NONE_FIELDS = [
  'alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated',
  'gunsOrOtherWeapons', 'healthOrWellnessTopics', 'horrorOrFearThemes',
  'matureOrSuggestiveThemes', 'medicalOrTreatmentInformation',
  'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity', 'sexualContentOrNudity',
  'violenceCartoonOrFantasy', 'violenceRealistic',
  'violenceRealisticProlongedGraphicOrSadistic',
]
const FALSE_FIELDS = [
  'gambling', 'unrestrictedWebAccess', 'lootBox', 'messagingAndChat',
  'parentalControls', 'socialMedia', 'socialMediaAgeRestricted',
  'userGeneratedContent',
]

const app = (await must(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`)).data[0]
if (!app) throw new Error(`no app record for ${BUNDLE_ID}`)
console.log(`• app ${app.attributes.name} (${app.id})`)

const infos = await must(`/apps/${app.id}/appInfos?limit=5`)
const info = infos.data.find((i) => i.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION') ?? infos.data[0]

// --- Age rating ------------------------------------------------------------
const decl = await must(`/appInfos/${info.id}/ageRatingDeclaration`)
const current = decl.data.attributes
const attributes = {}
for (const f of NONE_FIELDS) if (current[f] === null) attributes[f] = 'NONE'
for (const f of FALSE_FIELDS) if (current[f] === null) attributes[f] = false
// The store build ships without any ad network.
if (current.advertising === null) attributes.advertising = false

if (Object.keys(attributes).length === 0) {
  console.log('• age rating already declared')
} else if (!APPLY) {
  console.log(`  + would declare ${Object.keys(attributes).length} age-rating fields`)
} else {
  // Apple mixes enums and booleans in this resource and moves fields between
  // the two across schema revisions, so let the API tell us which is which.
  let fixes = 0
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = await req(`/ageRatingDeclarations/${decl.data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'ageRatingDeclarations', id: decl.data.id, attributes } }),
    })
    if (r.ok) break
    const detail = r.body?.errors?.[0]?.detail ?? ''
    const wrongType = detail.match(/attribute '(\w+)'\. Expected a (\w+) but got (\w+)/)
    const missing = detail.match(/must provide a value for the attribute '(\w+)'/)
    if (wrongType) {
      attributes[wrongType[1]] = wrongType[2] === 'BOOLEAN' ? false : 'NONE'
    } else if (missing) {
      // Start booleans at false; the type corrector flips it if it is an enum.
      attributes[missing[1]] = false
    } else {
      throw new Error(`PATCH ageRatingDeclarations → ${r.status} ${detail}`)
    }
    fixes++
    if (attempt === 39) throw new Error('gave up correcting age-rating field types')
  }
  console.log(`  ✓ declared ${Object.keys(attributes).length} age-rating fields (${fixes} type corrections)`)
}

// --- Categories ------------------------------------------------------------
const hasPrimary = !!info.relationships?.primaryCategory?.data
if (hasPrimary) {
  console.log('• categories already set')
} else if (!APPLY) {
  console.log(`  + would set ${PRIMARY_CATEGORY}/${PRIMARY_SUBCATEGORY} + ${SECONDARY_SUBCATEGORY}`)
} else {
  await must(`/appInfos/${info.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'appInfos',
        id: info.id,
        // Games take one top-level category with up to two subcategories;
        // reusing GAMES as the secondary is rejected outright.
        relationships: {
          primaryCategory: { data: { type: 'appCategories', id: PRIMARY_CATEGORY } },
          primarySubcategoryOne: { data: { type: 'appCategories', id: PRIMARY_SUBCATEGORY } },
          primarySubcategoryTwo: { data: { type: 'appCategories', id: SECONDARY_SUBCATEGORY } },
        },
      },
    }),
  })
  console.log('  ✓ categories set')
}

// --- Content rights --------------------------------------------------------
if (app.attributes.contentRightsDeclaration) {
  console.log('• content rights already declared')
} else if (!APPLY) {
  console.log('  + would declare no third-party content')
} else {
  await must(`/apps/${app.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'apps',
        id: app.id,
        attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' },
      },
    }),
  })
  console.log('  ✓ content rights declared')
}

if (!APPLY) { console.log('\ndry run — re-run with --apply'); process.exit(0) }

const after = await must(`/apps/${app.id}/appInfos?limit=5`)
const a = after.data.find((i) => i.id === info.id)
console.log(`\n최종 연령등급: ${a.attributes.appStoreAgeRating ?? '(아직 계산 중)'}`)
