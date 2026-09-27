import { rmSync } from 'node:fs'
/** The install page and its .ipa are web-only; keep them out of the app. */
rmSync('ios/App/App/public/install', { recursive: true, force: true })
