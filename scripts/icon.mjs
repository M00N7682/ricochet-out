/**
 * Renders the app icon: a neon arrow bending off a mirror, on the game's night
 * background. Opaque 1024x1024 (App Store icons may not have alpha).
 *
 *   node scripts/icon.mjs            → public/icon.png, public/icon-512.png
 */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const html = `<canvas id=c width=1024 height=1024></canvas><script>
const c = document.getElementById('c').getContext('2d')
const g = c.createLinearGradient(0, 0, 1024, 1024)
g.addColorStop(0, '#12183a'); g.addColorStop(1, '#2a0f4a')
c.fillStyle = g; c.fillRect(0, 0, 1024, 1024)
c.fillStyle = 'rgba(255,255,255,0.13)'
for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { c.beginPath(); c.arc(152 + x * 180, 152 + y * 180, 9, 0, 7); c.fill() }
function glow(col, b) { c.shadowColor = col; c.shadowBlur = b }
// mirror
glow('#e0fbfc', 60); c.strokeStyle = '#e0fbfc'; c.lineWidth = 34; c.lineCap = 'round'
c.beginPath(); c.moveTo(450, 250); c.lineTo(630, 70); c.stroke()
// the path it took: up from the bottom, off the mirror, out to the right
c.save(); c.setLineDash([26, 26]); glow('#4cc9f0', 20); c.strokeStyle = 'rgba(76,201,240,0.55)'; c.lineWidth = 12
c.beginPath(); c.moveTo(540, 290); c.lineTo(540, 160); c.lineTo(990, 160); c.stroke(); c.restore()
// snake
glow('#4cc9f0', 70); c.strokeStyle = '#4cc9f0'; c.lineWidth = 110; c.lineJoin = 'round'
c.beginPath(); c.moveTo(240, 880); c.lineTo(240, 620); c.lineTo(540, 620); c.lineTo(540, 470); c.stroke()
c.fillStyle = '#4cc9f0'; c.beginPath(); c.moveTo(540, 300); c.lineTo(640, 470); c.lineTo(440, 470); c.closePath(); c.fill()
// a second, pink arrow
glow('#f72585', 60); c.strokeStyle = '#f72585'; c.lineWidth = 110
c.beginPath(); c.moveTo(560, 830); c.lineTo(800, 830); c.stroke()
c.fillStyle = '#f72585'; c.beginPath(); c.moveTo(930, 830); c.lineTo(790, 740); c.lineTo(790, 920); c.closePath(); c.fill()
</script>`
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } })
await p.setContent(html)
await p.waitForTimeout(200)
await p.locator('#c').screenshot({ path: '.work/icon-raw.png' })
await b.close()
// Flatten to RGB so there is no alpha channel.
execFileSync('python3', ['-c', `from PIL import Image
im = Image.open('.work/icon-raw.png').convert('RGB')
im.save('public/icon.png'); im.resize((512, 512), Image.LANCZOS).save('public/icon-512.png')`])
console.log('wrote public/icon.png, public/icon-512.png')
