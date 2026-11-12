#!/usr/bin/env bash
# Make a permanent, byte-verified pair BEFORE touching either latest pointer.
set -euo pipefail
repo="${GITHUB_REPOSITORY:?}"
source "$(dirname "${BASH_SOURCE[0]}")/github-release-json.sh"
tag="apk-${GITHUB_SHA:?}"
dir="${RUNNER_TEMP:-/tmp}/staged-apks-$GITHUB_SHA"
if ! gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
  gh release create "$tag" --repo "$repo" --target "$GITHUB_SHA" --latest=false \
    --title "Media God verified APK pair ${GITHUB_SHA:0:12}" \
    --notes 'Signed APK pair. Latest update prompts are enabled separately after public download verification.' \
    Media-God-Android-Mobile.apk Media-God-Fire-TV.apk
fi
data="$(release_json "$tag")"
jq -e --arg sha "$GITHUB_SHA" '.target_commitish == $sha and .draft == false' <<< "$data" >/dev/null
for asset in Media-God-Android-Mobile.apk Media-God-Fire-TV.apk; do
  download_release_asset "$data" "$asset" "$dir"
  cmp "$asset" "$dir/$asset"
done
