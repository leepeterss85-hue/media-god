#!/usr/bin/env bash
set -euo pipefail
repo="${GITHUB_REPOSITORY:?}"
source "$(dirname "${BASH_SOURCE[0]}")/github-release-json.sh"
mobile="$(release_json android-mobile-latest)"
firetv="$(release_json firetv-latest)"
msha="$(jq -r .target_commitish <<< "$mobile")"
fsha="$(jq -r .target_commitish <<< "$firetv")"
for label in mobile firetv; do
  if [[ "$label" == mobile ]]; then data="$mobile"; sha="$msha"; asset=Media-God-Android-Mobile.apk
  else data="$firetv"; sha="$fsha"; asset=Media-God-Fire-TV.apk; fi
  if [[ "$msha" == "$fsha" ]]; then tag="stable-${sha:0:12}"; else tag="recovery-$label-${sha:0:12}"; fi
  archived="$(release_json "$tag")"
  jq -e --arg sha "$sha" '.target_commitish == $sha and .draft == false' <<< "$archived" >/dev/null
  dir="${RUNNER_TEMP:-/tmp}/archive-check-$label"
  download_release_asset "$data" "$asset" "$dir/original"
  download_release_asset "$archived" "$asset" "$dir/archive"
  cmp "$dir/original/$asset" "$dir/archive/$asset"
done
