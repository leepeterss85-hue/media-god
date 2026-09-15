from pathlib import Path
import re

root = Path('.')

# Permanent RD policy rejection must not be treated like a recoverable cache job.
video = root / 'src/components/mg/VideoPlayer.jsx'
text = video.read_text()
needle = '''    const hardFailureMessage =
      /(?:\\b451\\b|infringing[_ -]?file|copyright|wrong\\s+ip|rate[-\\s]?limit|not\\s+cached|couldn['’]?t\\s+start|could\\s+not\\s+start|comet\\s+returned\\s+its\\s+error)/i.test(
        String(message || "")
      );
'''
if needle not in text:
    raise SystemExit('VideoPlayer hard-failure block was not found')
replacement = needle + '''
    const permanentRdTorrentRejection =
      /(?:\\b451\\b|infringing[_ -]?file|copyright|infringing)/i.test(
        String(message || "")
      );
'''
text = text.replace(needle, replacement, 1)

marker = '    if (sourceNeedsCaching(active)) {'
start = text.find('const permanentRdTorrentRejection')
pos = text.find(marker, start)
if pos < 0:
    raise SystemExit('VideoPlayer uncached hold was not found')
text = text[:pos] + '    if (sourceNeedsCaching(active) && !permanentRdTorrentRejection) {' + text[pos + len(marker):]
video.write_text(text)

# Strengthen fallback audio on both native targets.
for rel in [
    'firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt',
    'android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt',
]:
    path = root / rel
    body = path.read_text()
    audio_setup = '''                player.setAudioOutput("android_audiotrack")
                player.setAudioDigitalOutputEnabled(false)
                player.setAudioOutputDevice("stereo")'''
    if audio_setup not in body:
        raise SystemExit(f'Audio compatibility setup missing in {rel}')
    body = body.replace(audio_setup, audio_setup + '\n                player.setVolume(100)', 1)

    playing = '''                        MediaPlayer.Event.Playing -> {
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            statusText.text = "Compatibility decoder"
'''
    if playing not in body:
        raise SystemExit(f'Playing event block missing in {rel}')
    playing_fix = playing + '''
                            try {
                                player.setVolume(100)
                                if (player.audioTrack < 0) {
                                    player.audioTracks
                                        ?.firstOrNull { it.id >= 0 }
                                        ?.let { player.setAudioTrack(it.id) }
                                }
                            } catch (_: Throwable) {
                                // Keep playback running if a vendor VLC build exposes
                                // an unusual audio-track table.
                            }
'''
    body = body.replace(playing, playing_fix, 1)
    path.write_text(body)

# Version bumps so devices receive a new signed APK.
fire_gradle = root / 'firetv-android/app/build.gradle.kts'
body = fire_gradle.read_text()
if 'versionName = "1.4.21"' not in body:
    raise SystemExit('Unexpected Fire TV version')
body = body.replace('versionCode = 26', 'versionCode = 27', 1)
body = body.replace('versionName = "1.4.21"', 'versionName = "1.4.22"', 1)
fire_gradle.write_text(body)

mobile_gradle = root / 'android-mobile/app/build.gradle.kts'
body = mobile_gradle.read_text()
if 'versionName = "1.0.10"' not in body:
    raise SystemExit('Unexpected Android mobile version')
body = body.replace('versionCode = 11', 'versionCode = 12', 1)
body = body.replace('versionName = "1.0.10"', 'versionName = "1.0.11"', 1)
mobile_gradle.write_text(body)

structure = root / 'scripts/native-structure-check.mjs'
body = structure.read_text()
body = body.replace('expectedVersion: "1.4.21"', 'expectedVersion: "1.4.22"', 1)
body = body.replace('expectedVersion: "1.0.10"', 'expectedVersion: "1.0.11"', 1)
anchor = '[compatibilityActivity.includes("setAudioOutputDevice(\\"stereo\\")"), "stereo PCM compatibility output"],'
if anchor in body:
    body = body.replace(
        anchor,
        anchor + '\n    [compatibilityActivity.includes("setVolume(100)"), "compatibility audio volume restore"],\n    [compatibilityActivity.includes("audioTracks"), "compatibility audio track rescue"],',
        1,
    )
structure.write_text(body)

fire_update = root / 'public/firetv-update.json'
body = fire_update.read_text()
body = body.replace('"versionCode": 26', '"versionCode": 27', 1)
body = body.replace('"versionName": "1.4.21"', '"versionName": "1.4.22"', 1)
body = re.sub(
    r'"message": ".*?",',
    '"message": "Fire TV 1.4.22 fixes two 4K recovery problems: Real-Debrid 451/infringing torrent rejections now immediately advance to the next source instead of remaining selected, while LibVLC compatibility playback forces decoded stereo PCM, restores full volume and selects an available audio track when a difficult remux opens silently.",',
    body,
    count=1,
)
fire_update.write_text(body)

mobile_update = root / 'public/android-mobile-update.json'
body = mobile_update.read_text()
body = body.replace('"versionCode": 11', '"versionCode": 12', 1)
body = body.replace('"versionName": "1.0.10"', '"versionName": "1.0.11"', 1)
body = re.sub(
    r'"message": ".*?",',
    '"message": "Media God Mobile 1.0.11 fixes two 4K recovery problems: Real-Debrid 451/infringing torrent rejections now immediately advance to the next source instead of remaining selected, while LibVLC compatibility playback forces decoded stereo PCM, restores full volume and selects an available audio track when a difficult remux opens silently.",',
    body,
    count=1,
)
mobile_update.write_text(body)

ui_check = root / 'scripts/ui-regression-check.mjs'
body = ui_check.read_text()
anchor = '''expect(
  videoPlayer.includes("const selectorOpenKey = (event) =>")'''
if anchor not in body:
    raise SystemExit('UI regression anchor missing')
guard = '''expect(
  videoPlayer.includes("const permanentRdTorrentRejection =") &&
    videoPlayer.includes("sourceNeedsCaching(active) && !permanentRdTorrentRejection"),
  "permanent Real-Debrid rejection can no longer bypass automatic source failover"
);

'''
body = body.replace(anchor, guard + anchor, 1)
ui_check.write_text(body)
