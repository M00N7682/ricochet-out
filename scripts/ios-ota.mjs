/**
 * Puts an ad-hoc .ipa on the install page: copies it to public/install/app.ipa,
 * writes manifest.plist, and rewrites the page with the itms-services link.
 *
 *   node scripts/ios-ota.mjs path/to/App.ipa
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'

const IPA = process.argv[2]
if (!IPA) throw new Error('usage: node scripts/ios-ota.mjs <App.ipa>')
const SITE = 'https://ricochet-out.vercel.app'
const BUNDLE_ID = 'kr.co.ddstudio.ricochet'
mkdirSync('public/install', { recursive: true })
copyFileSync(IPA, 'public/install/app.ipa')

writeFileSync('public/install/manifest.plist', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict><key>kind</key><string>software-package</string><key>url</key><string>${SITE}/install/app.ipa</string></dict>
        <dict><key>kind</key><string>display-image</string><key>url</key><string>${SITE}/icon-512.png</string></dict>
        <dict><key>kind</key><string>full-size-image</string><key>url</key><string>${SITE}/icon.png</string></dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${BUNDLE_ID}</string>
        <key>bundle-version</key><string>1.0.0</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>Ricochet Out</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`)

writeFileSync('public/install/index.html', `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>리코셰 아웃 설치</title>
<style>
body{margin:0;min-height:100vh;background:#0b1026;color:#fff;font-family:system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;display:flex;align-items:center;justify-content:center;text-align:center}
main{max-width:420px;padding:28px}
img{width:132px;height:132px;border-radius:30px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
h1{margin:18px 0 4px;font-size:30px;font-style:italic}
p{opacity:.8;line-height:1.6}
a{display:block;margin:14px 0;padding:16px;border-radius:16px;font-weight:900;font-size:18px;text-decoration:none;color:#fff}
.ios{background:linear-gradient(135deg,#4cc9f0,#7b61ff)}.web{background:linear-gradient(135deg,#f72585,#7209b7)}.apk,.ad{background:#343a40}
small{opacity:.6;line-height:1.6;display:block}
</style>
</head>
<body><main>
<img src="../icon-512.png" alt="">
<h1>RICOCHET OUT</h1>
<p>화살표를 탭하면 날아가고, 거울에 닿으면 꺾여요. 모든 화살표를 내보내세요.</p>
<a class="ios" href="itms-services://?action=download-manifest&amp;url=${SITE}/install/manifest.plist">📱 아이폰에 설치</a>
<small>Safari에서 누르세요. 설치 후 설정 → 일반 → VPN 및 기기 관리에서 신뢰가 필요할 수 있어요. 등록된 기기에서만 설치됩니다.</small>
<a class="web" href="../">▶ 브라우저에서 바로 하기</a>
</main></body>
</html>
`)
console.log('install page ready:', SITE + '/install/')
