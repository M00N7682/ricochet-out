#!/bin/bash
# Everything after the App Store Connect app record exists, in order:
# build + upload on CI, age rating / categories, price + territories, listing
# text + screenshots, then (with --submit) attach the build and send to review.
#
#   ./scripts/asc-release.sh            # build, upload, fill the listing
#   ./scripts/asc-release.sh --submit   # also submit (needs ASC_REVIEW_* env, see asc-submit.mjs)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/node@22/bin:$PATH" NODE_USE_ENV_PROXY=1
REPO=M00N7682/ricochet-out

node scripts/asc-rating.mjs --apply
node scripts/asc-availability.mjs --apply
node scripts/asc-metadata.mjs --apply --screenshots --replace

if [ "${1:-}" != "--submit" ]; then
  gh workflow run ios.yml -R $REPO --field variant=appstore --field upload=true
  echo "CI 빌드·업로드 시작됨. 빌드 처리(10~30분)가 끝나면 App Privacy를 '데이터 수집 안 함'으로 저장하고"
  echo "  ./scripts/asc-release.sh --submit  을 실행하세요."
  exit 0
fi
node scripts/asc-submit.mjs --apply --submit
