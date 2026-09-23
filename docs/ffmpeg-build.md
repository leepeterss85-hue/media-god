# Media3 FFmpeg audio extension

The Android phone app uses Media3 1.11.0; Fire TV uses Media3 1.8.0 to retain
minSdk 21. The APK workflow builds each extension from its matching Media3 tag
and FFmpeg 6.0 with AAC, AC3, EAC3, TrueHD, DTS (`dca`), Vorbis, Opus, FLAC,
ALAC and MP3 decoders. It verifies the four Android ABIs and places the AAR in
`app/libs` before compiling the APK. `EXTENSION_RENDERER_MODE_ON` prefers the
platform decoder and uses FFmpeg when the platform cannot decode the track.
It does not choose a new stream or change tracks after playback begins.

To build locally on Linux, install Android NDK r26b, CMake 3.22.1, Java 17,
Gradle 8.11.1 and the Android platforms 35 and 36. Then run:

```bash
scripts/build-media3-ffmpeg.sh 1.8.0 firetv-android/app/libs/decoder-ffmpeg.aar
scripts/build-media3-ffmpeg.sh 1.11.0 android-mobile/app/libs/decoder-ffmpeg.aar
```

The AARs are generated build artifacts and are not committed. FFmpeg and Media3
have separate licenses; review the [Media3 extension instructions](https://github.com/androidx/media/blob/release/libraries/decoder_ffmpeg/README.md)
and the [FFmpeg licensing page](https://ffmpeg.org/legal.html) when distributing
APKs. Build sources and enabled decoder list are recorded in the script.
