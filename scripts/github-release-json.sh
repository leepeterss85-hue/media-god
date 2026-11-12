#!/usr/bin/env bash
# Tag routes can briefly return 404 after GitHub replaces a release. Recover
# only an exact published tag from the paginated list; never guess a release.
release_json() {
  local tag="$1" result attempt
  for attempt in 1 2 3; do
    if result="$(gh api "repos/$repo/releases/tags/$tag" 2>/dev/null)"; then
      printf '%s\n' "$result"; return 0
    fi
    if result="$(gh api --paginate --slurp "repos/$repo/releases?per_page=100")"; then
      result="$(jq -c --arg tag "$tag" '[.[][] | select(.tag_name == $tag)] | if length == 1 then .[0] else empty end' <<< "$result")"
      if [[ -n "$result" ]]; then printf '%s\n' "$result"; return 0; fi
    fi
    sleep "$attempt"
  done
  echo "Cannot read release $tag in $repo; keeping existing APKs unchanged" >&2
  return 1
}

# Download the exact asset ID from the inspected release, bypassing a stale
# tag lookup. Byte count and SHA-256 digest (when supplied) must agree.
download_release_asset() {
  local data="$1" asset="$2" dir="$3" id size digest attempt
  id="$(jq -er --arg name "$asset" '.assets[] | select(.name == $name and .state == "uploaded") | .id' <<< "$data")" || return 1
  [[ "$id" =~ ^[0-9]+$ ]] || return 1
  size="$(jq -r --arg name "$asset" '.assets[] | select(.name == $name) | .size' <<< "$data")"
  digest="$(jq -r --arg name "$asset" '.assets[] | select(.name == $name) | .digest // ""' <<< "$data")"
  mkdir -p "$dir"
  for attempt in 1 2 3; do
    if gh api -H 'Accept: application/octet-stream' "repos/$repo/releases/assets/$id" > "$dir/$asset.part" &&
       [[ "$(wc -c < "$dir/$asset.part" | tr -d '[:space:]')" == "$size" ]]; then
      if [[ "$digest" == sha256:* ]] && [[ "$(sha256sum "$dir/$asset.part" | cut -d ' ' -f 1)" != "${digest#sha256:}" ]]; then
        echo "Asset checksum mismatch: $asset" >&2; return 1
      fi
      mv "$dir/$asset.part" "$dir/$asset"; return 0
    fi
    sleep "$attempt"
  done
  echo "Could not verify download: $asset" >&2; return 1
}
