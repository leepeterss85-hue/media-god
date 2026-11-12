#!/usr/bin/env bash
# Preserve the last fully published, signed phone + Fire TV release BEFORE
# latest pointers are replaced. Requires GH_TOKEN and GITHUB_REPOSITORY.
set -euo pipefail

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"
root="${RUNNER_TEMP:-/tmp}/media-god-release-archive"
mkdir -p "$root"

source "$(dirname "${BASH_SOURCE[0]}")/github-release-json.sh"
mobile="$(release_json android-mobile-latest)"
firetv="$(release_json firetv-latest)"
old_mobile_sha="$(jq -r '.target_commitish // ""' <<< "$mobile")"
old_firetv_sha="$(jq -r '.target_commitish // ""' <<< "$firetv")"

if [[ ! "$old_mobile_sha" =~ ^[0-9a-f]{40}$ ]] ||
   [[ ! "$old_firetv_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Previous releases must each reference a real immutable commit SHA" >&2
  exit 1
fi

# Existing APKs can legitimately have different release dates: the older
# phone and TV workflows were independent. Do not pretend these builds were
# coordinated, and never delete either stable latest tag before preserving it.
# Archive each verified, published APK under its OWN source SHA. Only after
# both archives exist may the release workflow publish a new matched pair.
archive_independent_previous() {
  local label="$1" data="$2" sha="$3" source_tag="$4" asset="$5"
  local archive_tag="recovery-${label}-${sha:0:12}"
  jq -e --arg asset "$asset" '
    .draft == false and .published_at != null and
    (any(.assets[]?; .name == $asset and .state == "uploaded" and .size > 1000000))
  ' <<< "$data" >/dev/null || {
    echo "Previous $label release has no verified published APK: refusing replacement" >&2
    return 1
  }

  local existing
  if existing="$(release_json "$archive_tag")"; then
    jq -e --arg sha "$sha" --arg asset "$asset" '
      .target_commitish == $sha and .draft == false and
      (any(.assets[]?; .name == $asset and .state == "uploaded" and .size > 1000000))
    ' <<< "$existing" >/dev/null || {
      echo "Existing $archive_tag is incomplete or has a different commit" >&2
      return 1
    }
    echo "Previous $label APK already archived: $archive_tag"
    return 0
  fi

  local dir="$root/$archive_tag"
  mkdir -p "$dir"
  # gh release download repeats the failing tag route; use inspected asset ID.
  download_release_asset "$data" "$asset" "$dir"
  test -s "$dir/$asset"
  # A successful download command alone does not prove the original APK is
  # complete; compare its byte length with GitHub's published asset metadata.
  local expected_bytes actual_bytes
  expected_bytes="$(jq -r --arg asset "$asset" '.assets[] | select(.name == $asset) | .size' <<< "$data")"
  actual_bytes="$(wc -c < "$dir/$asset" | tr -d '[:space:]')"
  if [[ "$expected_bytes" != "$actual_bytes" ]]; then
    echo "Previous $label APK download was incomplete; refusing replacement" >&2
    return 1
  fi
  (cd "$dir" && sha256sum "$asset" > SHA256SUMS.txt)
  cat > "$dir/NOTES.md" <<EOF
Unmodified previously published Media God $label APK from $source_tag.
Original immutable commit: $sha
This is one separately verified device release; the prior mobile and Fire TV
latest tags were on DIFFERENT commits. Do not treat them as a paired build.
SHA256SUMS.txt verifies this original signed APK.
Do not downgrade installed APKs in-place (Android versionCode enforcement).
EOF
  gh release create "$archive_tag" \
    --repo "$repo" --target "$sha" --latest=false \
    --title "Media God $label previous APK ($archive_tag)" \
    --notes-file "$dir/NOTES.md" \
    "$dir/$asset" "$dir/SHA256SUMS.txt"
  echo "Archived prior $label build: $archive_tag"
}

if [[ "$old_mobile_sha" != "$old_firetv_sha" ]]; then
  archive_independent_previous mobile "$mobile" "$old_mobile_sha" \
    android-mobile-latest Media-God-Android-Mobile.apk
  archive_independent_previous firetv "$firetv" "$old_firetv_sha" \
    firetv-latest Media-God-Fire-TV.apk
  echo "Both independently published previous APKs are safely archived."
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
if existing="$(release_json "$archive_tag")"; then
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
download_release_asset "$mobile" Media-God-Android-Mobile.apk "$dir"
download_release_asset "$firetv" Media-God-Fire-TV.apk "$dir"
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
