#!/usr/bin/env bash
# Preserve the last fully published, signed phone + Fire TV release BEFORE
# latest pointers are replaced. Requires GH_TOKEN and GITHUB_REPOSITORY.
set -euo pipefail

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"
root="${RUNNER_TEMP:-/tmp}/media-god-release-archive"
mkdir -p "$root"

release_json() { gh api "repos/$repo/releases/tags/$1"; }
mobile="$(release_json android-mobile-latest)"
firetv="$(release_json firetv-latest)"
old_mobile_sha="$(jq -r '.target_commitish // ""' <<< "$mobile")"
old_firetv_sha="$(jq -r '.target_commitish // ""' <<< "$firetv")"

if [[ ! "$old_mobile_sha" =~ ^[0-9a-f]{40}$ ]] ||
   [[ "$old_mobile_sha" != "$old_firetv_sha" ]]; then
  echo "Last known-good phone and TV releases must reference the SAME immutable SHA" >&2
  exit 1
fi
if [[ "$old_mobile_sha" == "${GITHUB_SHA:-}" ]]; then
  echo "Current commit is already published on both devices; nothing to archive"
  exit 0
fi

for spec in "mobile:$mobile:Media-God-Android-Mobile.apk" "firetv:$firetv:Media-God-Fire-TV.apk"; do
  # Validate asset size and state from the public release API; never archive
  # a draft, unfinished upload or one device from a different commit.
  label="${spec%%:*}"
  if [[ "$label" == "mobile" ]]; then
    data="$mobile"; asset="Media-God-Android-Mobile.apk"
  else
    data="$firetv"; asset="Media-God-Fire-TV.apk"
  fi
  jq -e --arg asset "$asset" '
    .draft == false and .published_at != null and
    (any(.assets[]?; .name == $asset and .state == "uploaded" and .size > 1000000))
  ' <<< "$data" >/dev/null || { echo "Incomplete prior $label release" >&2; exit 1; }
done

archive_tag="stable-${old_mobile_sha:0:12}"
if gh release view "$archive_tag" --repo "$repo" >/dev/null 2>&1; then
  existing="$(release_json "$archive_tag")"
  jq -e --arg sha "$old_mobile_sha" '
    .target_commitish == $sha and
    (any(.assets[]?; .name == "Media-God-Android-Mobile.apk" and .size > 1000000)) and
    (any(.assets[]?; .name == "Media-God-Fire-TV.apk" and .size > 1000000))
  ' <<< "$existing" >/dev/null || { echo "Archive tag exists but is incomplete" >&2; exit 1; }
  echo "Known-good rollback archive already exists: $archive_tag"
  exit 0
fi

dir="$root/$archive_tag"
mkdir -p "$dir"
gh release download android-mobile-latest --repo "$repo" --pattern 'Media-God-Android-Mobile.apk' --dir "$dir"
gh release download firetv-latest --repo "$repo" --pattern 'Media-God-Fire-TV.apk' --dir "$dir"
test -s "$dir/Media-God-Android-Mobile.apk"
test -s "$dir/Media-God-Fire-TV.apk"
(cd "$dir" && sha256sum Media-God-Android-Mobile.apk Media-God-Fire-TV.apk > SHA256SUMS.txt)

cat > "$dir/NOTES.md" <<EOF
Known-good Media God recovery APKs from commit $old_mobile_sha.
These original signed APKs were archived before the latest download pointers changed.
SHA256SUMS.txt allows the two archive downloads to be verified.
Do not downgrade an installed Android APK in place: Android versionCode
downgrades are generally blocked. To recover on installed devices, release
the known-good source again with NEW, higher versionCodes and matching manifests.
EOF

gh release create "$archive_tag" \
  --repo "$repo" \
  --target "$old_mobile_sha" \
  --latest=false \
  --title "Media God stable recovery ($archive_tag)" \
  --notes-file "$dir/NOTES.md" \
  "$dir/Media-God-Android-Mobile.apk" \
  "$dir/Media-God-Fire-TV.apk" \
  "$dir/SHA256SUMS.txt"

echo "Archived both signed known-good APKs: $archive_tag"
