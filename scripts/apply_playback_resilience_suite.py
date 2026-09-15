from pathlib import Path
import json
import re

ROOT = Path(".")


def read(path):
    return (ROOT / path).read_text()


def write(path, text):
    (ROOT / path).write_text(text)


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Missing anchor: {label}")
    return text.replace(old, new, 1)


def patch_main_activity(path, platform):
    text = read(path)

    if "EXTRA_DIAGNOSTICS" not in text:
        # The constant lives in PlayerActivity; MainActivity only reads it.
        pass

    if 'put("diagnostics", JSONObject(diagnosticsText))' not in text:
        anchor = '            put("message", data?.getStringExtra(PlayerActivity.EXTRA_MESSAGE).orEmpty())\n'
        insertion = anchor + '''            val diagnosticsText =\n                data?.getStringExtra(PlayerActivity.EXTRA_DIAGNOSTICS).orEmpty()\n            if (diagnosticsText.isNotBlank()) {\n                try {\n                    put("diagnostics", JSONObject(diagnosticsText))\n                } catch (_: Throwable) {\n                    put("diagnostics", diagnosticsText)\n                }\n            }\n'''
        text = replace_once(text, anchor, insertion, f"{path} diagnostics result")

    if "NativeStreamPreflight.checkPayload(payload)" not in text:
        play_start = text.find("        fun play(payloadJson: String): String {")
        if play_start < 0:
            raise SystemExit(f"Missing play() in {path}")

        launch_anchor = "            runOnUiThread {\n                val activityClass ="
        launch_pos = text.find(launch_anchor, play_start)
        if launch_pos < 0:
            raise SystemExit(f"Missing native launch anchor in {path}")

        preamble = '''            Thread {\n                val preflight = NativeStreamPreflight.checkPayload(payload)\n                payload.put("streamPreflight", preflight.toJson())\n\n                if (\n                    payload.optString("mimeType").isBlank() &&\n                    preflight.contentType.isNotBlank()\n                ) {\n                    payload.put(\n                        "mimeType",\n                        preflight.contentType.substringBefore(';').trim()\n                    )\n                }\n\n                if (preflight.shouldSkip) {\n                    synchronized(nativePlayerLock) {\n                        playerOpen = false\n                        if (activeNativeRequestId == requestId) {\n                            activeNativeRequestId = ""\n                        }\n                    }\n\n                    val message =\n                        if (preflight.statusCode > 0) {\n                            "Stream pre-check rejected this source (HTTP ${preflight.statusCode}). Trying another source."\n                        } else {\n                            "Stream pre-check rejected this source. Trying another source."\n                        }\n\n                    val diagnostics = NativePlaybackDiagnostics.snapshot(\n                        payload = payload,\n                        url = url,\n                        engine = "preflight",\n                        event = "rejected",\n                        message = message,\n                        extra = preflight.toJson()\n                    )\n\n                    val result = JSONObject().apply {\n                        put("requestId", requestId)\n                        put("reason", "error")\n                        put("positionMs", 0)\n                        put("durationMs", 0)\n                        put("message", message)\n                        put("selectedSourceIndex", payload.optInt("activeSourceIndex", -1))\n                        put("diagnostics", diagnostics)\n                    }\n\n                    dispatchJavascript(\n                        "window.dispatchEvent(new CustomEvent('mg:native-player-result',{detail:JSON.parse(${JSONObject.quote(result.toString())})}));"\n                    )\n                } else {\n                    runOnUiThread {\n                val activityClass ='''

        text = text[:launch_pos] + preamble + text[launch_pos + len(launch_anchor):]

        return_pos = text.find('            return "true"', launch_pos)
        if return_pos < 0:
            raise SystemExit(f"Missing play() return in {path}")
        closing_pos = text.rfind("            }", launch_pos, return_pos)
        if closing_pos < 0:
            raise SystemExit(f"Missing native launch close in {path}")
        text = (
            text[:closing_pos]
            + "                    }\n                }\n            }.start()"
            + text[closing_pos + len("            }"):]
        )

    write(path, text)


def patch_player_activity(path, force_display_mode):
    text = read(path)

    text = replace_once(
        text,
        '        const val EXTRA_MESSAGE = "mg_message"\n',
        '        const val EXTRA_MESSAGE = "mg_message"\n        const val EXTRA_DIAGNOSTICS = "mg_diagnostics"\n',
        f"{path} diagnostics constant",
    )

    rate_line = (
        "        DisplayRateMatcher.apply(\n"
        "            this,\n"
        "            payload,\n"
        "            streamUrl,\n"
        f"            forceDisplayMode = {'true' if force_display_mode else 'false'}\n"
        "        )\n"
    )
    if "DisplayRateMatcher.apply(\n            this,\n            payload" not in text:
        text = replace_once(
            text,
            "        enterImmersiveMode()\n\n        playerView = PlayerView(this).apply {",
            "        enterImmersiveMode()\n\n" + rate_line + "\n        playerView = PlayerView(this).apply {",
            f"{path} initial display-rate match",
        )

    if "DisplayRateMatcher.clear(this)" not in text:
        marker = "    override fun onDestroy() {"
        pos = text.find(marker)
        if pos < 0:
            raise SystemExit(f"Missing onDestroy in {path}")
        release_pos = text.find("        releasePlayer()", pos)
        if release_pos < 0:
            raise SystemExit(f"Missing releasePlayer in {path}")
        text = text[:release_pos] + "        DisplayRateMatcher.clear(this)\n" + text[release_pos:]

    if "setVideoChangeFrameRateStrategy" not in text:
        old = '''        val exoPlayer = ExoPlayer.Builder(this, renderersFactory)\n            .setMediaSourceFactory(mediaSourceFactory)\n            .build()'''
        new = '''        val exoPlayer = ExoPlayer.Builder(this, renderersFactory)\n            .setMediaSourceFactory(mediaSourceFactory)\n            .setVideoChangeFrameRateStrategy(\n                C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS\n            )\n            .build()'''
        text = replace_once(text, old, new, f"{path} Media3 frame-rate strategy")

    if "override fun onTracksChanged" not in text:
        listener_anchor = "        exoPlayer.addListener(object : Player.Listener {\n            override fun onIsPlayingChanged(isPlaying: Boolean) {"
        listener_block = f'''        exoPlayer.addListener(object : Player.Listener {{\n            override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {{\n                var selectedFrameRate = 0f\n\n                outer@ for (group in tracks.groups) {{\n                    if (group.type != C.TRACK_TYPE_VIDEO) continue\n                    for (index in 0 until group.length) {{\n                        if (!group.isTrackSelected(index)) continue\n                        val frameRate = group.getTrackFormat(index).frameRate\n                        if (frameRate > 0f) {{\n                            selectedFrameRate = frameRate\n                            break@outer\n                        }}\n                    }}\n                }}\n\n                if (selectedFrameRate > 0f) {{\n                    DisplayRateMatcher.apply(\n                        this@PlayerActivity,\n                        selectedFrameRate,\n                        forceDisplayMode = {'true' if force_display_mode else 'false'}\n                    )\n                }}\n            }}\n\n            override fun onIsPlayingChanged(isPlaying: Boolean) {{'''
        text = replace_once(text, listener_anchor, listener_block, f"{path} actual track frame rate")

    finish_pos = text.find("    private fun finishWithResult(")
    if finish_pos < 0:
        raise SystemExit(f"Missing finishWithResult in {path}")

    if "NativePlaybackDiagnostics.snapshot(" not in text[finish_pos:]:
        result_anchor = "        val result = Intent().apply {"
        result_pos = text.find(result_anchor, finish_pos)
        if result_pos < 0:
            raise SystemExit(f"Missing finish result in {path}")
        diagnostic_local = '''        val diagnostics = NativePlaybackDiagnostics.snapshot(\n            payload = payload,\n            url = streamUrl,\n            engine = "media3",\n            event = reason,\n            message = message\n        ).toString()\n\n'''
        text = text[:result_pos] + diagnostic_local + text[result_pos:]

        extra_anchor = "            putExtra(EXTRA_MESSAGE, message)"
        extra_pos = text.find(extra_anchor, result_pos)
        if extra_pos < 0:
            raise SystemExit(f"Missing result message extra in {path}")
        text = (
            text[:extra_pos]
            + extra_anchor
            + "\n            putExtra(EXTRA_DIAGNOSTICS, diagnostics)"
            + text[extra_pos + len(extra_anchor):]
        )

    write(path, text)


def patch_compatibility_activity(path, force_display_mode):
    text = read(path)

    text = replace_once(
        text,
        "    private lateinit var playPauseButton: Button\n",
        "    private lateinit var playPauseButton: Button\n    private lateinit var audioButton: Button\n",
        f"{path} audio button field",
    )

    if "DisplayRateMatcher.apply(\n            this,\n            payload" not in text:
        text = replace_once(
            text,
            "        enterImmersiveMode()\n        buildUi()",
            "        enterImmersiveMode()\n        DisplayRateMatcher.apply(\n            this,\n            payload,\n            streamUrl,\n            forceDisplayMode = "
            + ("true" if force_display_mode else "false")
            + "\n        )\n        buildUi()",
            f"{path} display rate",
        )

    if "controls.hasFocus()" not in text.split("override fun dispatchKeyEvent", 1)[1].split("override fun onDestroy", 1)[0]:
        key_anchor = "        if (event.action == KeyEvent.ACTION_DOWN && !event.isLongPress) {\n            when (event.keyCode) {"
        key_new = '''        if (event.action == KeyEvent.ACTION_DOWN && !event.isLongPress) {\n            if (\n                ::controls.isInitialized &&\n                controls.hasFocus() &&\n                event.keyCode in setOf(\n                    KeyEvent.KEYCODE_DPAD_LEFT,\n                    KeyEvent.KEYCODE_DPAD_RIGHT,\n                    KeyEvent.KEYCODE_DPAD_UP,\n                    KeyEvent.KEYCODE_DPAD_DOWN,\n                    KeyEvent.KEYCODE_DPAD_CENTER,\n                    KeyEvent.KEYCODE_ENTER\n                )\n            ) {\n                showControlsTemporarily()\n                return super.dispatchKeyEvent(event)\n            }\n\n            if (\n                event.keyCode == KeyEvent.KEYCODE_DPAD_UP ||\n                event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN\n            ) {\n                showControlsTemporarily()\n                if (::audioButton.isInitialized) {\n                    audioButton.requestFocus()\n                }\n                return true\n            }\n\n            when (event.keyCode) {'''
        text = replace_once(text, key_anchor, key_new, f"{path} D-pad audio control")

    if "audioButton = controlButton" not in text:
        forward_anchor = '''        val forwardButton = controlButton("+10s") {\n            seekBy(10_000L)\n        }'''
        forward_new = '''        audioButton = controlButton("Audio") {\n            cycleAudioTrack()\n        }\n\n        val forwardButton = controlButton("+10s") {\n            seekBy(10_000L)\n        }'''
        text = replace_once(text, forward_anchor, forward_new, f"{path} audio button")

        add_anchor = "            addView(playPauseButton)\n            addView(forwardButton)"
        add_new = "            addView(playPauseButton)\n            addView(audioButton)\n            addView(forwardButton)"
        text = replace_once(text, add_anchor, add_new, f"{path} add audio button")

    if "updateAudioButtonLabel()" not in text:
        playing_anchor = "                            if (pendingStartPositionMs > 0L) {"
        text = replace_once(
            text,
            playing_anchor,
            "                            updateAudioButtonLabel()\n\n" + playing_anchor,
            f"{path} update audio button",
        )

    if "private fun cycleAudioTrack()" not in text:
        toggle_anchor = "    private fun togglePlayback() {"
        audio_methods = '''    private fun cycleAudioTrack() {\n        val player = vlcPlayer ?: return\n        val tracks = try {\n            player.audioTracks\n                ?.filter { it.id >= 0 }\n                .orEmpty()\n        } catch (_: Throwable) {\n            emptyList()\n        }\n\n        if (tracks.isEmpty()) {\n            statusText.text = "Audio · no selectable track"\n            statusText.visibility = View.VISIBLE\n            showControlsTemporarily()\n            return\n        }\n\n        val currentIndex = tracks.indexOfFirst { it.id == player.audioTrack }\n        val next = tracks[(currentIndex + 1).mod(tracks.size)]\n\n        try {\n            player.setAudioTrack(next.id)\n            player.setVolume(100)\n            val name = next.name?.trim().orEmpty().ifBlank { "Track ${next.id}" }\n            statusText.text = "Audio · $name"\n            statusText.visibility = View.VISIBLE\n        } catch (_: Throwable) {\n            statusText.text = "Audio · could not switch track"\n            statusText.visibility = View.VISIBLE\n        }\n\n        updateAudioButtonLabel()\n        showControlsTemporarily()\n    }\n\n    private fun updateAudioButtonLabel() {\n        if (!::audioButton.isInitialized) return\n\n        val player = vlcPlayer\n        val tracks = try {\n            player?.audioTracks\n                ?.filter { it.id >= 0 }\n                .orEmpty()\n        } catch (_: Throwable) {\n            emptyList()\n        }\n\n        if (tracks.isEmpty()) {\n            audioButton.text = "Audio"\n            return\n        }\n\n        val current = tracks.firstOrNull { it.id == player?.audioTrack } ?: tracks.first()\n        val name = current.name?.trim().orEmpty()\n        audioButton.text =\n            if (tracks.size > 1 && name.isNotBlank()) "Audio · $name"\n            else if (tracks.size > 1) "Audio · ${tracks.indexOf(current) + 1}/${tracks.size}"\n            else "Audio"\n    }\n\n'''
        text = replace_once(text, toggle_anchor, audio_methods + toggle_anchor, f"{path} audio track methods")

    if "DisplayRateMatcher.clear(this)" not in text:
        destroy_pos = text.find("    override fun onDestroy() {")
        if destroy_pos < 0:
            raise SystemExit(f"Missing onDestroy in {path}")
        release_pos = text.find("        releaseCompatibilityPlayer()", destroy_pos)
        if release_pos < 0:
            raise SystemExit(f"Missing compatibility release in {path}")
        text = text[:release_pos] + "        DisplayRateMatcher.clear(this)\n" + text[release_pos:]

    if "videoLayout.requestFocus()" not in text.split("private val hideControlsRunnable", 1)[1].split("override fun onCreate", 1)[0]:
        hide_anchor = '''        if (!resultSent && ::controls.isInitialized) {\n            controls.visibility = View.GONE'''
        hide_new = '''        if (!resultSent && ::controls.isInitialized) {\n            if (controls.hasFocus() && ::videoLayout.isInitialized) {\n                videoLayout.requestFocus()\n            }\n            controls.visibility = View.GONE'''
        text = replace_once(text, hide_anchor, hide_new, f"{path} restore video focus")

    finish_pos = text.find("    private fun finishWithResult(")
    if finish_pos < 0:
        raise SystemExit(f"Missing compatibility finish in {path}")

    if "engine = \"libvlc\"" not in text[finish_pos:]:
        result_anchor = "        val result = Intent().apply {"
        result_pos = text.find(result_anchor, finish_pos)
        if result_pos < 0:
            raise SystemExit(f"Missing compatibility result in {path}")
        diagnostic_local = '''        val audioExtra = JSONObject().apply {\n            try {\n                val currentAudioTrack = player?.audioTrack ?: -1\n                val currentAudioName = player?.audioTracks\n                    ?.firstOrNull { it.id == currentAudioTrack }\n                    ?.name\n                    ?.trim()\n                    .orEmpty()\n                put("selectedAudioTrack", currentAudioTrack)\n                put("selectedAudioName", currentAudioName)\n            } catch (_: Throwable) {\n                put("selectedAudioTrack", -1)\n            }\n        }\n        val diagnostics = NativePlaybackDiagnostics.snapshot(\n            payload = payload,\n            url = streamUrl,\n            engine = "libvlc",\n            event = reason,\n            message = message,\n            extra = audioExtra\n        ).toString()\n\n'''
        text = text[:result_pos] + diagnostic_local + text[result_pos:]

        extra_anchor = "            putExtra(PlayerActivity.EXTRA_MESSAGE, message)"
        extra_pos = text.find(extra_anchor, result_pos)
        if extra_pos < 0:
            raise SystemExit(f"Missing compatibility message result in {path}")
        text = (
            text[:extra_pos]
            + extra_anchor
            + "\n            putExtra(PlayerActivity.EXTRA_DIAGNOSTICS, diagnostics)"
            + text[extra_pos + len(extra_anchor):]
        )

    write(path, text)


def patch_router(path):
    text = read(path)
    old = '''            if (hints.dolbyVisionProfile == 7) {\n                // Profile 7/FEL is a common UHD Blu-ray remux failure on Fire/Android TV.\n                return false\n            }'''
    new = '''            if (hints.dolbyVisionProfile == 7) {\n                /*\n                 * Profile 7 remuxes often contain a perfectly usable HEVC base\n                 * layer even when the enhancement layer is unsupported. Prefer\n                 * that hardware path first; a real decoder failure still falls\n                 * through to LibVLC.\n                 */\n                val hevc = CodecSpec("hevc", listOf("video/hevc"))\n                return matchingDecoderTypes(hevc).any { (info, type) ->\n                    codecCapabilitiesAccept(info, type, hevc, hints)\n                }\n            }'''
    text = replace_once(text, old, new, f"{path} Dolby Vision profile 7 base layer")
    write(path, text)


def patch_video_player():
    path = "src/components/mg/VideoPlayer.jsx"
    text = read(path)

    text = replace_once(
        text,
        "  detectLanguagePreference,\n  getPlaybackDeviceProfile,",
        "  detectLanguagePreference,\n  detectStreamTraits,\n  getPlaybackDeviceProfile,",
        "VideoPlayer detectStreamTraits import",
    )

    if "const activeRecoveryTraits =" not in text:
        anchor = '''    const obeySelectorOrder =\n      sourceSortMode !== "best" && !liveFailover;\n\n    const candidates = sources'''
        insertion = '''    const obeySelectorOrder =\n      sourceSortMode !== "best" && !liveFailover;\n\n    const activeRecoveryTraits = detectStreamTraits(\n      active,\n      sourceDisplayLabel(active, fromIndex)\n    );\n    const activeRecoveryResolution = Number(\n      activeRecoveryTraits?.resolution || 0\n    );\n    const activeRecoveryDolbyVision =\n      activeRecoveryTraits?.dolbyVision === true;\n\n    const qualityRecoveryRank = (traits) => {\n      const resolution = Number(traits?.resolution || 0);\n      if (activeRecoveryResolution <= 0) return 0;\n      if (resolution === activeRecoveryResolution) return 0;\n      if (resolution > 0 && resolution < activeRecoveryResolution) {\n        return activeRecoveryResolution - resolution;\n      }\n      if (resolution > activeRecoveryResolution) {\n        return 10000 + resolution - activeRecoveryResolution;\n      }\n      return 20000;\n    };\n\n    const hdrRecoveryRank = (traits) => {\n      if (\n        !activeRecoveryDolbyVision ||\n        activeRecoveryResolution < 2000 ||\n        Number(traits?.resolution || 0) !== activeRecoveryResolution\n      ) {\n        return 0;\n      }\n\n      if (traits?.dolbyVision !== true && traits?.hdr === true) return 0;\n      if (traits?.dolbyVision !== true) return 1;\n      return 2;\n    };\n\n    const candidates = sources'''
        text = replace_once(text, anchor, insertion, "VideoPlayer quality-preserving recovery helpers")

        return_anchor = '''        return {\n          index,\n          selectorRank:'''
        return_new = '''        const candidateTraits = detectStreamTraits(\n          candidate,\n          sourceDisplayLabel(candidate, index)\n        );\n\n        return {\n          index,\n          qualityRank: qualityRecoveryRank(candidateTraits),\n          hdrRescueRank: hdrRecoveryRank(candidateTraits),\n          selectorRank:'''
        text = replace_once(text, return_anchor, return_new, "VideoPlayer recovery candidate traits")

        sort_anchor = '''        return obeySelectorOrder\n          ? a.selectorRank - b.selectorRank ||'''
        sort_new = '''        if (a.qualityRank !== b.qualityRank) {\n          return a.qualityRank - b.qualityRank;\n        }\n\n        if (a.hdrRescueRank !== b.hdrRescueRank) {\n          return a.hdrRescueRank - b.hdrRescueRank;\n        }\n\n        return obeySelectorOrder\n          ? a.selectorRank - b.selectorRank ||'''
        text = replace_once(text, sort_anchor, sort_new, "VideoPlayer recovery quality ordering")

    if "__MG_NATIVE_PLAYBACK_DIAGNOSTICS__" not in text:
        detail_anchor = '''      const detail = event?.detail || {};\n      const activeRequest = nativePlaybackRef.current;'''
        detail_new = '''      const detail = event?.detail || {};\n\n      if (detail?.diagnostics) {\n        try {\n          const history = Array.isArray(window.__MG_NATIVE_PLAYBACK_DIAGNOSTICS__)\n            ? window.__MG_NATIVE_PLAYBACK_DIAGNOSTICS__\n            : [];\n          const entry = {\n            ...detail.diagnostics,\n            requestId: String(detail.requestId || ""),\n            reason: String(detail.reason || ""),\n          };\n          const nextHistory = [...history.slice(-49), entry];\n          window.__MG_NATIVE_PLAYBACK_DIAGNOSTICS__ = nextHistory;\n          window.localStorage.setItem(\n            "mg:native-playback-diagnostics:v1",\n            JSON.stringify(nextHistory)\n          );\n          window.dispatchEvent(\n            new CustomEvent("mg:native-playback-diagnostic", { detail: entry })\n          );\n          console.info("[Media God native playback]", entry);\n        } catch {\n          // Diagnostics must never interrupt playback.\n        }\n      }\n\n      const activeRequest = nativePlaybackRef.current;'''
        text = replace_once(text, detail_anchor, detail_new, "VideoPlayer native diagnostics history")

        error_anchor = '''      if (reason === "error") {\n        if (positionSeconds > 5) {'''
        error_new = '''      if (reason === "error") {\n        recordPlaybackReliability(\n          sourceDisplayLabel(active, activeIdx),\n          "failure"\n        );\n\n        if (positionSeconds > 5) {'''
        text = replace_once(text, error_anchor, error_new, "VideoPlayer native error learning")

        ended_anchor = '''      if (\n        reason === "ended" &&\n        !isLive\n      ) {\n        const playerContext ='''
        ended_new = '''      if (\n        reason === "ended" &&\n        !isLive\n      ) {\n        recordPlaybackReliability(\n          sourceDisplayLabel(active, activeIdx),\n          "good"\n        );\n\n        const playerContext ='''
        text = replace_once(text, ended_anchor, ended_new, "VideoPlayer native success learning")

    write(path, text)


def patch_playback_reliability():
    path = "src/components/mg/playbackReliability.js"
    text = read(path)

    if "const androidModel" not in text:
        fire_anchor = '''const fireTvModel = () => {\n  if (typeof navigator === "undefined") return "";\n  return String(navigator.userAgent || "").match(/\\b(AFT[A-Z0-9]+)\\b/i)?.[1]?.toUpperCase() || "";\n};\n'''
        addition = fire_anchor + '''\nconst androidModel = () => {\n  if (typeof navigator === "undefined") return "";\n\n  const userAgent = String(navigator.userAgent || "");\n  const match = userAgent.match(\n    /\\bAndroid\\b[^;)]*;\\s*([^;)]+?)(?:\\s+Build\\/|;|\\))/i\n  );\n\n  return String(match?.[1] || "")\n    .replace(/\\bwv\\b/gi, "")\n    .replace(/\\s+/g, " ")\n    .trim()\n    .toLowerCase()\n    .replace(/[^a-z0-9._-]+/g, "-")\n    .replace(/^-+|-+$/g, "")\n    .slice(0, 80);\n};\n'''
        text = replace_once(text, fire_anchor, addition, "playbackReliability Android model")

        key_anchor = '''  if (profile?.fireTv || profile?.isFireTv) {\n    return `fire-tv:${fireTvModel() || "generic"}`;\n  }\n\n  return "browser";'''
        key_new = '''  if (profile?.fireTv || profile?.isFireTv) {\n    return `fire-tv:${fireTvModel() || "generic"}`;\n  }\n\n  if (profile?.nativeAndroidMobile || profile?.mobileApp) {\n    return `android-mobile:${androidModel() || "generic"}`;\n  }\n\n  return "browser";'''
        text = replace_once(text, key_anchor, key_new, "playbackReliability mobile device key")

        trait_anchor = '''  if (traits.container) keys.push(`${prefix}:container:${traits.container}`);\n  if (traits.resolution) keys.push(`${prefix}:resolution:${traits.resolution}`);\n\n  return keys;'''
        trait_new = '''  if (traits.container) keys.push(`${prefix}:container:${traits.container}`);\n  if (traits.resolution) keys.push(`${prefix}:resolution:${traits.resolution}`);\n  if (traits.dolbyVision) keys.push(`${prefix}:hdr:dolby-vision`);\n  else if (traits.hdr) keys.push(`${prefix}:hdr:hdr`);\n  if (traits.atmos) keys.push(`${prefix}:audio:atmos`);\n  if (/\\b(?:10[ -]?bit|main[ ._-]?10|p010)\\b/i.test(traits.text || "")) {\n    keys.push(`${prefix}:bitdepth:10`);\n  }\n\n  return keys;'''
        text = replace_once(text, trait_anchor, trait_new, "playbackReliability HDR/device traits")

    write(path, text)


def patch_media_compatibility():
    path = "src/components/mg/mediaCompatibility.js"
    text = read(path)

    text = text.replace(
        "if (!deviceProfile?.nativeFireTv || !codec) return null;",
        "if (!deviceProfile?.nativePlayerAvailable || !codec) return null;",
    )
    text = text.replace(
        '''  const nativeCodecSupport =\n    nativeFireTv\n      ? nativeFireTvCodecInfo() || { video: [], audio: [] }\n      : { video: [], audio: [] };''',
        '''  const nativeCodecSupport =\n    nativePlayerAvailable\n      ? nativeFireTvCodecInfo() || { video: [], audio: [] }\n      : { video: [], audio: [] };''',
    )
    text = text.replace(
        "return deviceProfile?.nativeFireTv ? null : false;",
        "return deviceProfile?.nativePlayerAvailable ? null : false;",
    )

    if "if (!deviceProfile?.nativePlayerAvailable || !codec)" not in text:
        raise SystemExit("mediaCompatibility native Android codec support was not applied")
    if "nativePlayerAvailable\n      ? nativeFireTvCodecInfo()" not in text:
        raise SystemExit("mediaCompatibility native codec registry was not applied")

    write(path, text)


def patch_versions_and_metadata():
    fire_gradle = "firetv-android/app/build.gradle.kts"
    text = read(fire_gradle)
    text = text.replace("versionCode = 27", "versionCode = 28", 1)
    text = text.replace('versionName = "1.4.22"', 'versionName = "1.4.23"', 1)
    if 'versionName = "1.4.23"' not in text:
        raise SystemExit("Fire TV version bump failed")
    write(fire_gradle, text)

    mobile_gradle = "android-mobile/app/build.gradle.kts"
    text = read(mobile_gradle)
    text = text.replace("versionCode = 12", "versionCode = 13", 1)
    text = text.replace('versionName = "1.0.11"', 'versionName = "1.0.12"', 1)
    if 'versionName = "1.0.12"' not in text:
        raise SystemExit("Android mobile version bump failed")
    write(mobile_gradle, text)

    fire_update_path = ROOT / "public/firetv-update.json"
    fire = json.loads(fire_update_path.read_text())
    fire["versionCode"] = 28
    fire["versionName"] = "1.4.23"
    fire["message"] = (
        "Fire TV 1.4.23 adds the full playback resilience upgrade: quality-preserving 4K failover, "
        "HDR/Dolby Vision base-layer rescue, pre-play stream validation, 23.976/24/25/50/60-style "
        "refresh-rate matching, a selectable LibVLC audio track control, richer native diagnostics, "
        "and device-specific codec/reliability learning."
    )
    fire_update_path.write_text(json.dumps(fire, indent=2) + "\n")

    mobile_update_path = ROOT / "public/android-mobile-update.json"
    mobile = json.loads(mobile_update_path.read_text())
    mobile["versionCode"] = 13
    mobile["versionName"] = "1.0.12"
    mobile["message"] = (
        "Media God Mobile 1.0.12 adds the full playback resilience upgrade: quality-preserving 4K "
        "failover, HDR/Dolby Vision base-layer rescue, pre-play stream validation, display refresh-rate "
        "hints, a selectable LibVLC audio track control, richer native diagnostics, and per-phone/tablet "
        "codec and reliability learning."
    )
    mobile_update_path.write_text(json.dumps(mobile, indent=2) + "\n")


def patch_native_structure_check():
    path = "scripts/native-structure-check.mjs"
    text = read(path)
    text = text.replace('expectedVersion: "1.4.22"', 'expectedVersion: "1.4.23"', 1)
    text = text.replace('expectedVersion: "1.0.11"', 'expectedVersion: "1.0.12"', 1)

    if "NativeStreamPreflight.kt" not in text:
        router_anchor = '''  const compatibilityRouter = requireFile(\n    `${javaRoot}/PlaybackCompatibilityRouter.kt`,\n    `${app.name} codec preflight router`\n  );'''
        helpers = router_anchor + '''\n  const streamPreflight = requireFile(\n    `${javaRoot}/NativeStreamPreflight.kt`,\n    `${app.name} stream preflight`\n  );\n  const playbackDiagnostics = requireFile(\n    `${javaRoot}/NativePlaybackDiagnostics.kt`,\n    `${app.name} playback diagnostics`\n  );\n  const displayRateMatcher = requireFile(\n    `${javaRoot}/DisplayRateMatcher.kt`,\n    `${app.name} display rate matcher`\n  );'''
        text = replace_once(text, router_anchor, helpers, "native structure helper reads")

        check_anchor = '''    [mainActivity.includes("CompatibilityPlayerActivity::class.java"), "direct compatibility player routing"],'''
        check_new = check_anchor + '''\n    [mainActivity.includes("NativeStreamPreflight.checkPayload(payload)"), "pre-play stream validation"],\n    [mainActivity.includes("EXTRA_DIAGNOSTICS"), "native diagnostics result forwarding"],'''
        text = replace_once(text, check_anchor, check_new, "native structure main preflight checks")

        player_anchor = '''    [playerActivity.includes("setEnableDecoderFallback(true)"), "device decoder fallback"],'''
        player_new = player_anchor + '''\n    [playerActivity.includes("setVideoChangeFrameRateStrategy"), "Media3 frame-rate strategy"],\n    [playerActivity.includes("DisplayRateMatcher.apply"), "native display frame-rate matching"],\n    [playerActivity.includes("NativePlaybackDiagnostics.snapshot"), "Media3 diagnostics snapshot"],'''
        text = replace_once(text, player_anchor, player_new, "native structure player resilience checks")

        compat_anchor = '''    [compatibilityActivity.includes('setAudioOutputDevice("stereo")'), "compatibility stereo PCM downmix"],'''
        compat_new = compat_anchor + '''\n    [compatibilityActivity.includes("cycleAudioTrack"), "compatibility audio track selector"],\n    [compatibilityActivity.includes("audioTracks"), "compatibility audio track discovery"],\n    [compatibilityActivity.includes("DisplayRateMatcher.apply"), "compatibility refresh-rate matching"],\n    [compatibilityActivity.includes("NativePlaybackDiagnostics.snapshot"), "compatibility diagnostics snapshot"],'''
        text = replace_once(text, compat_anchor, compat_new, "native structure compatibility controls")

        router_check_anchor = '''    [compatibilityRouter.includes("dolby-vision"), "Dolby Vision profile routing"],'''
        router_check_new = router_check_anchor + '''\n    [compatibilityRouter.includes('CodecSpec("hevc", listOf("video/hevc"))'), "Dolby Vision HEVC base-layer rescue"],'''
        text = replace_once(text, router_check_anchor, router_check_new, "native structure HDR rescue check")

        helper_check_anchor = '''    [compatibilityRouter.includes('payload.optJSONObject("drm")'), "DRM Media3 guard"],'''
        helper_check_new = helper_check_anchor + '''\n    [streamPreflight.includes('setRequestProperty("Range", "bytes=0-1")') && streamPreflight.includes("451"), "resolved stream HTTP preflight"],\n    [playbackDiagnostics.includes("videoCodec") && playbackDiagnostics.includes("audioCodec") && playbackDiagnostics.includes("hdrFormat") && playbackDiagnostics.includes("bitDepth"), "native codec/HDR diagnostics"],\n    [displayRateMatcher.includes("preferredRefreshRate"), "display refresh-rate hint"],'''
        text = replace_once(text, helper_check_anchor, helper_check_new, "native structure helper checks")

        fire_only_anchor = '''      "Fire TV Dolby Vision + HDR10+ MKV workaround",\n    ]);'''
        fire_only_new = '''      "Fire TV Dolby Vision + HDR10+ MKV workaround",\n    ]);\n    checks.push([\n      displayRateMatcher.includes("preferredDisplayModeId"),\n      "Fire TV same-resolution display mode matching",\n    ]);'''
        text = replace_once(text, fire_only_anchor, fire_only_new, "native structure Fire display mode check")

    if 'expectedVersion: "1.4.23"' not in text or 'expectedVersion: "1.0.12"' not in text:
        raise SystemExit("native structure version expectations failed")

    write(path, text)


def patch_ui_regression_check():
    path = "scripts/ui-regression-check.mjs"
    text = read(path)

    if 'const mediaCompatibility = await read("src/components/mg/mediaCompatibility.js")' not in text:
        anchor = 'const videoPlayer = await read("src/components/mg/VideoPlayer.jsx");\n'
        addition = anchor + '''const mediaCompatibility = await read("src/components/mg/mediaCompatibility.js");\nconst playbackReliabilityCore = await read("src/components/mg/playbackReliability.js");\n'''
        text = replace_once(text, anchor, addition, "UI check resilience file reads")

    if "quality-preserving 4K failover" not in text:
        final_log = 'console.log("ok UI/navigation/download/watch-party/locked-source/version-update structural checks complete");'
        tests = '''expect(\n  videoPlayer.includes("const activeRecoveryTraits = detectStreamTraits") &&\n    videoPlayer.includes("qualityRank: qualityRecoveryRank") &&\n    videoPlayer.includes("hdrRescueRank: hdrRecoveryRank"),\n  "quality-preserving 4K failover or HDR rescue ordering is missing"\n);\nexpect(\n  videoPlayer.includes("__MG_NATIVE_PLAYBACK_DIAGNOSTICS__") &&\n    videoPlayer.includes("mg:native-playback-diagnostic"),\n  "native playback diagnostics history is missing"\n);\nexpect(\n  mediaCompatibility.includes("nativePlayerAvailable\\n      ? nativeFireTvCodecInfo()") &&\n    mediaCompatibility.includes("!deviceProfile?.nativePlayerAvailable || !codec"),\n  "phone/tablet native codec registry is not used for compatibility scoring"\n);\nexpect(\n  playbackReliabilityCore.includes("android-mobile:") &&\n    playbackReliabilityCore.includes("hdr:dolby-vision") &&\n    playbackReliabilityCore.includes("bitdepth:10"),\n  "per-device mobile HDR/codec reliability learning is missing"\n);\n\n'''
        text = replace_once(text, final_log, tests + final_log, "UI resilience regression checks")

    write(path, text)


patch_main_activity(
    "firetv-android/app/src/main/java/com/mediagod/firetv/MainActivity.kt",
    "fire-tv",
)
patch_main_activity(
    "android-mobile/app/src/main/java/com/mediagod/mobile/MainActivity.kt",
    "android-mobile",
)
patch_player_activity(
    "firetv-android/app/src/main/java/com/mediagod/firetv/PlayerActivity.kt",
    True,
)
patch_player_activity(
    "android-mobile/app/src/main/java/com/mediagod/mobile/PlayerActivity.kt",
    False,
)
patch_compatibility_activity(
    "firetv-android/app/src/main/java/com/mediagod/firetv/CompatibilityPlayerActivity.kt",
    True,
)
patch_compatibility_activity(
    "android-mobile/app/src/main/java/com/mediagod/mobile/CompatibilityPlayerActivity.kt",
    False,
)
patch_router(
    "firetv-android/app/src/main/java/com/mediagod/firetv/PlaybackCompatibilityRouter.kt"
)
patch_router(
    "android-mobile/app/src/main/java/com/mediagod/mobile/PlaybackCompatibilityRouter.kt"
)
patch_video_player()
patch_playback_reliability()
patch_media_compatibility()
patch_versions_and_metadata()
patch_native_structure_check()
patch_ui_regression_check()

print("playback resilience suite applied")
