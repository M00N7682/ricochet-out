# Releasing Ricochet Out on the App Store

Done already: bundle ID `kr.co.ddstudio.ricochet`, ad hoc + App Store profiles
(`scripts/ios-provision.mjs`), repo secrets, CI (`.github/workflows/ios.yml`),
listing text (`store/listing/`), 6 screenshots 1290×2796 (`store/screenshots/`),
privacy/support pages, review notes.

## The one manual step
Apple does not allow creating the app record through the API. In App Store Connect → 앱 → ＋ 신규 앱:
- 플랫폼 iOS · 이름 **리코셰 아웃: 거울 반사 퍼즐** · 기본 언어 한국어
- 번들 ID **kr.co.ddstudio.ricochet** · SKU `ricochet-out` · 사용자 액세스 전체

## Then
```
./scripts/asc-release.sh          # rating, price/territories, listing, screenshots, CI build + upload
# App Store Connect → 앱 개인정보 보호 → "데이터를 수집하지 않음" → 게시 (web UI only)
ASC_REVIEW_FIRST=… ASC_REVIEW_LAST=… ASC_REVIEW_PHONE=+8210… ASC_REVIEW_EMAIL=… ASC_COPYRIGHT="2026 …" \
  ./scripts/asc-release.sh --submit
```

## Re-running pieces
- Screenshots: build with `VITE_STORE_RELEASE=1`, serve, `node scripts/store-shots.mjs <url> store/raw`, `python3 scripts/store-captions.py`
- Ad hoc install page: `gh workflow run ios.yml --field variant=adhoc`, download the artifact, `node scripts/ios-ota.mjs App.ipa`, deploy
