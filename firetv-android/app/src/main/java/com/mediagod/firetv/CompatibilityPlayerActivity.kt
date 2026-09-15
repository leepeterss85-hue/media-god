package com.mediagod.firetv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.interfaces.IMedia
import org.videolan.libvlc.util.VLCVideoLayout
import kotlin.math.max

/** Broad-format fallback plus audio/subtitle/HDR recovery controls. */
class CompatibilityPlayerActivity : Activity() {
    companion object { private const val CONTROLS_HIDE_DELAY_MS = 3200L }

    private lateinit var root: FrameLayout
    private lateinit var videoLayout: VLCVideoLayout
    private lateinit var controls: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var playPauseButton: Button
    private lateinit var audioButton: Button
    private lateinit var subtitleButton: Button
    private lateinit var outputButton: Button
    private lateinit var syncButton: Button
    private lateinit var dialogueButton: Button

    private var libVLC: LibVLC? = null
    private var vlcPlayer: MediaPlayer? = null
    private var payload = JSONObject()
    private var requestId = ""
    private var streamUrl = ""
    private var startPositionMs = 0L
    private var pendingStartPositionMs = 0L
    private var resultSent = false
    private var resumeAfterPause = false
    private var selectedSourceIndex = -1

    private var audioOutputMode = "auto"
    private var lipSyncMs = 0
    private var dialogueBoost = "off"
    private var volumeNormalization = false
    private var automaticNoSoundRecovery = true
    private var thermalProtection = true
    private var audioRecoveryPasses = 0

    private val hideControlsRunnable = Runnable {
        if (!resultSent && ::controls.isInitialized) {
            if (controls.hasFocus() && ::videoLayout.isInitialized) videoLayout.requestFocus()
            controls.visibility = View.GONE
            statusText.visibility = View.GONE
        }
    }

    private val audioRecoveryRunnable = object : Runnable {
        override fun run() {
            if (resultSent || !automaticNoSoundRecovery) return
            recoverAudioTrack()
            audioRecoveryPasses += 1
            if (audioRecoveryPasses < 2 && ::root.isInitialized) root.postDelayed(this, 2400L)
        }
    }

    private val thermalRunnable = object : Runnable {
        override fun run() {
            if (resultSent) return
            if (thermalProtection && DevicePerformanceGuard.shouldProtect4k(this@CompatibilityPlayerActivity, payload, streamUrl)) {
                finishWithResult(
                    "error",
                    "This device is under severe heat or memory pressure while decoding 4K. Trying a cooler backup source."
                )
                return
            }
            if (::root.isInitialized) root.postDelayed(this, 12000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        payload = try { JSONObject(intent.getStringExtra(PlayerActivity.EXTRA_PAYLOAD).orEmpty()) } catch (_: Throwable) { JSONObject() }
        requestId = payload.optString("requestId")
        streamUrl = payload.optString("url").trim()
        startPositionMs = max(0L, payload.optLong("startPositionMs", 0L))
        pendingStartPositionMs = startPositionMs
        selectedSourceIndex = payload.optInt("activeSourceIndex", -1)
        audioOutputMode = payload.optString("audioOutputMode", "auto").lowercase().let {
            if (it in setOf("auto", "stereo", "surround", "passthrough")) it else "auto"
        }
        lipSyncMs = payload.optInt("lipSyncMs", 0).coerceIn(-500, 500)
        dialogueBoost = payload.optString("dialogueBoost", "off").lowercase().let {
            if (it in setOf("off", "low", "medium", "high")) it else "off"
        }
        volumeNormalization = payload.optBoolean("volumeNormalization", false)
        automaticNoSoundRecovery = payload.optBoolean("automaticNoSoundRecovery", true)
        thermalProtection = payload.optBoolean("thermalProtection", true)

        if (!isPlayableUrl(streamUrl)) {
            finishWithResult("error", "Compatibility player received an invalid stream URL.")
            return
        }

        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN)
        enterImmersiveMode()
        DisplayRateMatcher.apply(this, payload, streamUrl, forceDisplayMode = true)
        buildUi()
        startCompatibilityPlayback()
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
        if (resumeAfterPause && !resultSent) {
            resumeAfterPause = false
            vlcPlayer?.play()
        }
    }

    override fun onPause() {
        val activePlayer = vlcPlayer
        resumeAfterPause = activePlayer?.isPlaying == true
        if (resumeAfterPause) activePlayer?.pause()
        startPositionMs = max(0L, activePlayer?.time ?: startPositionMs)
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) showControlsTemporarily()
        return super.dispatchTouchEvent(event)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && !event.isLongPress) {
            if (::controls.isInitialized && controls.hasFocus() && event.keyCode in setOf(
                    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
                    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER
                )) {
                showControlsTemporarily()
                return super.dispatchKeyEvent(event)
            }
            if (event.keyCode == KeyEvent.KEYCODE_DPAD_UP || event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                showControlsTemporarily()
                if (::audioButton.isInitialized) audioButton.requestFocus()
                return true
            }
            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> { finishWithResult("back"); return true }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> { togglePlayback(); return true }
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> { seekBy(-10_000L); return true }
                KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> { seekBy(10_000L); return true }
                KeyEvent.KEYCODE_MEDIA_PLAY -> { vlcPlayer?.play(); updatePlayPauseLabel(); showControlsTemporarily(); return true }
                KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> { vlcPlayer?.pause(); updatePlayPauseLabel(); showControlsTemporarily(); return true }
                KeyEvent.KEYCODE_MENU -> { showPlaybackInfo(); return true }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        if (::root.isInitialized) {
            root.removeCallbacks(hideControlsRunnable)
            root.removeCallbacks(audioRecoveryRunnable)
            root.removeCallbacks(thermalRunnable)
        }
        DisplayRateMatcher.clear(this)
        releaseCompatibilityPlayer()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun buildUi() {
        videoLayout = VLCVideoLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
        }
        statusText = TextView(this).apply {
            text = "Compatibility decoder"
            setTextColor(Color.WHITE)
            textSize = 13f
            setBackgroundColor(Color.argb(190, 0, 0, 0))
            setPadding(dp(12), dp(7), dp(12), dp(7))
            maxWidth = dp(760)
        }

        val backButton = controlButton("Back") { finishWithResult("back") }
        val rewindButton = controlButton("−10s") { seekBy(-10_000L) }
        playPauseButton = controlButton("Pause") { togglePlayback() }
        val forwardButton = controlButton("+10s") { seekBy(10_000L) }
        audioButton = controlButton("Audio") { cycleAudioTrack() }
        subtitleButton = controlButton("Subs") { cycleSubtitleTrack() }
        outputButton = controlButton("Output") { cycleAudioOutputMode() }
        syncButton = controlButton("Sync") { cycleLipSync() }
        dialogueButton = controlButton("Dialogue") { cycleDialogueBoost() }
        val infoButton = controlButton("Info") { showPlaybackInfo() }

        val firstRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(backButton); addView(rewindButton); addView(playPauseButton); addView(forwardButton)
        }
        val secondRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(audioButton); addView(subtitleButton); addView(outputButton); addView(syncButton); addView(dialogueButton); addView(infoButton)
        }
        controls = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(7), dp(8), dp(7))
            setBackgroundColor(Color.argb(210, 8, 8, 8))
            addView(firstRow); addView(secondRow)
        }

        root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(videoLayout, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            addView(statusText, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.START; topMargin = dp(18); marginStart = dp(18)
            })
            addView(controls, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL; bottomMargin = dp(18)
            })
        }
        setContentView(root)
        videoLayout.requestFocus()
        updateControlLabels()
        showControlsTemporarily()
    }

    private fun controlButton(label: String, action: () -> Unit): Button = Button(this).apply {
        text = label
        setTextColor(Color.WHITE)
        setBackgroundColor(Color.argb(215, 35, 35, 35))
        isFocusable = true
        minWidth = dp(76)
        minHeight = dp(44)
        setPadding(dp(10), dp(6), dp(10), dp(6))
        setOnClickListener { action(); showControlsTemporarily() }
    }

    private fun startCompatibilityPlayback() {
        try {
            val options = arrayListOf(
                "--network-caching=1800", "--file-caching=1200", "--live-caching=1800", "--clock-jitter=0"
            )
            if (volumeNormalization) {
                options.add("--audio-replay-gain-mode=track")
                options.add("--audio-replay-gain-preamp=0.0")
            }
            val engine = LibVLC(this, options)
            libVLC = engine
            val player = MediaPlayer(engine)
            vlcPlayer = player
            configureAudioOutput(player)
            player.attachViews(videoLayout, null, true, false)

            player.setEventListener { event ->
                root.post {
                    if (resultSent) return@post
                    when (event.type) {
                        MediaPlayer.Event.Opening -> showStatus("Compatibility decoder · opening")
                        MediaPlayer.Event.Buffering -> showStatus("Compatibility decoder · buffering")
                        MediaPlayer.Event.Playing -> {
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            showStatus("Compatibility decoder")
                            try { player.setVolume(100); player.setAudioDelay(lipSyncMs.toLong() * 1000L) } catch (_: Throwable) {}
                            applyPreferredSubtitle()
                            recoverAudioTrack()
                            if (pendingStartPositionMs > 0L) {
                                val target = pendingStartPositionMs; pendingStartPositionMs = 0L; player.time = target
                            }
                            audioRecoveryPasses = 0
                            root.removeCallbacks(audioRecoveryRunnable)
                            if (automaticNoSoundRecovery) root.postDelayed(audioRecoveryRunnable, 1000L)
                            root.removeCallbacks(thermalRunnable)
                            if (thermalProtection) root.postDelayed(thermalRunnable, 9000L)
                            updateControlLabels(); updatePlayPauseLabel(); showControlsTemporarily()
                        }
                        MediaPlayer.Event.Paused -> { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); updatePlayPauseLabel(); showControlsTemporarily() }
                        MediaPlayer.Event.EndReached -> finishWithResult("ended")
                        MediaPlayer.Event.EncounteredError -> finishWithResult("error", "The compatibility decoder could not play this source.")
                    }
                }
            }

            val media = Media(engine, Uri.parse(streamUrl)).apply {
                setHWDecoderEnabled(true, false)
                addOption(":network-caching=1800")
                addOption(":file-caching=1200")
                addOption(":live-caching=1800")
                if (dialogueBoost != "off") {
                    addOption(":audio-filter=equalizer")
                    val bands = when (dialogueBoost) {
                        "high" -> "-1 -1 0 2 5 6 5 2 0 -1"
                        "medium" -> "-1 -1 0 1.5 3.5 4.5 3.5 1.5 0 -1"
                        else -> "0 0 0 1 2 2.5 2 1 0 0"
                    }
                    addOption(":equalizer-bands=$bands")
                    addOption(":equalizer-preamp=-2.0")
                }
                val headers = currentHeaders()
                headerValue(headers, "User-Agent")?.let { addOption(":http-user-agent=$it") }
                headerValue(headers, "Referer")?.let { addOption(":http-referrer=$it") }
                addExternalSubtitles(this, payload.optJSONArray("subtitles") ?: JSONArray())
            }
            player.media = media
            media.release()
            player.play()
        } catch (error: Throwable) {
            finishWithResult("error", error.message ?: "Could not start the compatibility decoder.")
        }
    }

    private fun riskyAudio(): Boolean = Regex(
        """(?:true[ ._-]?hd|mlp|dts(?:[ ._-]?hd)?|dts:x|dca)""", RegexOption.IGNORE_CASE
    ).containsMatchIn("${payload.optString("audioCodec")} ${payload.optString("hintText")}")

    private fun configureAudioOutput(player: MediaPlayer) {
        try {
            player.setAudioOutput("android_audiotrack")
            when (audioOutputMode) {
                "passthrough" -> player.setAudioDigitalOutputEnabled(true)
                "stereo" -> { player.setAudioDigitalOutputEnabled(false); player.setAudioOutputDevice("stereo") }
                "surround" -> player.setAudioDigitalOutputEnabled(false)
                else -> {
                    player.setAudioDigitalOutputEnabled(false)
                    if (riskyAudio()) player.setAudioOutputDevice("stereo")
                }
            }
            player.setVolume(100)
        } catch (_: Throwable) {}
    }

    private fun recoverAudioTrack() {
        val player = vlcPlayer ?: return
        try {
            player.setVolume(100)
            configureAudioOutput(player)
            val tracks = player.audioTracks?.filter { it.id >= 0 }.orEmpty()
            if (tracks.isEmpty()) return
            val preferred = payload.optString("audioLanguage", "en").lowercase()
            fun score(name: String): Int {
                val text = name.lowercase(); var value = 0
                if (preferred == "en" && Regex("""\b(?:eng|english)\b""").containsMatchIn(text)) value += 100
                else if (preferred.isNotBlank() && text.contains(preferred)) value += 80
                if (Regex("""commentary|audio description|descriptive""").containsMatchIn(text)) value -= 100
                if (Regex("""aac|ac-?3|e-?ac-?3|opus|flac""").containsMatchIn(text)) value += 12
                if (Regex("""truehd|dts|mlp""").containsMatchIn(text) && audioOutputMode == "auto") value -= 8
                return value
            }
            val best = tracks.maxByOrNull { score(it.name.orEmpty()) } ?: tracks.first()
            val current = tracks.firstOrNull { it.id == player.audioTrack }
            if (current == null || score(best.name.orEmpty()) > score(current.name.orEmpty()) + 5) player.setAudioTrack(best.id)
            if (player.audioTrack < 0) player.setAudioTrack(best.id)
        } catch (_: Throwable) {}
        updateAudioButtonLabel()
    }

    private fun currentHeaders(): Map<String, String> {
        val result = linkedMapOf<String, String>()
        fun collect(json: JSONObject?) {
            if (json == null) return
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next(); val value = json.optString(key).trim()
                if (key.isNotBlank() && value.isNotBlank()) result[key] = value
            }
        }
        collect(payload.optJSONObject("headers"))
        val sources = payload.optJSONArray("sources") ?: JSONArray()
        for (index in 0 until sources.length()) {
            val item = sources.optJSONObject(index) ?: continue
            if (item.optString("url").trim() == streamUrl) {
                collect(item.optJSONObject("headers")); selectedSourceIndex = item.optInt("webIndex", selectedSourceIndex)
                break
            }
        }
        return result
    }

    private fun headerValue(headers: Map<String, String>, name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value?.takeIf { it.isNotBlank() }

    private fun addExternalSubtitles(media: Media, subtitles: JSONArray) {
        for (index in 0 until minOf(subtitles.length(), 20)) {
            val item = subtitles.optJSONObject(index) ?: continue
            val url = item.optString("url").trim()
            if (!isPlayableUrl(url)) continue
            try { media.addSlave(IMedia.Slave(IMedia.Slave.Type.Subtitle, 4, Uri.parse(url).toString())) } catch (_: Throwable) {}
        }
    }

    private fun cycleAudioTrack() {
        val player = vlcPlayer ?: return
        val tracks = try { player.audioTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        if (tracks.isEmpty()) { showStatus("Audio · no selectable track"); return }
        val currentIndex = tracks.indexOfFirst { it.id == player.audioTrack }
        val next = tracks[(currentIndex + 1).mod(tracks.size)]
        try { player.setAudioTrack(next.id); player.setVolume(100); showStatus("Audio · ${next.name?.trim().orEmpty().ifBlank { "Track ${next.id}" }}") }
        catch (_: Throwable) { showStatus("Audio · could not switch track") }
        updateAudioButtonLabel()
    }

    private fun cycleSubtitleTrack() {
        val player = vlcPlayer ?: return
        val tracks = try { player.spuTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        if (tracks.isEmpty()) { showStatus("Subtitles · no selectable track"); return }
        val current = player.spuTrack
        if (current < 0) {
            val preferred = preferredSubtitle(tracks) ?: tracks.first()
            try { player.setSpuTrack(preferred.id); showStatus("Subtitles · ${preferred.name?.trim().orEmpty().ifBlank { "Track ${preferred.id}" }}") } catch (_: Throwable) {}
        } else {
            val index = tracks.indexOfFirst { it.id == current }
            if (index < 0 || index == tracks.lastIndex) {
                try { player.setSpuTrack(-1); showStatus("Subtitles · Off") } catch (_: Throwable) {}
            } else {
                val next = tracks[index + 1]
                try { player.setSpuTrack(next.id); showStatus("Subtitles · ${next.name?.trim().orEmpty().ifBlank { "Track ${next.id}" }}") } catch (_: Throwable) {}
            }
        }
        updateSubtitleButtonLabel()
    }

    private fun preferredSubtitle(tracks: List<MediaPlayer.TrackDescription>): MediaPlayer.TrackDescription? {
        val wanted = payload.optString("subtitleLanguage", "en").lowercase()
        return tracks.firstOrNull { track ->
            val text = track.name.orEmpty().lowercase()
            (wanted == "en" && Regex("""\b(?:eng|english)\b""").containsMatchIn(text)) ||
                (wanted.isNotBlank() && text.contains(wanted))
        }
    }

    private fun applyPreferredSubtitle() {
        val player = vlcPlayer ?: return
        if (!payload.optBoolean("subtitlesEnabled", true)) {
            try { player.setSpuTrack(-1) } catch (_: Throwable) {}
            updateSubtitleButtonLabel(); return
        }
        val tracks = try { player.spuTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        val preferred = preferredSubtitle(tracks) ?: return
        try { if (player.spuTrack < 0) player.setSpuTrack(preferred.id) } catch (_: Throwable) {}
        updateSubtitleButtonLabel()
    }

    private fun cycleAudioOutputMode() {
        val modes = listOf("auto", "stereo", "surround", "passthrough")
        val next = modes[(modes.indexOf(audioOutputMode).coerceAtLeast(0) + 1) % modes.size]
        audioOutputMode = next
        payload.put("audioOutputMode", next)
        restartAtCurrentPosition("Audio output · ${outputLabel()}")
    }

    private fun cycleLipSync() {
        val values = listOf(0, 50, 100, 150, 200, 300, 500, -500, -300, -200, -150, -100, -50)
        lipSyncMs = values[(values.indexOf(lipSyncMs).coerceAtLeast(0) + 1) % values.size]
        payload.put("lipSyncMs", lipSyncMs)
        try { vlcPlayer?.setAudioDelay(lipSyncMs.toLong() * 1000L) } catch (_: Throwable) {}
        showStatus("Lip sync · ${if (lipSyncMs > 0) "+" else ""}${lipSyncMs} ms")
        updateControlLabels()
    }

    private fun cycleDialogueBoost() {
        val modes = listOf("off", "low", "medium", "high")
        dialogueBoost = modes[(modes.indexOf(dialogueBoost).coerceAtLeast(0) + 1) % modes.size]
        payload.put("dialogueBoost", dialogueBoost)
        restartAtCurrentPosition("Dialogue boost · ${dialogueBoost.replaceFirstChar { it.uppercase() }}")
    }

    private fun restartAtCurrentPosition(message: String) {
        val position = max(0L, vlcPlayer?.time ?: startPositionMs)
        pendingStartPositionMs = position
        startPositionMs = position
        root.removeCallbacks(audioRecoveryRunnable)
        root.removeCallbacks(thermalRunnable)
        releaseCompatibilityPlayer()
        showStatus(message)
        updateControlLabels()
        startCompatibilityPlayback()
    }

    private fun outputLabel(): String = when (audioOutputMode) {
        "stereo" -> "Stereo PCM"; "surround" -> "Surround PCM"; "passthrough" -> "Passthrough"; else -> "Auto"
    }

    private fun updateControlLabels() {
        if (::outputButton.isInitialized) outputButton.text = "Output · ${outputLabel()}"
        if (::syncButton.isInitialized) syncButton.text = "Sync · ${if (lipSyncMs > 0) "+" else ""}${lipSyncMs}ms"
        if (::dialogueButton.isInitialized) dialogueButton.text = "Dialogue · ${dialogueBoost.replaceFirstChar { it.uppercase() }}"
        updateAudioButtonLabel(); updateSubtitleButtonLabel()
    }

    private fun updateAudioButtonLabel() {
        if (!::audioButton.isInitialized) return
        val player = vlcPlayer
        val tracks = try { player?.audioTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        if (tracks.isEmpty()) { audioButton.text = "Audio"; return }
        val current = tracks.firstOrNull { it.id == player?.audioTrack } ?: tracks.first()
        val name = current.name?.trim().orEmpty()
        audioButton.text = if (tracks.size > 1 && name.isNotBlank()) "Audio · $name" else if (tracks.size > 1) "Audio · ${tracks.indexOf(current)+1}/${tracks.size}" else "Audio"
    }

    private fun updateSubtitleButtonLabel() {
        if (!::subtitleButton.isInitialized) return
        val player = vlcPlayer
        val tracks = try { player?.spuTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        val current = tracks.firstOrNull { it.id == player?.spuTrack }
        subtitleButton.text = if (current != null) "Subs · ${current.name?.trim().orEmpty().ifBlank { "On" }}" else "Subs · Off"
    }

    private fun showPlaybackInfo() {
        val player = vlcPlayer
        val source = NativePlaybackDiagnostics.snapshot(
            payload, streamUrl, "libvlc", "info", extra = JSONObject().apply {
                put("selectedAudioTrack", player?.audioTrack ?: -1)
                put("selectedSubtitleTrack", player?.spuTrack ?: -1)
                put("audioOutputMode", audioOutputMode)
                put("lipSyncMs", lipSyncMs)
                put("dialogueBoost", dialogueBoost)
            }, context = this
        )
        val resolution = if (source.optInt("width") > 0 && source.optInt("height") > 0) "${source.optInt("width")}×${source.optInt("height")}" else "unknown resolution"
        showStatus(
            "Playback info\n${source.optString("engine")} · $resolution · ${source.optString("fps")}fps\n" +
                "Video: ${source.optString("videoCodec").ifBlank { "unknown" }} ${source.optString("hdrFormat")}\n" +
                "Audio: ${source.optString("audioCodec").ifBlank { "unknown" }} · ${outputLabel()} · sync ${lipSyncMs}ms\n" +
                "Container: ${source.optString("container").ifBlank { source.optString("mimeType") }} · ${source.optJSONObject("devicePerformance")?.optString("thermalStatusName") ?: "normal"}"
        )
    }

    private fun showStatus(message: String) {
        if (!::statusText.isInitialized) return
        statusText.text = message
        statusText.visibility = View.VISIBLE
    }

    private fun togglePlayback() {
        val player = vlcPlayer ?: return
        if (player.isPlaying) player.pause() else player.play()
        updatePlayPauseLabel(); showControlsTemporarily()
    }

    private fun updatePlayPauseLabel() {
        if (::playPauseButton.isInitialized) playPauseButton.text = if (vlcPlayer?.isPlaying == true) "Pause" else "Play"
    }

    private fun seekBy(deltaMs: Long) {
        val player = vlcPlayer ?: return
        val length = player.length.takeIf { it > 0L } ?: Long.MAX_VALUE
        player.time = (player.time + deltaMs).coerceAtLeast(0L).coerceAtMost(length)
        showControlsTemporarily()
    }

    private fun showControlsTemporarily() {
        if (!::controls.isInitialized || !::root.isInitialized || resultSent) return
        root.removeCallbacks(hideControlsRunnable)
        controls.visibility = View.VISIBLE
        statusText.visibility = View.VISIBLE
        root.postDelayed(hideControlsRunnable, CONTROLS_HIDE_DELAY_MS)
    }

    private fun releaseCompatibilityPlayer() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        vlcPlayer?.let { player ->
            try { player.stop() } catch (_: Throwable) {}
            try { player.detachViews() } catch (_: Throwable) {}
            try { player.release() } catch (_: Throwable) {}
        }
        vlcPlayer = null
        try { libVLC?.release() } catch (_: Throwable) {}
        libVLC = null
    }

    private fun finishWithResult(reason: String, message: String = "") {
        if (resultSent) return
        resultSent = true
        if (::root.isInitialized) {
            root.removeCallbacks(audioRecoveryRunnable); root.removeCallbacks(thermalRunnable)
        }
        val player = vlcPlayer
        val positionMs = max(0L, player?.time ?: startPositionMs)
        val durationMs = max(0L, player?.length?.takeIf { it > 0L } ?: 0L)
        val extra = JSONObject().apply {
            try {
                val audioId = player?.audioTrack ?: -1
                put("selectedAudioTrack", audioId)
                put("selectedAudioName", player?.audioTracks?.firstOrNull { it.id == audioId }?.name?.trim().orEmpty())
                put("selectedSubtitleTrack", player?.spuTrack ?: -1)
                put("selectedSubtitleName", player?.spuTracks?.firstOrNull { it.id == (player?.spuTrack ?: -1) }?.name?.trim().orEmpty())
            } catch (_: Throwable) {}
            put("audioOutputMode", audioOutputMode); put("lipSyncMs", lipSyncMs); put("dialogueBoost", dialogueBoost)
        }
        val diagnostics = NativePlaybackDiagnostics.snapshot(payload, streamUrl, "libvlc", reason, message, extra, this).toString()
        val result = Intent().apply {
            putExtra(PlayerActivity.EXTRA_REQUEST_ID, requestId)
            putExtra(PlayerActivity.EXTRA_REASON, reason)
            putExtra(PlayerActivity.EXTRA_POSITION_MS, positionMs)
            putExtra(PlayerActivity.EXTRA_DURATION_MS, durationMs)
            putExtra(PlayerActivity.EXTRA_MESSAGE, message)
            putExtra(PlayerActivity.EXTRA_DIAGNOSTICS, diagnostics)
            putExtra(PlayerActivity.EXTRA_SELECTED_SOURCE_INDEX, selectedSourceIndex)
        }
        setResult(RESULT_OK, result)
        releaseCompatibilityPlayer()
        finish()
    }

    private fun isPlayableUrl(url: String): Boolean {
        val lower = url.lowercase()
        return lower.startsWith("https://") || lower.startsWith("http://") || lower.startsWith("rtsp://") || lower.startsWith("rtmp://")
    }

    private fun enterImmersiveMode() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
}
