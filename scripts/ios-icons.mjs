/**
 * Fills the iOS asset catalog from public/icon.png (iPhone slots + marketing)
 * and paints the launch image: the night background with the icon in the middle.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const SET = 'ios/App/App/Assets.xcassets/AppIcon.appiconset'
const SLOTS = [[20, 2], [20, 3], [29, 2], [29, 3], [40, 2], [40, 3], [60, 2], [60, 3]]
mkdirSync(SET, { recursive: true })
const images = []
const size = (px, out) => execFileSync('sips', ['-s', 'format', 'png', '-z', String(px), String(px), 'public/icon.png', '--out', out], { stdio: 'ignore' })
for (const [pt, scale] of SLOTS) {
  const px = pt * scale
  size(px, `${SET}/AppIcon-${px}.png`)
  images.push({ size: `${pt}x${pt}`, idiom: 'iphone', filename: `AppIcon-${px}.png`, scale: `${scale}x` })
}
size(1024, `${SET}/AppIcon-1024.png`)
images.push({ size: '1024x1024', idiom: 'ios-marketing', filename: 'AppIcon-1024.png', scale: '1x' })
writeFileSync(`${SET}/Contents.json`, JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n')

execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
import glob
bg = Image.new('RGB', (2732, 2732), (11, 16, 38))
icon = Image.open('public/icon.png').convert('RGB').resize((420, 420), Image.LANCZOS)
mask = Image.new('L', (420, 420), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, 419, 419), 94, fill=255)
bg.paste(icon, (1156, 1156), mask)
for f in glob.glob('ios/App/App/Assets.xcassets/Splash.imageset/*.png'): bg.save(f)
`])
console.log('icons and splash written')
