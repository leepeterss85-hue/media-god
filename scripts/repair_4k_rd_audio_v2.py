from pathlib import Path
import re

root = Path('.')

video = root / 'src/components/mg/VideoPlayer.jsx'
text = video.read_text()
needle = '''    const hardFailureMessage =
      /(?:\\b451\\b|infringing[_ -]?file|copyright|wrong\\s+ip|rate[-\\s]?limit|not\\s+cached|couldn['’]?t\\s+start|could\\s+not\\s+start|comet\\s+returned\\s+its\\s+error)/i.test(
        String(message || "")
      );
'''
if needle not in text:
    raise SystemExit('VideoPlayer hard-failure block was not found')
text = text.replace(
    needle,
    needle + '''
    const permanentRdTorrentRejection =
      /(?:\\b451\\b|infringing[_ -]?file|copyright|infringing)/i.test(
        String(message || "")
      );
''',
    1,
)
marker = '    if (sourceNeedsCaching(active)) {'
pos = text.find(marker, text.find('const permanentRdTorrentRejection'))
if pos < 0:
    raise SystemExit('VideoPlayer uncached hold was not found')
text = text[:pos] + '    if (sourceNeedsCaching(active) && !permanentRdTorrentRejection) {' + text[pos + len(marker):]
video.write_text(text)

for rel in [
    'firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt',
    'android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt',
]:
    path = root / rel
    body = path.read_text()
    setup = '''                player.setAudioOutput("android_audiotrack")
                player.setAudioDigitalOutputEnabled(false)
                player.setAudioOutputDevice("stereo")'''
    if setup not in body:
        raise SystemExit(f'Audio setup missing in {rel}')
    body = body.replace(setup, setup + '\n                player.setVolume(100)', 1)
    playing = '''                        MediaPlayer.Event.Playing -> {
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            statusText.text = "Compatibility decoder"
'''
    if playing not in body:
        raise SystemExit(f'Playing block missing in {rel}')
    body = body.replace(
        playing,
        playing + '''
                            try {
                                player.setVolume(100)
                                if (player.audioTrack < 0) {
                                    player.audioTracks
                                        ?.firstOrNull { it.id >= 0 }
                                        ?.let { player.setAudioTrack(it.id) }
                                }
                            } catch (_: Throwable) {
                                // Keep playback running on unusual vendor audio tables.
                            }
''',
        1,
    )
    path.write_text(body)

fire_gradle = root / 'firetv-android/app/build.gradle.kts'
body = fire_gradle.read_text()
if 'versionName = "1.4.21"' not in body:
    raise SystemExit('Unexpected Fire TV version')
fire_gradle.write_text(body.replace('versionCode = 26', 'versionCode = 27', 1).replace('versionName = "1.4.21"', 'versionName = "1.4.22"', 1))

mobile_gradle = root / 'android-mobile/app/build.gradle.kts'
body = mobile_gradle.read_text()
if 'versionName = "1.0.10"' not in body:
    raise SystemExit('Unexpected mobile version')
mobile_gradle.write_text(body.replace('versionCode = 11', 'versionCode = 12', 1).replace('versionName = "1.0.10"', 'versionName = "1.0.11"', 1))

structure = root / 'scripts/native-structure-check.mjs'
body = structure.read_text().replace('expectedVersion: "1.4.21"', 'expectedVersion: "1.4.22"', 1).replace('expectedVersion: "1.0.10"', 'expectedVersion: "1.0.11"', 1)
structure.write_text(body)

for rel, old_code, new_code, old_ver, new_ver, product in [
    ('public/firetv-update.json', 26, 27, '1.4.21', '1.4.22', 'Fire TV'),
    ('public/android-mobile-update.json', 11, 12, '1.0.10', '1.0.11', 'Media God Mobile'),
]:
    path = root / rel
    body = path.read_text().replace(f'"versionCode": {old_code}', f'"versionCode": {new_code}', 1).replace(f'"versionName": "{old_ver}"', f'"versionName": "{new_ver}"', 1)
    message = f'{product} {new_ver} fixes 4K recovery: Real-Debrid 451/infringing torrent rejections immediately advance to the next source instead of remaining selected, and LibVLC compatibility playback restores full volume, forces decoded stereo PCM and selects an available audio track for difficult remuxes that previously played without sound.'
    body = re.sub(r'"message": ".*?",', '"message": ' + repr(message).replace("'", '"') + ',', body, count=1)
    path.write_text(body)
