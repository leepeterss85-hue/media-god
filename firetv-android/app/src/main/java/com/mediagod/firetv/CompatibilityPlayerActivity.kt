package com.mediagod.firetv

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
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
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
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
    companion object {
        private const val CONTROLS_HIDE_DELAY_MS = 3200L
        private const val STATUS_HIDE_DELAY_MS = 1800L
        private const val PROGRESS_UPDATE_MS = 500L
        private const val STARTUP_TIMEOUT_MS = 10000L
    }

    private lateinit var root: FrameLayout
    private lateinit var videoLayout: VLCVideoLayout
    private lateinit var controls: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var playPauseButton: Button
    private lateinit var audioButton: Button
    private lateinit var subtitleButton: Button
    private lateinit var progressBar: SeekBar
    private lateinit var timeText: TextView
    private lateinit var outputButton: Button
    private lateinit var syncButton: Button
    private lateinit var dialogueButton: Button
    private lateinit var episodeActions: LinearLayout
    private lateinit var skipRecapButton: Button
    private lateinit var skipIntroButton: Button
    private lateinit var skipCreditsButton: Button
    private lateinit var nextEpisodeButton: Button
    private lateinit var cancelNextButton: Button
    private var nextEpisodeCountdownStartedAtMs = -1L
    private var nextEpisodeCountdownCancelled = false
    private var contextReceiverRegistered = false

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
    private var automaticNoSoundRecovery = false
    private var thermalProtection = true
    private var audioRecoveryPasses = 0
    private var manualAudioTrackLocked = false
    private var noAudioCheckGeneration = 0
    private var manualAudioTrackId = -1
    private var compatibilityRetryPass = 0
    private var forceSoftwareVideoDecode = false
    private var compatibilityPlaybackStarted = false
    private var videoStartupReadiness = VideoStartupReadiness(requireVideoOutput = true)
    private var compatibilityErrorProbePending = false
    private var userSeeking = false

    private val startupTimeoutRunnable = Runnable {
        if (
            resultSent ||
            compatibilityPlaybackStarted
        ) {
            return@Runnable
        }

        val player = vlcPlayer

        if (
            compatibilityRetryPass < 1 &&
            player != null
        ) {
            compatibilityRetryPass += 1
            forceSoftwareVideoDecode = true
            pendingStartPositionMs =
                max(
                    0L,
                    player.time.takeIf { it > 0L }
                        ?: startPositionMs
                )
            startPositionMs = pendingStartPositionMs
            root.removeCallbacks(audioRecoveryRunnable)
            root.removeCallbacks(thermalRunnable)
            releaseCompatibilityPlayer()
            showStatus(
                "Compatibility decoder · retrying this same source in software mode"
            )
            root.postDelayed(
                { startCompatibilityPlayback() },
                150L
            )
            return@Runnable
        }

        finishWithResult(
            "error",
            if (requiresStrictEnglishAudio())
                "Strict English playback could not start this source in the compatibility decoder."
            else
                "The compatibility decoder could not start this source."
        )
    }

    private fun armStartupTimeout() {
        if (!::root.isInitialized) return
        compatibilityPlaybackStarted = false
        root.removeCallbacks(startupTimeoutRunnable)
        root.postDelayed(
            startupTimeoutRunnable,
            STARTUP_TIMEOUT_MS
        )
    }

    private fun clearStartupTimeout() {
        if (::root.isInitialized) {
            root.removeCallbacks(startupTimeoutRunnable)
        }
    }

    private fun failOrRetryCompatibilityPlayer(player: MediaPlayer) {
        if (resultSent || vlcPlayer !== player) {
            return
        }

        if (compatibilityRetryPass < 1) {
            compatibilityRetryPass += 1
            forceSoftwareVideoDecode = true
            val resumeAt =
                max(
                    0L,
                    player.time.takeIf { it > 0L }
                        ?: startPositionMs
                )
            pendingStartPositionMs = resumeAt
            startPositionMs = resumeAt
            root.removeCallbacks(audioRecoveryRunnable)
            root.removeCallbacks(thermalRunnable)
            releaseCompatibilityPlayer()
            showStatus(
                "Compatibility decoder · retrying this same source in software mode"
            )
            root.postDelayed(
                { startCompatibilityPlayback() },
                150L
            )
            return
        }

        val recoveryText =
            payload.optString("compatibilityReason") + " " +
                payload.optString("compatibilityError")
        val audioRecovery =
            payload.optBoolean("compatibilityAudioRecovery", false) ||
                Regex(
                    """audio (?:decoder|renderer|sink|track)|no usable audio|no[- ]?sound|silent""",
                    RegexOption.IGNORE_CASE
                ).containsMatchIn(recoveryText)

        finishWithResult(
            "error",
            if (audioRecovery)
                "The compatibility audio decoder could not recover this source."
            else
                "The compatibility decoder could not play this source."
        )
    }

    private fun confirmCompatibilityError(player: MediaPlayer) {
        if (
            resultSent ||
            vlcPlayer !== player ||
            compatibilityErrorProbePending
        ) {
            return
        }

        /*
         * LibVLC can emit EncounteredError transiently on progressive/hosted
         * streams even while decoded playback keeps advancing. Once this source
         * has actually started, progress is stronger evidence than that event.
         * Give the same player a short confirmation window and only fail/retry
         * if its timeline really stops.
         */
        if (!compatibilityPlaybackStarted) {
            failOrRetryCompatibilityPlayer(player)
            return
        }

        compatibilityErrorProbePending = true
        val observedAt = max(0L, player.time)
        showStatus("Compatibility decoder · checking stream")

        root.postDelayed({
            compatibilityErrorProbePending = false

            if (
                resultSent ||
                vlcPlayer !== player
            ) {
                return@postDelayed
            }

            val currentTime = max(0L, player.time)
            val stillProgressing =
                currentTime > observedAt + 250L

            if (stillProgressing) {
                showStatus("Compatibility decoder")
                return@postDelayed
            }

            failOrRetryCompatibilityPlayer(player)
        }, 1400L)
    }

    private fun wantsPreferredEnglishAudio(): Boolean =
        payload.optString("audioLanguage", "en")
            .trim()
            .lowercase() in setOf("en", "eng", "english")

    private fun hasVerifiedEnglishMainAudio(): Boolean =
        payload.optBoolean("verifiedEnglishMain", false)

    // Episode source selection can require verified English. A deliberate
    // choice in the Audio menu always takes precedence over that startup gate.
    private fun requiresStrictEnglishAudio(): Boolean = NativeEpisodePolicy.requiresEnglish(
        isTvEpisode(), payload.optBoolean("strictEnglishPlayback", false), manualAudioTrackLocked
    )

    private fun confirmCompatibilityStartup(player: MediaPlayer) {
        if (resultSent || vlcPlayer !== player) return
        val tracks = try { player.audioTracks?.filter { it.id >= 0 }.orEmpty() }
            catch (_: Throwable) { emptyList() }
        val englishReady = !requiresStrictEnglishAudio() || selectedAudioIsVerifiedEnglish(player, tracks)
        try { player.setVolume(if (englishReady) 100 else 0) } catch (_: Throwable) {}
        if (englishReady && videoStartupReadiness.isReady() && !compatibilityPlaybackStarted) {
            compatibilityPlaybackStarted = true
            clearStartupTimeout()
            showControlsTemporarily()
        }
    }

    private fun isTvEpisode(): Boolean = NativeEpisodePolicy.isEpisode(
        payload.optBoolean("live", false), payload.optString("mediaType"),
        payload.optInt("season", 0), payload.optInt("episode", 0)
    )

    private val playbackContextReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != "$packageName.UPDATE_PLAYBACK_CONTEXT" || resultSent ||
                requestId.isBlank() || intent.getStringExtra("requestId") != requestId || !isTvEpisode()) return
            val updated = try { JSONObject(intent.getStringExtra("payload").orEmpty()) }
                catch (_: Throwable) { return }
            if (!NativeEpisodePolicy.sameEpisode(
                    payload.optLong("tmdbId", 0L), payload.optInt("season", 0), payload.optInt("episode", 0),
                    updated.optLong("tmdbId", 0L), updated.optInt("season", 0), updated.optInt("episode", 0)
                )) return
            val oldCredits = payload.optDouble("creditsStart", -1.0)
            for (key in arrayOf("recapStart", "recapEnd", "introStart", "introEnd", "creditsStart", "creditsEnd",
                    "autoNext", "nextEpisodeAvailable", "nextSeason", "nextEpisode", "nextEpisodeName")) {
                if (updated.has(key)) payload.put(key, updated.get(key))
            }
            if (oldCredits != payload.optDouble("creditsStart", -1.0)) nextEpisodeCountdownStartedAtMs = -1L
            updateEpisodeActions()
        }
    }

    private var lastReportedEpisodeDurationMs = 0L
    private var lastEpisodeDurationReportAtMs = 0L

    private fun reportEpisodeDuration(positionMs: Long, durationMs: Long) {
        if (!isTvEpisode() || resultSent || requestId.isBlank() || durationMs <= 0L) return
        val tmdbId = payload.optLong("tmdbId", 0L)
        val season = payload.optInt("season", 0)
        val episode = payload.optInt("episode", 0)
        if (tmdbId <= 0L || season <= 0 || episode <= 0) return
        val now = android.os.SystemClock.elapsedRealtime()
        if (!NativeEpisodePolicy.shouldReportDuration(durationMs, lastReportedEpisodeDurationMs,
                now - lastEpisodeDurationReportAtMs)) return
        lastReportedEpisodeDurationMs = durationMs
        lastEpisodeDurationReportAtMs = now
        // Only public episode identity and decoder timing cross back to the
        // paused WebView for release-specific markers. No stream URL or headers.
        sendBroadcast(Intent("$packageName.NATIVE_PLAYBACK_PROGRESS").apply {
            setPackage(packageName)
            putExtra("requestId", requestId)
            putExtra("positionMs", positionMs.coerceAtLeast(0L))
            putExtra("durationMs", durationMs)
            putExtra("tmdbId", tmdbId)
            putExtra("season", season)
            putExtra("episode", episode)
        })
    }

    private fun registerPlaybackContextReceiver() {
        ContextCompat.registerReceiver(this, playbackContextReceiver,
            IntentFilter("$packageName.UPDATE_PLAYBACK_CONTEXT"), ContextCompat.RECEIVER_NOT_EXPORTED)
        contextReceiverRegistered = true
    }

    private fun normaliseAudioTrackName(value: String): String =
        value.lowercase().replace(Regex("""[^a-z0-9]+"""), " ").trim()

    private fun audioTrackNameLooksCommentary(value: String): Boolean =
        Regex(
            """commentary|audio description|descriptive|visually impaired|director(?:'s)? commentary|cast commentary""",
            RegexOption.IGNORE_CASE
        ).containsMatchIn(value)

    private fun audioTrackNameLooksEnglish(value: String): Boolean =
        !audioTrackNameLooksCommentary(value) &&
            Regex(
                """(?:^|[\s._\-\[\]()])(?:en|eng|english)(?=$|[\s._\-\[\]()])""",
                RegexOption.IGNORE_CASE
            ).containsMatchIn(value)

    private fun namesMatchExpectedAudio(actual: String, expected: String): Boolean {
        val left = normaliseAudioTrackName(actual)
        val right = normaliseAudioTrackName(expected)
        if (left.length < 3 || right.length < 3) return false
        return left == right || left.contains(right) || right.contains(left)
    }

    private fun selectedAudioIsVerifiedEnglish(
        player: MediaPlayer,
        tracks: List<MediaPlayer.TrackDescription>
    ): Boolean {
        val selected = tracks.firstOrNull { it.id == player.audioTrack }
            ?: return false
        val expectedName =
            payload.optString("preferredAudioTrackName").trim()
        val expectedMatches =
            if (expectedName.isBlank()) {
                emptyList()
            } else {
                tracks.filter {
                    namesMatchExpectedAudio(
                        it.name.orEmpty(),
                        expectedName
                    )
                }
            }

        return audioTrackNameLooksEnglish(selected.name.orEmpty()) ||
            (
                hasVerifiedEnglishMainAudio() &&
                    !audioTrackNameLooksCommentary(selected.name.orEmpty()) &&
                    expectedMatches.size == 1 && expectedMatches.first().id == selected.id
            )
    }

    private fun preferEnglishMainAudio(player: MediaPlayer) {
        if (!requiresStrictEnglishAudio()) return
        val tracks = try {
            player.audioTracks?.filter { it.id >= 0 }.orEmpty()
        } catch (_: Throwable) { emptyList() }
        val english = tracks.filter { audioTrackNameLooksEnglish(it.name.orEmpty()) }
        val expected = payload.optString("preferredAudioTrackName").trim()
        val matchingHint = if (payload.optBoolean("verifiedEnglishMain", false) && expected.isNotBlank()) {
            tracks.filter { namesMatchExpectedAudio(it.name.orEmpty(), expected) &&
                !audioTrackNameLooksCommentary(it.name.orEmpty()) }
        } else emptyList()
        val wanted = matchingHint.singleOrNull() ?: english.firstOrNull() ?: return
        if (player.audioTrack != wanted.id) player.setAudioTrack(wanted.id)
    }

    private val hideControlsRunnable = Runnable {
        if (!resultSent && ::controls.isInitialized) {
            if (controls.hasFocus() && ::videoLayout.isInitialized) videoLayout.requestFocus()
            controls.visibility = View.GONE
            updateEpisodeActions()
        }
    }

    private val hideStatusRunnable = Runnable {
        if (!resultSent && ::statusText.isInitialized) {
            statusText.visibility = View.GONE
        }
    }

    private val progressRunnable = object : Runnable {
        override fun run() {
            if (resultSent || !::root.isInitialized) return
            vlcPlayer?.let { player ->
                if (!compatibilityPlaybackStarted) {
                    preferEnglishMainAudio(player)
                    confirmCompatibilityStartup(player)
                }
            }
            updateProgressUi()
            root.postDelayed(this, PROGRESS_UPDATE_MS)
        }
    }

    /*
     * No automatic recovery cycles after startup. Requested TV English startup
     * can select a verified main track; later choices belong to the Audio menu.
     */
    private val audioRecoveryRunnable = Runnable { }

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
        manualAudioTrackLocked = payload.optBoolean("manualAudioTrackLocked", false)
        nextEpisodeCountdownCancelled = payload.optBoolean("autoNextCancelled", false)
        streamUrl = payload.optString("url").trim()
        startPositionMs = max(0L, payload.optLong("startPositionMs", 0L))
        pendingStartPositionMs = startPositionMs
        selectedSourceIndex = payload.optInt("activeSourceIndex", -1)
        // Media3 audio without a video frame requires video decoder rescue,
        // not another hardware-decoder pass on the same black surface.
        forceSoftwareVideoDecode =
            !payload.optBoolean("live", false) &&
            payload.optBoolean("forceSoftwareVideoDecode", false)
        audioOutputMode = payload.optString("audioOutputMode", "auto").lowercase().let {
            if (it in setOf("auto", "stereo", "surround", "passthrough")) it else "auto"
        }
        lipSyncMs = payload.optInt("lipSyncMs", 0).coerceIn(-500, 500)
        dialogueBoost = payload.optString("dialogueBoost", "off").lowercase().let {
            if (it in setOf("off", "low", "medium", "high")) it else "off"
        }
        volumeNormalization = payload.optBoolean("volumeNormalization", false)
        automaticNoSoundRecovery = false
        thermalProtection = payload.optBoolean("thermalProtection", true)

        if (!isPlayableUrl(streamUrl)) {
            finishWithResult("error", "Compatibility player received an invalid stream URL.")
            return
        }

        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN)
        enterImmersiveMode()
        if (payload.optBoolean("live", false)) {
            DisplayRateMatcher.apply(this, payload, streamUrl, forceDisplayMode = true)
        } else {
            // Prevent HDMI mode changes during software decoder recovery.
            DisplayRateMatcher.clear(this)
        }
        buildUi()
        registerPlaybackContextReceiver()
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
        nextEpisodeCountdownStartedAtMs = -1L
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
            if (((::controls.isInitialized && controls.hasFocus()) ||
                    (::episodeActions.isInitialized && episodeActions.hasFocus())) && event.keyCode in setOf(
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
        if (contextReceiverRegistered) {
            unregisterReceiver(playbackContextReceiver)
            contextReceiverRegistered = false
        }
        if (::root.isInitialized) {
            root.removeCallbacks(hideControlsRunnable)
            root.removeCallbacks(hideStatusRunnable)
            root.removeCallbacks(progressRunnable)
            root.removeCallbacks(audioRecoveryRunnable)
            root.removeCallbacks(thermalRunnable)
        }
        DisplayRateMatcher.clear(this)
        releaseCompatibilityPlayer()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun roundedBackground(
        color: Int,
        radiusDp: Int = 12
    ): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radiusDp).toFloat()
        }

    private fun buildUi() {
        videoLayout = VLCVideoLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
        }

        /*
         * User-facing status only. Decoder names, codec details and track
         * diagnostics stay out of the normal player surface.
         */
        statusText = TextView(this).apply {
            text = ""
            visibility = View.GONE
            setTextColor(Color.WHITE)
            textSize = 13f
            gravity = Gravity.CENTER
            background = roundedBackground(Color.argb(190, 0, 0, 0), 14)
            setPadding(dp(14), dp(8), dp(14), dp(8))
            maxWidth = dp(520)
        }

        val backButton = controlButton("← Back") { finishWithResult("back") }
        val reportButton = controlButton("Report") { showPlaybackReport() }
        val sourcesButton = controlButton("Sources") { showSourceMenu() }
        val rewindButton = controlButton("−10s") { seekBy(-10_000L) }
        playPauseButton = controlButton("Pause") { togglePlayback() }
        val forwardButton = controlButton("+10s") { seekBy(10_000L) }
        audioButton = controlButton("Audio") { showAudioTrackMenu() }
        subtitleButton = controlButton("CC") { showSubtitleTrackMenu() }
        val moreButton = controlButton("Options") { showAdvancedControlsMenu() }
        rewindButton.contentDescription = "Rewind 10 seconds"
        forwardButton.contentDescription = "Forward 10 seconds"

        val titleText = TextView(this).apply {
            text =
                payload.optString("title").trim()
                    .ifBlank { "Media God" }
            setTextColor(Color.WHITE)
            textSize = 17f
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), 0, dp(8), 0)
        }

        progressBar = SeekBar(this).apply {
            max = 1000
            progress = 0
            isFocusable = true
            setPadding(dp(6), 0, dp(6), 0)
            progressTintList = android.content.res.ColorStateList.valueOf(Color.rgb(229, 9, 20))
            thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            setOnSeekBarChangeListener(
                object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(
                        seekBar: SeekBar?,
                        progress: Int,
                        fromUser: Boolean
                    ) {
                        if (!fromUser) return
                        val length = vlcPlayer?.length?.takeIf { it > 0L } ?: return
                        val target = (length * progress.toLong()) / 1000L
                        timeText.text =
                            "${formatPlaybackTime(target)} / ${formatPlaybackTime(length)}"
                    }

                    override fun onStartTrackingTouch(seekBar: SeekBar?) {
                        userSeeking = true
                        root.removeCallbacks(hideControlsRunnable)
                    }

                    override fun onStopTrackingTouch(seekBar: SeekBar?) {
                        val player = vlcPlayer
                        val length = player?.length?.takeIf { it > 0L }
                        if (player != null && length != null) {
                            val selectedProgress =
                                seekBar?.progress ?: progressBar.progress
                            player.time =
                                (length * selectedProgress.toLong()) / 1000L
                        }
                        userSeeking = false
                        updateProgressUi()
                        showControlsTemporarily()
                    }
                }
            )
        }

        timeText = TextView(this).apply {
            text = "0:00 / 0:00"
            setTextColor(Color.argb(220, 255, 255, 255))
            textSize = 12f
            gravity = Gravity.CENTER_VERTICAL or Gravity.END
            setPadding(dp(8), 0, dp(2), 0)
        }

        fun addWeighted(
            row: LinearLayout,
            view: View,
            weight: Float = 1f
        ) {
            row.addView(
                view,
                LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    weight
                ).apply {
                    marginStart = dp(3)
                    marginEnd = dp(3)
                }
            )
        }

        val progressRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(
                progressBar,
                LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f
                )
            )
            addView(
                timeText,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
        }

        val titleRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(
                backButton,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dp(4)
                }
            )
            addView(
                titleText,
                LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f
                )
            )
            addView(sourcesButton, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dp(6) })
        }

        val transportRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addWeighted(this, rewindButton)
            addWeighted(this, playPauseButton, 1.25f)
            addWeighted(this, forwardButton)
        }

        val optionsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addWeighted(this, audioButton)
            addWeighted(this, subtitleButton)
            addWeighted(this, moreButton)
            addWeighted(this, reportButton)
        }

        controls = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(12), dp(12), dp(14))
            background = GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(Color.argb(245, 0, 0, 0), Color.argb(218, 0, 0, 0), Color.TRANSPARENT)
            )
            addView(titleRow)
            addView(progressRow)
            addView(transportRow)
            addView(optionsRow)
        }

        root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(
                videoLayout,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            addView(
                statusText,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                    topMargin = dp(18)
                }
            )
            addView(
                controls,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.BOTTOM
                    leftMargin = dp(4)
                    rightMargin = dp(4)
                    bottomMargin = dp(4)
                }
            )
        }

        buildEpisodeActions()
        setContentView(root)
        videoLayout.requestFocus()
        updateControlLabels()
        updateProgressUi()
        showControlsTemporarily()
    }

    private fun episodeMarkerMs(key: String): Long {
        val seconds = payload.optDouble(key, -1.0)
        return if (seconds.isFinite() && seconds >= 0.0 && seconds < Long.MAX_VALUE / 1000.0)
            (seconds * 1000.0).toLong() else -1L
    }

    private fun nextEpisodeConfirmed(): Boolean = NativeEpisodePolicy.hasConfirmedNext(
        if (payload.has("nextEpisodeAvailable") && !payload.isNull("nextEpisodeAvailable"))
            payload.optBoolean("nextEpisodeAvailable", false) else null,
        payload.optInt("nextSeason", 0), payload.optInt("nextEpisode", 0)
    )

    private fun buildEpisodeActions() {
        skipRecapButton = controlButton("Skip recap") { skipEpisodeSegment("recapEnd") }
        skipIntroButton = controlButton("Skip intro") { skipEpisodeSegment("introEnd") }
        skipCreditsButton = controlButton("Skip credits") { skipEpisodeSegment("creditsEnd", useDuration = true) }
        nextEpisodeButton = controlButton("Next episode") { finishWithResult("next") }
        cancelNextButton = controlButton("Stay here") {
            nextEpisodeCountdownCancelled = true
            nextEpisodeCountdownStartedAtMs = -1L
            updateEpisodeActions()
        }
        episodeActions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(4), dp(4), dp(4))
            visibility = View.GONE
            for (button in arrayOf(skipRecapButton, skipIntroButton, skipCreditsButton,
                    nextEpisodeButton, cancelNextButton)) {
                addView(button, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = dp(6) })
            }
        }
        root.addView(episodeActions, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            rightMargin = dp(14)
            bottomMargin = dp(20)
        })
        root.post { updateEpisodeActions() }
    }

    private fun skipEpisodeSegment(endKey: String, useDuration: Boolean = false) {
        val player = vlcPlayer ?: return
        val duration = player.length
        val position = max(0L, player.time)
        if (!isTvEpisode() || duration <= 750L) return
        val markerEnd = episodeMarkerMs(endKey)
        val inWindow = if (useDuration)
            NativeEpisodePolicy.creditsWindow(position, duration, episodeMarkerMs("creditsStart"))
        else NativeEpisodePolicy.segmentWindow(position, duration,
            episodeMarkerMs(endKey.removeSuffix("End") + "Start"), markerEnd)
        if (!inWindow) return
        val end = if (useDuration && markerEnd <= 0L) duration else markerEnd
        if (end <= 0L || end > duration) return
        val target = (end + 250L).coerceAtMost(duration - 750L)
        if (target <= position) return
        player.time = target
        nextEpisodeCountdownStartedAtMs = -1L
        updateProgressUi()
    }

    private fun updateEpisodeActions() {
        if (!::episodeActions.isInitialized || resultSent) return
        if (!isTvEpisode()) {
            episodeActions.visibility = View.GONE
            nextEpisodeCountdownStartedAtMs = -1L
            return
        }
        val player = vlcPlayer
        val position = max(0L, player?.time ?: 0L)
        val duration = max(0L, player?.length ?: 0L)
        reportEpisodeDuration(position, duration)
        val recap = NativeEpisodePolicy.segmentWindow(position, duration,
            episodeMarkerMs("recapStart"), episodeMarkerMs("recapEnd"))
        val intro = !recap && NativeEpisodePolicy.segmentWindow(position, duration,
            episodeMarkerMs("introStart"), episodeMarkerMs("introEnd"))
        val creditsStart = episodeMarkerMs("creditsStart")
        val credits = NativeEpisodePolicy.creditsWindow(position, duration, creditsStart)
        val nextConfirmed = nextEpisodeConfirmed()
        val countdown = NativeEpisodePolicy.countdownEligible(true,
            payload.optBoolean("autoNext", true), nextConfirmed, position, duration, creditsStart) &&
            player?.isPlaying == true && !userSeeking && !nextEpisodeCountdownCancelled
        if (countdown) {
            if (nextEpisodeCountdownStartedAtMs < 0L)
                nextEpisodeCountdownStartedAtMs = android.os.SystemClock.elapsedRealtime()
            val remaining = 10_000L - (android.os.SystemClock.elapsedRealtime() - nextEpisodeCountdownStartedAtMs)
            if (remaining <= 0L) {
                nextEpisodeCountdownStartedAtMs = -1L
                finishWithResult("next")
                return
            }
            nextEpisodeButton.text = "Next episode in ${(remaining + 999L) / 1000L}s"
            controls.visibility = View.VISIBLE
        } else {
            nextEpisodeCountdownStartedAtMs = -1L
            nextEpisodeButton.text = "Next episode"
        }
        skipRecapButton.visibility = if (recap) View.VISIBLE else View.GONE
        skipIntroButton.visibility = if (intro) View.VISIBLE else View.GONE
        skipCreditsButton.visibility = if (credits && !nextConfirmed) View.VISIBLE else View.GONE
        nextEpisodeButton.visibility = if (nextConfirmed &&
            (credits || controls.visibility == View.VISIBLE) && !recap && !intro) View.VISIBLE else View.GONE
        cancelNextButton.visibility = if (countdown) View.VISIBLE else View.GONE
        val showActions = arrayOf(skipRecapButton, skipIntroButton, skipCreditsButton,
            nextEpisodeButton, cancelNextButton).any { it.visibility == View.VISIBLE }
        episodeActions.visibility = if (showActions) View.VISIBLE else View.GONE
        val layout = episodeActions.layoutParams as FrameLayout.LayoutParams
        val bottom = if (controls.visibility == View.VISIBLE) controls.height.coerceAtLeast(dp(190)) + dp(10) else dp(20)
        if (layout.bottomMargin != bottom) {
            layout.bottomMargin = bottom
            episodeActions.layoutParams = layout
        }
    }

    private fun controlButton(
        label: String,
        action: () -> Unit
    ): Button =
        Button(this).apply {
            text = label
            isAllCaps = false
            val primary = label == "Pause" || label == "Play"
            val sourceAction = label == "Sources"
            textSize = if (primary) 16f else 13f
            setTextColor(if (primary) Color.BLACK else Color.WHITE)
            isFocusable = true
            isFocusableInTouchMode = true
            minimumWidth = 0
            minWidth = 0
            minimumHeight = dp(48)
            minHeight = dp(48)
            stateListAnimator = null
            setPadding(dp(9), dp(4), dp(9), dp(4))
            val normalFill = when {
                primary -> Color.WHITE
                sourceAction -> Color.rgb(190, 18, 29)
                else -> Color.argb(180, 32, 32, 32)
            }
            background = roundedBackground(normalFill, 12)
            setOnFocusChangeListener { _, focused ->
                setTextColor(if (focused) Color.WHITE else if (primary) Color.BLACK else Color.WHITE)
                background =
                    roundedBackground(
                        if (focused)
                            Color.rgb(190, 18, 29)
                        else
                            normalFill,
                        12
                    )
            }
            setOnClickListener {
                action()
                showControlsTemporarily()
            }
        }

    private fun startCompatibilityPlayback() {
        try {
            val options = arrayListOf(
                "--network-caching=1800",
                "--file-caching=1200",
                "--live-caching=1800",
                "--clock-jitter=0"
            )
            if (!payload.optBoolean("live", false) && wantsPreferredEnglishAudio()) {
                options.add("--audio-language=eng,en")
            }
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
            videoStartupReadiness = VideoStartupReadiness(
                requireVideoOutput = !payload.optBoolean("live", false)
            )

            player.setEventListener { event ->
                root.post {
                    if (resultSent || vlcPlayer !== player) return@post
                    when (event.type) {
                        MediaPlayer.Event.Opening -> showStatus("Compatibility decoder · opening")
                        MediaPlayer.Event.Buffering -> showStatus("Compatibility decoder · buffering")
                        MediaPlayer.Event.Vout -> {
                            videoStartupReadiness.onVideoOutput(event.voutCount)
                            confirmCompatibilityStartup(player)
                        }
                        MediaPlayer.Event.Playing -> {
                            videoStartupReadiness.onPlaying()
                            preferEnglishMainAudio(player)
                            confirmCompatibilityStartup(player)
                            root.postDelayed({
                                if (!resultSent && vlcPlayer === player && player.isPlaying) {
                                    preferEnglishMainAudio(player)
                                    confirmCompatibilityStartup(player)
                                }
                            }, 900L)
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            showStatus("Compatibility decoder")
                            try {
                                player.setAudioDelay(lipSyncMs.toLong() * 1000L)
                            } catch (_: Throwable) {}
                            applyPreferredSubtitle()
                            if (pendingStartPositionMs > 0L) {
                                val target = pendingStartPositionMs; pendingStartPositionMs = 0L; player.time = target
                            }
                            root.removeCallbacks(thermalRunnable)
                            if (thermalProtection) root.postDelayed(thermalRunnable, 9000L)
                            updateControlLabels()
                            updatePlayPauseLabel()
                            root.removeCallbacks(progressRunnable)
                            root.post(progressRunnable)
                            showControlsTemporarily()
                            if (!payload.optBoolean("live", false)) {
                                val generation = ++noAudioCheckGeneration
                                root.postDelayed({
                                    if (generation != noAudioCheckGeneration || resultSent ||
                                        vlcPlayer !== player || !player.isPlaying || player.time < 5000L
                                    ) return@postDelayed

                                    preferEnglishMainAudio(player)
                                    val tracks = try {
                                        player.audioTracks?.filter { it.id >= 0 }.orEmpty()
                                    } catch (_: Throwable) { emptyList() }

                                    if (tracks.isNotEmpty() && player.audioTrack < 0 && !manualAudioTrackLocked) {
                                        val wanted = tracks.firstOrNull {
                                            audioTrackNameLooksEnglish(it.name.orEmpty())
                                        } ?: tracks.first()
                                        if (player.setAudioTrack(wanted.id)) return@postDelayed
                                    }
                                    if (tracks.isNotEmpty() && player.audioTrack < 0 && !manualAudioTrackLocked) {
                                        finishWithResult("error", "This release has no usable audio track in the compatibility decoder.")
                                    }
                                }, 10000L)
                            }
                        }
                        MediaPlayer.Event.Paused -> { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); updatePlayPauseLabel(); showControlsTemporarily() }
                        MediaPlayer.Event.EndReached -> finishWithResult("ended")
                        MediaPlayer.Event.EncounteredError -> {
                            confirmCompatibilityError(player)
                        }
                    }
                }
            }

            val media = Media(engine, Uri.parse(streamUrl)).apply {
                setHWDecoderEnabled(!forceSoftwareVideoDecode, false)
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

            // Keep an unverified TV track inaudible while tracks become available.
            // Films, live streams and explicit Audio menu choices keep normal playback.
            player.setVolume(if (requiresStrictEnglishAudio()) 0 else 100)
            armStartupTimeout()
            player.play()
        } catch (error: Throwable) {
            finishWithResult("error", error.message ?: "Could not start the compatibility decoder.")
        }
    }

    private fun riskyAudio(): Boolean = Regex(
        """(?:true[ ._-]?hd|mlp|dts(?:[ ._-]?(?:hd|ma|x))?|dca|e[ ._-]?ac[ ._-]?3[ ._-]?joc|eac3[ ._-]?joc|atmos)""", RegexOption.IGNORE_CASE
    ).containsMatchIn("${payload.optString("audioCodec")} ${payload.optString("hintText")}")

    private fun configureAudioOutput(player: MediaPlayer) {
        try {
            player.setAudioOutput("android_audiotrack")

            /*
             * Live TV is deliberately left on its existing device-first audio
             * behavior. The explicit PCM/stereo routing below is VOD-only.
             */
            if (payload.optBoolean("live", false)) {
                when (audioOutputMode) {
                    "passthrough" -> player.setAudioDigitalOutputEnabled(true)
                    "stereo", "surround" -> player.setAudioDigitalOutputEnabled(false)
                    else -> player.setAudioDigitalOutputEnabled(false)
                }
                player.setVolume(100)
                return
            }

            when (audioOutputMode) {
                "passthrough" -> {
                    player.setAudioOutputDevice("encoded")
                }
                "surround" -> {
                    player.setAudioDigitalOutputEnabled(false)
                    player.setAudioOutputDevice("pcm")
                }
                "stereo" -> {
                    player.setAudioDigitalOutputEnabled(false)
                    player.setAudioOutputDevice("stereo")
                }
                else -> {
                    /*
                     * Reliability default for VOD: force LibVLC's documented
                     * stereo AudioTrack endpoint. This makes LibVLC decode and
                     * downmix Dolby/multichannel audio to ordinary PCM instead
                     * of relying on a device HDMI/passthrough route that may
                     * advertise support while producing silence.
                     */
                    player.setAudioDigitalOutputEnabled(false)
                    player.setAudioOutputDevice("stereo")
                }
            }
            player.setVolume(100)
        } catch (_: Throwable) {}
    }

    /*
     * Automatic cycling across selected audio tracks remains disabled. A
     * missing selection can be initialized once; later choices belong to Audio.
     */
    private fun recoverAudioTrack() = Unit

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
        val sources = payload.optJSONArray("sourceChoices")?.takeIf { it.length() > 0 }
            ?: payload.optJSONArray("sources") ?: JSONArray()
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
        val tracks = try {
            player.audioTracks?.filter { it.id >= 0 }.orEmpty()
        } catch (_: Throwable) {
            emptyList()
        }

        if (tracks.isEmpty()) {
            showStatus("Audio · no selectable track")
            return
        }

        fun looksEnglish(name: String): Boolean =
            Regex(
                """(?:^|[\s._\-\[\]()])(?:en|eng|english)(?=$|[\s._\-\[\]()])""",
                RegexOption.IGNORE_CASE
            ).containsMatchIn(name)

        fun looksCommentary(name: String): Boolean =
            Regex(
                """commentary|audio description|descriptive|visually impaired""",
                RegexOption.IGNORE_CASE
            ).containsMatchIn(name)

        val currentIndex = tracks.indexOfFirst { it.id == player.audioTrack }
        val current = tracks.getOrNull(currentIndex)

        /*
         * The first press is useful rather than blind cycling: if playback is
         * currently foreign and an English main track exists, jump straight to
         * English. Further presses can still cycle every track deliberately.
         */
        val englishMainTracks = tracks.filter {
            looksEnglish(it.name.orEmpty()) &&
                !looksCommentary(it.name.orEmpty())
        }

        /*
         * "Audio" is an audio-track control, not a source-recovery control.
         * If this file contains English main audio, keep the user inside the
         * English tracks. This prevents repeated button presses from wrapping
         * back to the foreign default and triggering another rescue/cache pass.
         */
        val next =
            if (englishMainTracks.isNotEmpty()) {
                val englishCurrentIndex =
                    englishMainTracks.indexOfFirst { it.id == player.audioTrack }

                if (englishCurrentIndex < 0) {
                    englishMainTracks.first()
                } else {
                    englishMainTracks[
                        (englishCurrentIndex + 1).mod(englishMainTracks.size)
                    ]
                }
            } else {
                tracks[(currentIndex + 1).mod(tracks.size)]
            }

        try {
            if (player.setAudioTrack(next.id)) {
                manualAudioTrackLocked = true
                manualAudioTrackId = next.id
                root.removeCallbacks(audioRecoveryRunnable)
                player.setVolume(100)
                showStatus(
                    "Audio locked · ${next.name?.trim().orEmpty().ifBlank { "Track ${next.id}" }}"
                )
            } else {
                showStatus("Audio · could not switch track")
            }
        } catch (_: Throwable) {
            showStatus("Audio · could not switch track")
        }

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
        if (!payload.optBoolean("subtitlesEnabled", false)) {
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

    private fun formatPlaybackTime(valueMs: Long): String {
        val totalSeconds = max(0L, valueMs) / 1000L
        val hours = totalSeconds / 3600L
        val minutes = (totalSeconds % 3600L) / 60L
        val seconds = totalSeconds % 60L

        return if (hours > 0L)
            String.format("%d:%02d:%02d", hours, minutes, seconds)
        else
            String.format("%d:%02d", minutes, seconds)
    }

    private fun updateProgressUi() {
        if (!::progressBar.isInitialized || !::timeText.isInitialized || userSeeking) {
            return
        }

        val player = vlcPlayer
        val position = max(0L, player?.time ?: 0L)
        val duration = max(0L, player?.length ?: 0L)

        progressBar.isEnabled = duration > 0L
        progressBar.progress =
            if (duration > 0L)
                ((position.coerceAtMost(duration) * 1000L) / duration)
                    .toInt()
                    .coerceIn(0, 1000)
            else
                0

        timeText.text =
            "${formatPlaybackTime(position)} / ${formatPlaybackTime(duration)}"
        updateEpisodeActions()
    }

    private fun showAudioTrackMenu() {
        val player = vlcPlayer ?: return
        val tracks =
            try {
                player.audioTracks?.filter { it.id >= 0 }.orEmpty()
            } catch (_: Throwable) {
                emptyList()
            }

        if (tracks.isEmpty()) {
            showStatus("No selectable audio tracks")
            return
        }

        val labels =
            tracks.mapIndexed { index, track ->
                track.name?.trim().orEmpty().ifBlank { "Track ${index + 1}" }
            }.toTypedArray()
        val checked =
            tracks.indexOfFirst { it.id == player.audioTrack }
                .coerceAtLeast(0)

        root.removeCallbacks(hideControlsRunnable)

        AlertDialog.Builder(this)
            .setTitle("Audio")
            .setSingleChoiceItems(labels, checked) { dialog, which ->
                val selected = tracks.getOrNull(which) ?: return@setSingleChoiceItems

                if (player.setAudioTrack(selected.id)) {
                    manualAudioTrackLocked = true
                    manualAudioTrackId = selected.id
                    confirmCompatibilityStartup(player)
                    root.removeCallbacks(audioRecoveryRunnable)
                    updateAudioButtonLabel()
                    showStatus(
                        "Audio: " +
                            selected.name?.trim().orEmpty()
                                .ifBlank { "Track ${which + 1}" }
                    )
                } else {
                    showStatus("Could not switch audio track")
                }

                dialog.dismiss()
                showControlsTemporarily()
            }
            .setNegativeButton("Cancel", null)
            .setOnDismissListener { showControlsTemporarily() }
            .show()
    }

    private fun showSubtitleTrackMenu() {
        val player = vlcPlayer ?: return
        val tracks =
            try {
                player.spuTracks?.filter { it.id >= 0 }.orEmpty()
            } catch (_: Throwable) {
                emptyList()
            }

        val labels =
            listOf("Off") +
                tracks.mapIndexed { index, track ->
                    track.name?.trim().orEmpty().ifBlank { "Subtitle ${index + 1}" }
                }
        val selectedTrack =
            tracks.indexOfFirst { it.id == player.spuTrack }
        val checked =
            if (selectedTrack >= 0) selectedTrack + 1 else 0

        root.removeCallbacks(hideControlsRunnable)

        AlertDialog.Builder(this)
            .setTitle("Subtitles")
            .setSingleChoiceItems(labels.toTypedArray(), checked) { dialog, which ->
                try {
                    if (which == 0) {
                        player.setSpuTrack(-1)
                        showStatus("Subtitles off")
                    } else {
                        val selected = tracks[which - 1]
                        player.setSpuTrack(selected.id)
                        showStatus(
                            "Subtitles: " +
                                selected.name?.trim().orEmpty()
                                    .ifBlank { "On" }
                        )
                    }
                } catch (_: Throwable) {
                    showStatus("Could not change subtitles")
                }

                updateSubtitleButtonLabel()
                dialog.dismiss()
                showControlsTemporarily()
            }
            .setNegativeButton("Cancel", null)
            .setOnDismissListener { showControlsTemporarily() }
            .show()
    }

    private fun showAdvancedControlsMenu() {
        val items =
            arrayOf(
                "Audio output · ${outputLabel()}",
                "Lip sync · ${if (lipSyncMs > 0) "+" else ""}${lipSyncMs}ms",
                "Dialogue · ${dialogueBoost.replaceFirstChar { it.uppercase() }}",
                "Playback info"
            )

        root.removeCallbacks(hideControlsRunnable)

        AlertDialog.Builder(this)
            .setTitle("More")
            .setItems(items) { dialog, which ->
                when (which) {
                    0 -> cycleAudioOutputMode()
                    1 -> cycleLipSync()
                    2 -> cycleDialogueBoost()
                    3 -> showPlaybackInfo()
                }

                dialog.dismiss()
                showControlsTemporarily()
            }
            .setNegativeButton("Cancel", null)
            .setOnDismissListener { showControlsTemporarily() }
            .show()
    }

    private fun outputLabel(): String = when (audioOutputMode) {
        "stereo" -> "Compatibility PCM"; "surround" -> "Surround PCM"; "passthrough" -> "Passthrough"; else -> "Auto"
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
        val tracks =
            try {
                player?.audioTracks?.filter { it.id >= 0 }.orEmpty()
            } catch (_: Throwable) {
                emptyList()
            }
        val current =
            tracks.firstOrNull { it.id == player?.audioTrack }
        val name =
            current?.name?.trim().orEmpty()

        audioButton.text = "Audio"
        audioButton.contentDescription =
            if (name.isNotBlank())
                "Audio, $name"
            else
                "Audio"
    }

    private fun updateSubtitleButtonLabel() {
        if (!::subtitleButton.isInitialized) return
        val player = vlcPlayer
        val tracks =
            try {
                player?.spuTracks?.filter { it.id >= 0 }.orEmpty()
            } catch (_: Throwable) {
                emptyList()
            }
        val current =
            tracks.firstOrNull { it.id == player?.spuTrack }

        subtitleButton.text =
            if (current != null) "CC On" else "CC"
        subtitleButton.contentDescription =
            if (current != null)
                "Subtitles on, " +
                    current.name?.trim().orEmpty().ifBlank { "selected track" }
            else
                "Subtitles off"
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

    private fun showPlaybackReport() {
        fun safe(value: String): String = value
            .replace(Regex("""(?i)(?:https?://|magnet:)\S+"""), "[redacted]")
            .replace(Regex("""(?i)(?:bearer|token|api[_-]?key|password)\s*[:= ]\s*\S+"""), "[redacted]")
            .replace(Regex("""[\r\n]+"""), " ").take(100)
        val current = vlcPlayer
        val hint = NativePlaybackDiagnostics.snapshot(payload, streamUrl, "libvlc", "report", context = this)
        val tracks = try { current?.audioTracks?.filter { it.id >= 0 }.orEmpty() } catch (_: Throwable) { emptyList() }
        val selected = tracks.firstOrNull { it.id == current?.audioTrack }
        val report = buildString {
            appendLine("Media God playback report")
            appendLine("App: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            appendLine("Device: ${safe(android.os.Build.MANUFACTURER)} ${safe(android.os.Build.MODEL)}")
            appendLine("Title: ${safe(payload.optString("title"))}")
            appendLine("Source: ${safe(hint.optString("label"))}")
            appendLine("Player: LibVLC compatibility (decoder name unavailable)")
            appendLine("Video codec hint: ${safe(hint.optString("videoCodec"))}")
            appendLine("Audio codec hint: ${safe(hint.optString("audioCodec"))}")
            appendLine("Selected audio: ${safe(selected?.name.orEmpty().ifBlank { "unknown" })} (id ${current?.audioTrack ?: -1})")
            appendLine("Available audio: ${tracks.take(12).joinToString("; ") { safe(it.name.orEmpty()) }.ifBlank { "unknown" }}")
            appendLine("Output: $audioOutputMode; software video: $forceSoftwareVideoDecode")
            appendLine("Position: ${current?.time ?: startPositionMs} ms")
        }
        AlertDialog.Builder(this).setTitle("Playback report").setMessage(report)
            .setPositiveButton("Copy") { _, _ ->
                val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Media God playback report", report))
                Toast.makeText(this, "Playback report copied", Toast.LENGTH_SHORT).show()
            }.setNegativeButton("Close", null).show()
    }

    private fun showSourceMenu() {
        MainActivity.fetchCurrentSourceChoices(requestId) { currentChoices ->
            if (resultSent || isFinishing) return@fetchCurrentSourceChoices
            val snapshot = payload.optJSONArray("sourceChoices")?.takeIf { it.length() > 0 }
                ?: payload.optJSONArray("sources") ?: JSONArray()
            val sources = currentChoices?.takeIf { it.length() >= snapshot.length() } ?: snapshot
            val entries = (0 until sources.length()).mapNotNull { position ->
                val item = sources.optJSONObject(position) ?: return@mapNotNull null
                val index = item.optInt("webIndex", position)
                if (index < 0) return@mapNotNull null
                index to item.optString("label").trim().ifBlank { "Source ${position + 1}" }
            }.distinctBy { it.first }
            if (entries.isEmpty()) {
                Toast.makeText(this, "Sources are still loading", Toast.LENGTH_SHORT).show()
                return@fetchCurrentSourceChoices
            }
            val activeIndex = payload.optInt("activeSourceIndex", -1)
            AlertDialog.Builder(this).setTitle("Sources • ${entries.size}")
                .setItems(entries.map { (index, label) ->
                    if (index == activeIndex) "Current • $label" else label
                }.toTypedArray()) { _, position ->
                    selectedSourceIndex = entries[position].first
                    if (selectedSourceIndex != activeIndex) finishWithResult("source")
                }.setNegativeButton("Close", null).show()
        }
    }

    private fun showStatus(message: String) {
        if (!::statusText.isInitialized || !::root.isInitialized) return

        val visibleMessage =
            when {
                message.startsWith(
                    "Compatibility decoder · opening",
                    ignoreCase = true
                ) -> "Loading…"
                message.startsWith(
                    "Compatibility decoder · buffering",
                    ignoreCase = true
                ) -> "Buffering…"
                message.startsWith(
                    "Compatibility decoder · checking stream",
                    ignoreCase = true
                ) -> "Checking stream…"
                message.startsWith(
                    "Compatibility decoder · retrying",
                    ignoreCase = true
                ) -> "Optimising playback…"
                message.equals(
                    "Compatibility decoder",
                    ignoreCase = true
                ) -> ""
                else ->
                    message
                        .replace(
                            "Compatibility decoder · ",
                            "",
                            ignoreCase = true
                        )
                        .replace(
                            "Compatibility decoder",
                            "",
                            ignoreCase = true
                        )
                        .trim()
            }

        root.removeCallbacks(hideStatusRunnable)

        if (visibleMessage.isBlank()) {
            statusText.text = ""
            statusText.visibility = View.GONE
            return
        }

        statusText.text = visibleMessage
        statusText.visibility = View.VISIBLE
        root.postDelayed(
            hideStatusRunnable,
            if (visibleMessage.startsWith("Playback info")) 5000L
            else STATUS_HIDE_DELAY_MS
        )
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
        updateProgressUi()
        root.postDelayed(hideControlsRunnable, CONTROLS_HIDE_DELAY_MS)
    }

    private fun releaseCompatibilityPlayer() {
        noAudioCheckGeneration += 1
        clearStartupTimeout()
        compatibilityPlaybackStarted = false
        videoStartupReadiness.reset()
        compatibilityErrorProbePending = false
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (::root.isInitialized) {
            root.removeCallbacks(progressRunnable)
        }
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
                if (!payload.optBoolean("live", false)) {
                    put("audioTracks", JSONArray().apply {
                        player?.audioTracks?.filter { it.id >= 0 }?.take(16)?.forEach { track ->
                            put(JSONObject().apply {
                                put("index", track.id)
                                put("name", track.name.orEmpty())
                                put("language", if (audioTrackNameLooksEnglish(track.name.orEmpty())) "en" else "unknown")
                                put("selected", track.id == audioId)
                                put("commentary", audioTrackNameLooksCommentary(track.name.orEmpty()))
                            })
                        }
                    })
                    put("audioFailureEvidence", if (reason == "error" &&
                        Regex("""audio decoder|no usable audio track""", RegexOption.IGNORE_CASE).containsMatchIn(message))
                        "decoder-error" else "unknown")
                    put("audioOutputConfirmed", false)
                }
                put("selectedSubtitleTrack", player?.spuTrack ?: -1)
                put("selectedSubtitleName", player?.spuTracks?.firstOrNull { it.id == (player?.spuTrack ?: -1) }?.name?.trim().orEmpty())
            } catch (_: Throwable) {}
            put("audioOutputMode", audioOutputMode); put("lipSyncMs", lipSyncMs); put("dialogueBoost", dialogueBoost)
        }
        val diagnostics = NativePlaybackDiagnostics.snapshot(payload, streamUrl, "libvlc", reason, message, extra, this).toString()
        val result = Intent().apply {
            putExtra(PlayerActivity.EXTRA_REQUEST_ID, requestId)
            putExtra(PlayerActivity.EXTRA_REASON, reason)
            putExtra("mg_auto_next_cancelled", nextEpisodeCountdownCancelled)
            putExtra(PlayerActivity.EXTRA_POSITION_MS, positionMs)
            putExtra(PlayerActivity.EXTRA_DURATION_MS, durationMs)
            putExtra(PlayerActivity.EXTRA_MESSAGE, message)
            putExtra(PlayerActivity.EXTRA_DIAGNOSTICS, diagnostics)
            putExtra(PlayerActivity.EXTRA_SELECTED_SOURCE_INDEX, selectedSourceIndex)
        }
        setResult(RESULT_OK, result)
        releaseCompatibilityPlayer()
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
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
