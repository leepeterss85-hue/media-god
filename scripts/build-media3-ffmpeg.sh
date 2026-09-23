#!/usr/bin/env bash
set -euo pipefail

# Reproducible source build of the Media3 audio extension. It must use the
# exact Media3 version of the consuming app; it is not on Google's Maven repo.
version="${1:?Media3 version required (1.8.0 or 1.11.0)}"
output="${2:?Output AAR path required}"
case "$version" in 1.8.0|1.11.0) ;; *) echo "Unexpected Media3 version" >&2; exit 1;; esac

ndk_path="${ANDROID_NDK_HOME:-${ANDROID_HOME:-}/ndk/26.1.10909125}"
test -d "$ndk_path" || { echo "Android NDK r26b required: $ndk_path" >&2; exit 1; }

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
git clone --quiet --depth 1 --branch "$version" https://github.com/androidx/media.git "$work_dir/media3"
git clone --quiet --depth 1 --branch release/6.0 https://github.com/FFmpeg/FFmpeg.git "$work_dir/ffmpeg"

module="$work_dir/media3/libraries/decoder_ffmpeg/src/main"
ln -s "$work_dir/ffmpeg" "$module/jni/ffmpeg"
(
  cd "$module/jni"
  ./build_ffmpeg.sh "$module" "$ndk_path" linux-x86_64 21 \
    aac ac3 eac3 truehd dca vorbis opus flac alac mp3
)

gradle -p "$work_dir/media3" :lib-decoder-ffmpeg:assembleRelease --no-daemon
aar="$work_dir/media3/libraries/decoder_ffmpeg/buildout/outputs/aar/media3-decoder-ffmpeg-release.aar"
if [[ ! -f "$aar" ]]; then
  aar="$(find "$work_dir/media3/libraries/decoder_ffmpeg" -path '*/outputs/aar/*release.aar' -print -quit)"
fi
test -s "$aar"
for abi in armeabi-v7a arm64-v8a x86 x86_64; do
  unzip -Z1 "$aar" | grep -q "^jni/$abi/libffmpegJNI.so$" || {
    echo "FFmpeg JNI missing for $abi" >&2; exit 1;
  }
done
mkdir -p "$(dirname "$output")"
cp "$aar" "$output"
