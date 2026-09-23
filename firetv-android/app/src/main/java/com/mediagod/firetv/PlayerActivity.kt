package com.mediagod.firetv

import android.app.Activity
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max

class PlayerActivity : Activity() {
    companion object {
        const val EXTRA_PAYLOAD = "mg_payload"
        const val EXTRA_REQUEST_ID = "mg_request_id"
        const val EXTRA_REASON = "mg_reason"
        const val EXTRA_POSITION_MS = "mg_position_ms"
        const val EXTRA_DURATION_MS = "mg_duration_ms"
        const val EXTRA_MESSAGE = "mg_message"
        const val EXTRA_DIAGNOSTICS = "mg_diagnostics"
        const val EXTRA_SELECTED_SOURCE_INDEX = "mg_selected_source_index"

        private const val REQUEST_COMPATIBILITY_PLAYER = 8402
        private const val CONTROLLER_HIDE_DELAY_MS = 2500L
        private const val LIVE_STARTUP_TIMEOUT_MS = 15000L
        private const val LIVE_STALL_TIMEOUT_MS = 12000L
        private const val STRICT_ENGLISH_STARTUP_TIMEOUT_MS = 10000L
        private const val NEXT_EPISODE_COUNTDOWN_MS = 10000L
    }

    private data class NativeSource(
        val label: String,
        val url: String,
        val headers: Map<String, String>,
        val mimeType: String,
        val drm: JSONObject?,
        val webIndex: Int
    )

    private lateinit var playerView: PlayerView
    private lateinit var sourceSpinner: Spinner
    private lateinit var assistControls: LinearLayout
    private lateinit var skipRecapButton: Button
    private lateinit var skipIntroButton: Button
    private lateinit var skipCreditsButton: Button
    private lateinit var playNextButton: Button
    private lateinit var cancelNextButton: Button
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    private var payload = JSONObject()
    private var nativeSources: List<NativeSource> = emptyList()
    private var activeSourceIndex = 0
    private var sourceSelectorReady = false
    private var requestId = ""
    private var streamUrl = ""
    private var title = ""
    private var live = false
    private var mediaType = ""
    private var autoNext = true
    private var recapStartMs = -1L
    private var recapEndMs = -1L
    private var introStartMs = -1L
    private var introEndMs = -1L
    private var creditsStartMs = -1L
    private var nextEpisodeCountdownStartedAtMs = -1L
    private var nextEpisodeCountdownCancelled = false
    private var assistControlsWereVisible = false
    private var initialPositionMs = 0L
    private var restorePositionMs = 0L
    private var shouldPlayWhenReady = true
    private var resultSent = false
    private var genericHttpsMimeRetryIndex = 0
    private var compatibilityPlayerOpen = false
    private var audioPresenceCheckGeneration = 0

    private val failedLiveSourceIndexes = linkedSetOf<Int>()
    private var livePlaybackStarted = false
    private var liveRecoveryPending = false

    private fun formatLooksEnglish(format: androidx.media3.common.Format): Boolean {
        val language = format.language.orEmpty().trim().lowercase()
        val label = format.label.orEmpty().trim().lowercase()

        return language == "en" ||
            language == "eng" ||
            language.startsWith("en-") ||
            Regex(
                """(?:^|[^a-z0-9])(?:en|eng|english)(?=$|[^a-z0-9])""",
                RegexOption.IGNORE_CASE
            ).containsMatchIn(label)
    }

    private fun formatLooksCommentary(format: androidx.media3.common.Format): Boolean {
        val label = format.label.orEmpty()

        return (format.roleFlags and C.ROLE_FLAG_COMMENTARY) != 0 ||
            Regex(
                """commentary|audio description|descriptive|visually impaired""",
                RegexOption.IGNORE_CASE
            ).containsMatchIn(label)
    }

    private fun activeSourceMetadata(): JSONObject? {
        val sourceArray = payload.optJSONArray("sources") ?: return null
        val activeWebIndex =
            nativeSources.getOrNull(activeSourceIndex)?.webIndex
                ?: payload.optInt("activeSourceIndex", 0)

        for (index in 0 until sourceArray.length()) {
            val item = sourceArray.optJSONObject(index) ?: continue
            if (item.optInt("webIndex", index) == activeWebIndex) {
                return item
            }
        }

        return null
    }

    private fun currentVerifiedEnglishMain(): Boolean =
        activeSourceMetadata()?.optBoolean(
            "verifiedEnglishMain",
            payload.optBoolean("verifiedEnglishMain", false)
        ) ?: payload.optBoolean("verifiedEnglishMain", false)

    /*
     * Audio correction is manual-only. Never hold VOD startup waiting for an
     * English/audio validation gate; the viewer can use Audio if the selected
     * track is wrong or silent.
     */
    private fun strictEnglishStartupRequired(): Boolean = false

    private fun currentPreferredEnglishTrackName(): String =
        activeSourceMetadata()?.optString("preferredAudioTrackName").orEmpty()
            .ifBlank { payload.optString("preferredAudioTrackName").trim() }

    private fun currentPreferredEnglishTrackLanguage(): String =
        activeSourceMetadata()?.optString("preferredAudioTrackLanguage").orEmpty()
            .ifBlank { payload.optString("preferredAudioTrackLanguage").trim() }

    private fun currentPreferredEnglishTrackCodec(): String =
        activeSourceMetadata()?.optString("preferredAudioTrackCodec").orEmpty()
            .ifBlank { payload.optString("preferredAudioTrackCodec").trim() }

    private fun currentPreferredEnglishTrackStream(): String =
        activeSourceMetadata()?.optString("preferredAudioTrackStream").orEmpty()
            .ifBlank { payload.optString("preferredAudioTrackStream").trim() }

    private fun normaliseTrackIdentity(value: String): String =
        value.lowercase().replace(Regex("""[^a-z0-9]+"""), " ").trim()

    private fun formatMatchesVerifiedEnglishHint(
        format: androidx.media3.common.Format
    ): Boolean {
        if (!currentVerifiedEnglishMain()) return false

        val expectedStream = currentPreferredEnglishTrackStream().trim()
        val formatId = format.id.orEmpty().trim()
        if (
            expectedStream.isNotBlank() &&
            formatId.isNotBlank() &&
            expectedStream == formatId
        ) {
            return true
        }

        val expectedName = normaliseTrackIdentity(
            currentPreferredEnglishTrackName()
        )
        val actualLabel = normaliseTrackIdentity(
            format.label.orEmpty()
        )

        return expectedName.length >= 3 &&
            actualLabel.length >= 3 &&
            (
                expectedName == actualLabel ||
                expectedName.contains(actualLabel) ||
                actualLabel.contains(expectedName)
            )
    }

    /**
     * Once Media3 knows the real track groups, explicitly pin the preferred
     * English main track instead of relying only on the pre-prepare language
     * preference. Some MKV/remux files advertise a foreign default track even
     * though a clean English track is present.
     *
     * Returns true when a new override was applied. The caller should wait for
     * the resulting onTracksChanged callback before running compatibility
     * rescue, otherwise the old foreign selection can be mistaken for failure.
     */
    private fun enforcePreferredEnglishAudio(
        activePlayer: ExoPlayer,
        tracks: androidx.media3.common.Tracks
    ): Boolean {
        val preferred = payload.optString("audioLanguage", "en")
            .trim()
            .lowercase()

        if (preferred !in setOf("en", "eng", "english")) {
            return false
        }

        var selectedEnglishMain = false
        var bestGroup: androidx.media3.common.Tracks.Group? = null
        var bestIndex = -1
        var bestScore = Int.MIN_VALUE

        tracks.groups.forEach { group ->
            if (group.type != C.TRACK_TYPE_AUDIO) return@forEach

            for (index in 0 until group.length) {
                if (!group.isTrackSupported(index)) continue

                val format = group.getTrackFormat(index)
                val english =
                    formatLooksEnglish(format) ||
                        formatMatchesVerifiedEnglishHint(format)
                val commentary = formatLooksCommentary(format)

                if (
                    group.isTrackSelected(index) &&
                    english &&
                    !commentary
                ) {
                    selectedEnglishMain = true
                }

                if (!english) continue

                var score = 1000
                if (!commentary) score += 400
                if ((format.roleFlags and C.ROLE_FLAG_MAIN) != 0) score += 100
                if (group.isTrackSelected(index)) score += 25

                val mime = format.sampleMimeType.orEmpty().lowercase()
                if (
                    mime.contains("aac") ||
                    mime.contains("ac3") ||
                    mime.contains("eac3") ||
                    mime.contains("opus")
                ) {
                    score += 20
                }

                if (commentary) score -= 900

                if (score > bestScore) {
                    bestScore = score
                    bestGroup = group
                    bestIndex = index
                }
            }
        }

        if (selectedEnglishMain || bestGroup == null || bestIndex < 0) {
            return false
        }

        return try {
            activePlayer.trackSelectionParameters =
                activePlayer.trackSelectionParameters
                    .buildUpon()
                    .setOverrideForType(
                        androidx.media3.common.TrackSelectionOverride(
                            bestGroup!!.mediaTrackGroup,
                            bestIndex
                        )
                    )
                    .build()
            true
        } catch (_: Throwable) {
            false
        }
    }

    /*
     * The strict English gate deliberately starts VOD paused. Once Media3 has
     * actually selected a supported English main track, this is the single path
     * that releases that gate. Keeping it separate from the override request is
     * important: applying TrackSelectionParameters does not itself start the
     * player.
     */
    private fun resumeStrictEnglishPlaybackIfReady(
        activePlayer: ExoPlayer
    ): Boolean {
        if (
            !strictEnglishStartupRequired() ||
            !shouldPlayWhenReady ||
            resultSent ||
            compatibilityPlayerOpen
        ) {
            return false
        }

        val english =
            inspectPreferredEnglishReadiness(activePlayer.currentTracks)

        if (
            !english.present ||
            !english.supported ||
            !english.selected
        ) {
            return false
        }

        audioPresenceCheckGeneration += 1
        activePlayer.playWhenReady = true
        activePlayer.play()

        if (::playerView.isInitialized) {
            playerView.removeCallbacks(strictEnglishStartupWatchdogRunnable)
        }

        return true
    }

    private val strictEnglishStartupWatchdogRunnable = Runnable {
        if (
            resultSent ||
            live ||
            compatibilityPlayerOpen ||
            !strictEnglishStartupRequired()
        ) {
            return@Runnable
        }

        val activePlayer = player ?: return@Runnable

        if (resumeStrictEnglishPlaybackIfReady(activePlayer)) {
            return@Runnable
        }

        val rescued = launchCompatibilityPlayer(
            activePlayer,
            null,
            "Strict English startup did not become ready within 10 seconds. Trying the compatibility decoder on this same source."
        )

        if (!rescued) {
            finishWithResult(
                "error",
                "This source could not start with a confirmed English main audio track."
            )
        }
    }

    private fun armStrictEnglishStartupWatchdog() {
        if (
            !strictEnglishStartupRequired() ||
            !::playerView.isInitialized
        ) {
            return
        }

        playerView.removeCallbacks(strictEnglishStartupWatchdogRunnable)
        playerView.postDelayed(
            strictEnglishStartupWatchdogRunnable,
            STRICT_ENGLISH_STARTUP_TIMEOUT_MS
        )
    }

    private fun clearStrictEnglishStartupWatchdog() {
        if (::playerView.isInitialized) {
            playerView.removeCallbacks(strictEnglishStartupWatchdogRunnable)
        }
    }


    private val hideControllerRunnable = Runnable {
        if (!resultSent && ::playerView.isInitialized) {
            playerView.hideController()
        }
    }

    private val hideSourceSelectorRunnable = Runnable {
        if (!resultSent && ::sourceSpinner.isInitialized) {
            hideSourceSelector()
        }
    }

    private val updateAssistControlsRunnable = object : Runnable {
        override fun run() {
            if (resultSent || !::playerView.isInitialized) return
            updateAssistControls()
            playerView.postDelayed(this, 750L)
        }
    }

    private val liveStartupTimeoutRunnable = Runnable {
        if (!resultSent && live && !livePlaybackStarted) {
            recoverLivePlayback("Live TV took too long to start.")
        }
    }

    private val liveStallTimeoutRunnable = Runnable {
        if (!resultSent && live && livePlaybackStarted) {
            recoverLivePlayback("Live TV stopped responding.")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        payload = try {
            JSONObject(intent.getStringExtra(EXTRA_PAYLOAD).orEmpty())
        } catch (_: Throwable) {
            JSONObject()
        }

        requestId = payload.optString("requestId")
        streamUrl = payload.optString("url").trim()
        title = payload.optString("title")
        live = payload.optBoolean("live", false)
        mediaType = payload.optString("mediaType").trim().lowercase()
        autoNext = payload.optBoolean("autoNext", true)
        recapStartMs = payloadMarkerMs("recapStart")
        recapEndMs = payloadMarkerMs("recapEnd")
        introStartMs = payloadMarkerMs("introStart")
        introEndMs = payloadMarkerMs("introEnd")
        creditsStartMs = payloadMarkerMs("creditsStart")
        initialPositionMs = max(0L, payload.optLong("startPositionMs", 0L))
        restorePositionMs = initialPositionMs

        nativeSources = readNativeSources()
        if (nativeSources.isNotEmpty()) {
            val requestedWebIndex = payload.optInt("activeSourceIndex", 0)
            val urlIndex = nativeSources.indexOfFirst { it.url == streamUrl }
            val webIndexMatch = nativeSources.indexOfFirst {
                it.webIndex == requestedWebIndex
            }

            activeSourceIndex = when {
                urlIndex >= 0 -> urlIndex
                webIndexMatch >= 0 -> webIndexMatch
                else -> 0
            }

            val selectedUrl = nativeSources[activeSourceIndex].url
            if (selectedUrl.startsWith("https://") || selectedUrl.startsWith("http://")) {
                streamUrl = selectedUrl
            }
        }

        if (!(streamUrl.startsWith("https://") || streamUrl.startsWith("http://"))) {
            finishWithResult("error", "Invalid stream URL")
            return
        }

        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        enterImmersiveMode()

        DisplayRateMatcher.apply(
            this,
            payload,
            streamUrl,
            forceDisplayMode = true
        )

        playerView = PlayerView(this).apply {
            id = View.generateViewId()
            setBackgroundColor(Color.BLACK)
            useController = true
            setShowSubtitleButton(true)
            controllerAutoShow = false
            controllerHideOnTouch = true
            controllerShowTimeoutMs = 2500
            setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
            isFocusable = true
            isFocusableInTouchMode = true
            contentDescription = if (title.isBlank()) "Media God player" else title
        }

        sourceSpinner = buildSourceSpinner()
        assistControls = buildAssistControls()
        playerView.nextFocusUpId = sourceSpinner.id
        sourceSpinner.nextFocusDownId = playerView.id

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(
                playerView,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            addView(
                sourceSpinner,
                FrameLayout.LayoutParams(dp(440), dp(52)).apply {
                    gravity = Gravity.TOP or Gravity.END
                    topMargin = dp(20)
                    marginEnd = dp(24)
                }
            )
            addView(
                assistControls,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    dp(54)
                ).apply {
                    gravity = Gravity.BOTTOM or Gravity.END
                    bottomMargin = dp(42)
                    marginEnd = dp(30)
                }
            )
        }

        setContentView(root)
        playerView.requestFocus()
        playerView.post(updateAssistControlsRunnable)
        hideControllerNow()
    }

    override fun onStart() {
        super.onStart()
        if (!compatibilityPlayerOpen) {
            initialisePlayer()
        }
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
        playerView.requestFocus()
        hideControllerNow()

        if (live && player != null) {
            if (livePlaybackStarted) {
                if (player?.isPlaying == true) {
                    clearLiveWatchdogs()
                } else if (player?.playWhenReady == true) {
                    armLiveStallWatchdog()
                }
            } else {
                armLiveStartupWatchdog()
            }
        }
    }

    override fun onPause() {
        clearLiveWatchdogs()
        player?.let {
            restorePositionMs = max(0L, it.currentPosition)
            shouldPlayWhenReady = it.playWhenReady
        }
        releasePlayer()
        super.onPause()
    }

    override fun onStop() {
        releasePlayer()
        super.onStop()
    }

    override fun onDestroy() {
        if (::sourceSpinner.isInitialized) {
            sourceSpinner.removeCallbacks(hideSourceSelectorRunnable)
        }
        if (::playerView.isInitialized) {
            playerView.removeCallbacks(hideControllerRunnable)
            playerView.removeCallbacks(updateAssistControlsRunnable)
        }
        clearLiveWatchdogs()
        DisplayRateMatcher.clear(this)
        releasePlayer()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enterImmersiveMode()
            hideControllerNow()
        }
    }

    @Deprecated("Deprecated in Android; retained for Fire OS compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode != REQUEST_COMPATIBILITY_PLAYER) {
            return
        }

        compatibilityPlayerOpen = false
        resultSent = true

        val forwarded = data ?: Intent().apply {
            putExtra(EXTRA_REQUEST_ID, requestId)
            putExtra(EXTRA_REASON, "back")
            putExtra(EXTRA_POSITION_MS, restorePositionMs)
            putExtra(EXTRA_DURATION_MS, 0L)
            putExtra(EXTRA_MESSAGE, "")
            putExtra(
                EXTRA_SELECTED_SOURCE_INDEX,
                nativeSources.getOrNull(activeSourceIndex)?.webIndex ?: -1
            )
        }

        setResult(RESULT_OK, forwarded)
        finish()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && !event.isLongPress) {
            val activePlayer = player

            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> {
                    if (hideSourceSelector()) {
                        return true
                    }

                    finishWithResult("back")
                    return true
                }

                KeyEvent.KEYCODE_MENU -> {
                    if (sourceSelectorAvailable()) {
                        if (sourceSpinner.visibility == View.VISIBLE) {
                            sourceSpinner.requestFocus()
                            sourceSpinner.performClick()
                        } else {
                            showSourceSelector()
                        }
                        return true
                    }
                }

                KeyEvent.KEYCODE_DPAD_UP -> {
                    if (
                        ::assistControls.isInitialized &&
                        assistControls.hasFocus()
                    ) {
                        playerView.requestFocus()
                        showControllerTemporarily()
                        return true
                    }

                    if (sourceSelectorAvailable() && !sourceSpinner.hasFocus()) {
                        showSourceSelector()
                        return true
                    }
                }

                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    if (moveAssistFocus(-1)) {
                        return true
                    }
                }

                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    if (moveAssistFocus(1)) {
                        return true
                    }
                }

                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER,
                KeyEvent.KEYCODE_BUTTON_A -> {
                    val focused = currentFocus
                    if (
                        ::assistControls.isInitialized &&
                        assistControls.hasFocus() &&
                        focused is Button &&
                        focused.visibility == View.VISIBLE
                    ) {
                        focused.performClick()
                        return true
                    }
                }

                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (sourceSpinner.visibility == View.VISIBLE && sourceSpinner.hasFocus()) {
                        hideSourceSelector()
                        return true
                    }

                    if (
                        ::assistControls.isInitialized &&
                        assistControls.visibility == View.VISIBLE &&
                        !assistControls.hasFocus()
                    ) {
                        firstVisibleAssistButton()?.requestFocus()
                        showControllerTemporarily()
                        return true
                    }
                }

                KeyEvent.KEYCODE_MEDIA_NEXT -> {
                    if (isTvEpisode()) {
                        finishWithResult("next")
                        return true
                    }
                }

                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                KeyEvent.KEYCODE_HEADSETHOOK -> {
                    activePlayer?.let {
                        if (it.isPlaying) it.pause() else it.play()
                        showControllerTemporarily()
                    }
                    return true
                }

                KeyEvent.KEYCODE_MEDIA_PLAY -> {
                    activePlayer?.play()
                    showControllerTemporarily()
                    return true
                }

                KeyEvent.KEYCODE_MEDIA_PAUSE,
                KeyEvent.KEYCODE_MEDIA_STOP -> {
                    activePlayer?.pause()
                    showControllerTemporarily()
                    return true
                }

                KeyEvent.KEYCODE_MEDIA_REWIND -> {
                    seekBy(-10_000L)
                    return true
                }

                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                    seekBy(10_000L)
                    return true
                }
            }
        }

        return super.dispatchKeyEvent(event)
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()


    private fun payloadMarkerMs(key: String): Long {
        val value = payload.optDouble(key, -1.0)
        if (!value.isFinite() || value < 0.0) return -1L

        /* The web side normally sends seconds, but older marker providers can
         * still expose milliseconds. A five-digit chapter value is not a
         * realistic number of seconds for VOD, so preserve it as milliseconds. */
        return if (value >= 10_000.0) {
            value.toLong().coerceAtLeast(0L)
        } else {
            (value * 1000.0).toLong().coerceAtLeast(0L)
        }
    }

    private fun isTvEpisode(): Boolean =
        !live &&
            (
                mediaType == "tv" ||
                    mediaType == "series" ||
                    payload.optInt("season", 0) > 0 ||
                    payload.optInt("episode", 0) > 0
            )

    private fun buildAssistButton(
        label: String,
        onClick: () -> Unit
    ): Button =
        Button(this).apply {
            id = View.generateViewId()
            text = label
            isAllCaps = false
            textSize = 14f
            minHeight = dp(50)
            minWidth = dp(128)
            isFocusable = true
            isFocusableInTouchMode = false
            visibility = View.GONE
            stateListAnimator = null
            setPadding(dp(14), 0, dp(14), 0)

            backgroundTintList = ColorStateList(
                arrayOf(
                    intArrayOf(android.R.attr.state_focused),
                    intArrayOf(android.R.attr.state_pressed),
                    intArrayOf()
                ),
                intArrayOf(
                    Color.rgb(43, 238, 122),
                    Color.rgb(31, 204, 101),
                    Color.rgb(24, 24, 24)
                )
            )

            setTextColor(
                ColorStateList(
                    arrayOf(
                        intArrayOf(android.R.attr.state_focused),
                        intArrayOf(android.R.attr.state_pressed),
                        intArrayOf()
                    ),
                    intArrayOf(
                        Color.BLACK,
                        Color.BLACK,
                        Color.WHITE
                    )
                )
            )

            setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) {
                    showControllerTemporarily()
                }
            }

            setOnClickListener {
                onClick()
            }
        }

    private fun buildAssistControls(): LinearLayout {
        skipRecapButton = buildAssistButton("Skip recap") {
            val activePlayer = player ?: return@buildAssistButton
            val target =
                if (recapEndMs > activePlayer.currentPosition) {
                    recapEndMs + 250L
                } else {
                    minOf(
                        75_000L,
                        maxOf(activePlayer.currentPosition + 30_000L, 50_000L)
                    )
                }
            seekAssistTo(target)
        }

        skipIntroButton = buildAssistButton("Skip intro") {
            val activePlayer = player ?: return@buildAssistButton
            val target =
                if (introEndMs > activePlayer.currentPosition) {
                    introEndMs + 250L
                } else {
                    minOf(
                        210_000L,
                        maxOf(activePlayer.currentPosition + 60_000L, 105_000L)
                    )
                }
            seekAssistTo(target)
        }

        skipCreditsButton = buildAssistButton("Skip credits") {
            if (isTvEpisode()) {
                finishWithResult("next")
            } else {
                val activePlayer = player ?: return@buildAssistButton
                val duration = activePlayer.duration.takeIf { it > 0L } ?: return@buildAssistButton
                seekAssistTo(maxOf(0L, duration - 750L))
            }
        }

        playNextButton = buildAssistButton("Next episode") {
            finishWithResult("next")
        }

        cancelNextButton = buildAssistButton("Stay here") {
            nextEpisodeCountdownCancelled = true
            nextEpisodeCountdownStartedAtMs = -1L
            updateAssistControls()
            playerView.requestFocus()
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(5), dp(3), dp(5), dp(3))
            setBackgroundColor(Color.argb(175, 0, 0, 0))
            visibility = View.GONE
            addView(skipRecapButton)
            addView(skipIntroButton)
            addView(skipCreditsButton)
            addView(playNextButton)
            addView(cancelNextButton)
        }
    }

    private fun seekAssistTo(targetMs: Long) {
        val activePlayer = player ?: return
        if (live && !activePlayer.isCurrentMediaItemSeekable) return

        val duration = activePlayer.duration.takeIf { it > 0L } ?: Long.MAX_VALUE
        val target = targetMs
            .coerceAtLeast(0L)
            .coerceAtMost(duration)

        activePlayer.seekTo(target)
        activePlayer.play()
        showControllerTemporarily()
        playerView.requestFocus()
    }

    private fun visibleAssistButtons(): List<Button> =
        if (!::assistControls.isInitialized) {
            emptyList()
        } else {
            listOf(
                skipRecapButton,
                skipIntroButton,
                skipCreditsButton,
                playNextButton,
                cancelNextButton
            ).filter { it.visibility == View.VISIBLE }
        }

    private fun firstVisibleAssistButton(): Button? =
        visibleAssistButtons().firstOrNull()

    private fun configureAssistFocus(buttons: List<Button>) {
        if (buttons.isEmpty()) {
            playerView.nextFocusDownId = View.NO_ID
            return
        }

        buttons.forEachIndexed { index, button ->
            val previous = buttons[(index - 1 + buttons.size) % buttons.size]
            val next = buttons[(index + 1) % buttons.size]

            button.nextFocusLeftId = previous.id
            button.nextFocusRightId = next.id
            button.nextFocusUpId = playerView.id
            button.nextFocusDownId = playerView.id
        }

        playerView.nextFocusDownId = buttons.first().id
    }

    private fun moveAssistFocus(direction: Int): Boolean {
        if (
            !::assistControls.isInitialized ||
            assistControls.visibility != View.VISIBLE ||
            !assistControls.hasFocus()
        ) {
            return false
        }

        val buttons = visibleAssistButtons()
        if (buttons.isEmpty()) return false

        val currentIndex = buttons.indexOfFirst { it.hasFocus() }
        val nextIndex =
            if (currentIndex < 0) {
                if (direction < 0) buttons.lastIndex else 0
            } else {
                (currentIndex + direction + buttons.size) % buttons.size
            }

        buttons[nextIndex].requestFocus()
        showControllerTemporarily()
        return true
    }

    private fun setAssistVisible(button: Button, visible: Boolean) {
        button.visibility = if (visible) View.VISIBLE else View.GONE
    }

    private fun updateAssistControls() {
        if (
            resultSent ||
            !::assistControls.isInitialized ||
            !::skipRecapButton.isInitialized ||
            live
        ) {
            if (::assistControls.isInitialized) {
                assistControls.visibility = View.GONE
            }
            return
        }

        val activePlayer = player
        if (activePlayer == null) {
            assistControls.visibility = View.GONE
            return
        }

        val position = maxOf(0L, activePlayer.currentPosition)
        val duration = activePlayer.duration.takeIf { it > 0L } ?: 0L
        val remaining = if (duration > 0L) maxOf(0L, duration - position) else Long.MAX_VALUE
        val tvEpisode = isTvEpisode()
        val playingNow = activePlayer.isPlaying
        val episodeNumber = payload.optInt("episode", 0).coerceAtLeast(0)
        val nextEpisodeKnown =
            payload.has("nextEpisodeAvailable") &&
                !payload.isNull("nextEpisodeAvailable")
        val hasNextEpisode =
            !nextEpisodeKnown ||
                payload.optBoolean("nextEpisodeAvailable", true)
        val focusedAssistBeforeUpdate =
            listOf(
                skipRecapButton,
                skipIntroButton,
                skipCreditsButton,
                playNextButton,
                cancelNextButton
            ).firstOrNull { it.hasFocus() }

        val exactRecap =
            tvEpisode &&
                recapEndMs > 0L &&
                position >= maxOf(0L, recapStartMs) &&
                position < recapEndMs
        val fallbackRecap =
            tvEpisode &&
                recapEndMs <= 0L &&
                episodeNumber > 1 &&
                playingNow &&
                position in 4_000L..65_000L &&
                (duration <= 0L || remaining > 180_000L)
        val recapVisible = exactRecap || fallbackRecap

        val exactIntro =
            tvEpisode &&
                introEndMs > 0L &&
                position >= maxOf(0L, introStartMs) &&
                position < introEndMs
        val fallbackIntroStartMs =
            if (recapEndMs > 0L) {
                maxOf(15_000L, minOf(180_000L, recapEndMs + 2_000L))
            } else if (episodeNumber > 1) {
                65_000L
            } else {
                15_000L
            }
        val fallbackIntro =
            tvEpisode &&
                introEndMs <= 0L &&
                playingNow &&
                !recapVisible &&
                position in fallbackIntroStartMs..210_000L &&
                (duration <= 0L || remaining > 120_000L)
        val introVisible = !recapVisible && (exactIntro || fallbackIntro)

        val creditsFallbackWindow =
            if (tvEpisode) {
                if (duration > 0L) {
                    minOf(90_000L, maxOf(45_000L, (duration * 0.04).toLong()))
                } else 0L
            } else {
                if (duration > 0L) {
                    minOf(180_000L, maxOf(90_000L, (duration * 0.05).toLong()))
                } else 0L
            }

        val exactCredits =
            duration >= 300_000L &&
                creditsStartMs > 0L &&
                position >= creditsStartMs &&
                position < duration - 500L
        val fallbackCredits =
            duration >= 300_000L &&
                creditsStartMs <= 0L &&
                position > (duration * 0.70).toLong() &&
                remaining <= creditsFallbackWindow
        val creditsVisible = exactCredits || fallbackCredits

        setAssistVisible(skipRecapButton, recapVisible)
        setAssistVisible(skipIntroButton, introVisible)
        // TV has one clear end-of-episode action instead of duplicate
        // "Skip credits" and "Play next" buttons.
        setAssistVisible(skipCreditsButton, creditsVisible && !tvEpisode)
        skipCreditsButton.text = "Skip credits"

        val nextEpisodeWindow =
            tvEpisode &&
                hasNextEpisode &&
                duration >= 180_000L &&
                position >= 60_000L &&
                (exactCredits || remaining <= 60_000L)
        setAssistVisible(playNextButton, nextEpisodeWindow)

        val countdownWindow =
            tvEpisode &&
                hasNextEpisode &&
                duration >= 180_000L &&
                position >= 60_000L &&
                (
                    (exactCredits && remaining <= 75_000L) ||
                        remaining <= 20_000L
                )

        if (
            autoNext &&
            countdownWindow &&
            playingNow &&
            !nextEpisodeCountdownCancelled
        ) {
            if (nextEpisodeCountdownStartedAtMs < 0L) {
                nextEpisodeCountdownStartedAtMs = android.os.SystemClock.elapsedRealtime()
            }

            val elapsed =
                android.os.SystemClock.elapsedRealtime() - nextEpisodeCountdownStartedAtMs
            val left = NEXT_EPISODE_COUNTDOWN_MS - elapsed

            if (left <= 0L) {
                nextEpisodeCountdownCancelled = true
                nextEpisodeCountdownStartedAtMs = -1L
                finishWithResult("next")
                return
            }

            val seconds = maxOf(1L, (left + 999L) / 1000L)
            playNextButton.text = "Next episode in ${seconds}s"
            setAssistVisible(playNextButton, true)
            setAssistVisible(cancelNextButton, true)
        } else {
            if (!countdownWindow || !playingNow || !autoNext) {
                nextEpisodeCountdownStartedAtMs = -1L
            }
            playNextButton.text = "Next episode"
            setAssistVisible(cancelNextButton, false)
        }

        val visibleButtons = visibleAssistButtons()
        val anyVisible = visibleButtons.isNotEmpty()

        if (anyVisible) {
            assistControls.visibility = View.VISIBLE
            configureAssistFocus(visibleButtons)

            val focusedActionDisappeared =
                focusedAssistBeforeUpdate != null &&
                    focusedAssistBeforeUpdate.visibility != View.VISIBLE

            if (
                !sourceSpinner.hasFocus() &&
                (!assistControlsWereVisible || focusedActionDisappeared)
            ) {
                val target = visibleButtons.first()
                target.post {
                    if (
                        !resultSent &&
                        target.visibility == View.VISIBLE &&
                        !sourceSpinner.hasFocus()
                    ) {
                        target.requestFocus()
                    }
                }
            }
        } else {
            if (
                assistControls.hasFocus() ||
                focusedAssistBeforeUpdate != null
            ) {
                playerView.requestFocus()
            }

            assistControls.visibility = View.GONE
            playerView.nextFocusDownId = View.NO_ID
        }

        assistControlsWereVisible = anyVisible
    }

    private fun canChooseEpisode(): Boolean =
        !live && payload.optBoolean("canChooseEpisode", false)

    private fun sourceSelectorAvailable(): Boolean =
        nativeSources.size > 1 || canChooseEpisode()

    private fun sourceSelectorOffset(): Int =
        if (canChooseEpisode()) 2 else 0

    private fun showControllerTemporarily() {
        if (!::playerView.isInitialized || resultSent) {
            return
        }

        playerView.removeCallbacks(hideControllerRunnable)
        playerView.showController()
        playerView.postDelayed(
            hideControllerRunnable,
            CONTROLLER_HIDE_DELAY_MS
        )
    }

    private fun hideControllerNow() {
        if (!::playerView.isInitialized) {
            return
        }

        playerView.removeCallbacks(hideControllerRunnable)
        playerView.hideController()
    }

    private fun showSourceSelector() {
        if (!sourceSelectorAvailable() || resultSent) return

        sourceSpinner.removeCallbacks(hideSourceSelectorRunnable)
        sourceSpinner.visibility = View.VISIBLE
        sourceSpinner.requestFocus()
        showControllerTemporarily()
        sourceSpinner.post {
            if (!resultSent && sourceSpinner.visibility == View.VISIBLE) {
                sourceSpinner.performClick()
            }
        }
        sourceSpinner.postDelayed(hideSourceSelectorRunnable, 2500L)
    }

    private fun hideSourceSelector(): Boolean {
        if (!::sourceSpinner.isInitialized || sourceSpinner.visibility != View.VISIBLE) {
            return false
        }

        sourceSpinner.removeCallbacks(hideSourceSelectorRunnable)
        sourceSpinner.visibility = View.GONE
        playerView.requestFocus()
        hideControllerNow()
        return true
    }

    private fun clearLiveWatchdogs() {
        if (!::playerView.isInitialized) {
            return
        }

        playerView.removeCallbacks(liveStartupTimeoutRunnable)
        playerView.removeCallbacks(liveStallTimeoutRunnable)
    }

    private fun armLiveStartupWatchdog() {
        if (!live || resultSent || compatibilityPlayerOpen || !::playerView.isInitialized) {
            return
        }

        playerView.removeCallbacks(liveStartupTimeoutRunnable)
        playerView.removeCallbacks(liveStallTimeoutRunnable)
        playerView.postDelayed(
            liveStartupTimeoutRunnable,
            LIVE_STARTUP_TIMEOUT_MS
        )
    }

    private fun armLiveStallWatchdog() {
        if (
            !live ||
            resultSent ||
            compatibilityPlayerOpen ||
            !livePlaybackStarted ||
            !::playerView.isInitialized
        ) {
            return
        }

        playerView.removeCallbacks(liveStartupTimeoutRunnable)
        playerView.removeCallbacks(liveStallTimeoutRunnable)
        playerView.postDelayed(
            liveStallTimeoutRunnable,
            LIVE_STALL_TIMEOUT_MS
        )
    }

    private fun nextLiveSourceIndex(): Int {
        if (!live || nativeSources.size <= 1) {
            return -1
        }

        for (offset in 1..nativeSources.size) {
            val index = (activeSourceIndex + offset) % nativeSources.size
            if (index == activeSourceIndex || failedLiveSourceIndexes.contains(index)) {
                continue
            }

            val candidateUrl = nativeSources[index].url.trim()
            if (candidateUrl.startsWith("https://") || candidateUrl.startsWith("http://")) {
                return index
            }
        }

        return -1
    }

    private fun recoverLivePlayback(message: String): Boolean {
        if (!live || resultSent || liveRecoveryPending || compatibilityPlayerOpen) {
            return false
        }

        failedLiveSourceIndexes.add(activeSourceIndex)
        val nextIndex = nextLiveSourceIndex()

        if (nextIndex < 0) {
            clearLiveWatchdogs()
            finishWithResult(
                reason = "error",
                message = "$message No other Live TV source is available."
            )
            return true
        }

        liveRecoveryPending = true
        clearLiveWatchdogs()

        if (!::playerView.isInitialized) {
            liveRecoveryPending = false
            return false
        }

        playerView.post {
            if (resultSent || compatibilityPlayerOpen) {
                liveRecoveryPending = false
                return@post
            }

            liveRecoveryPending = false
            switchNativeSource(nextIndex, automaticRecovery = true)
        }

        return true
    }

    private fun readHeaders(json: JSONObject?): Map<String, String> {
        if (json == null) return emptyMap()

        val result = linkedMapOf<String, String>()
        val keys = json.keys()

        while (keys.hasNext()) {
            val key = keys.next()
            val value = json.optString(key).trim()
            if (key.isNotBlank() && value.isNotBlank()) {
                result[key] = value
            }
        }

        return result
    }

    private fun readNativeSources(): List<NativeSource> {
        val result = mutableListOf<NativeSource>()
        val seenKeys = linkedSetOf<String>()
        val sourceArray = payload.optJSONArray("sources") ?: JSONArray()

        for (index in 0 until sourceArray.length()) {
            val item = sourceArray.optJSONObject(index) ?: continue
            val url = item.optString("url").trim()
            val webIndex = item.optInt("webIndex", index)

            if (url.isBlank() || !seenKeys.add("$webIndex|$url")) {
                continue
            }

            val label = item.optString("label").trim().ifBlank {
                item.optString("sourceName").trim().ifBlank {
                    "Source ${result.size + 1}"
                }
            }

            result.add(
                NativeSource(
                    label = label,
                    url = url,
                    headers = readHeaders(item.optJSONObject("headers")),
                    mimeType = item.optString("mimeType").trim(),
                    drm = item.optJSONObject("drm"),
                    webIndex = webIndex
                )
            )
        }

        if (
            (streamUrl.startsWith("https://") || streamUrl.startsWith("http://")) &&
            result.none { it.url == streamUrl }
        ) {
            result.add(
                0,
                NativeSource(
                    label = "Current source",
                    url = streamUrl,
                    headers = readHeaders(payload.optJSONObject("headers")),
                    mimeType = payload.optString("mimeType").trim(),
                    drm = payload.optJSONObject("drm"),
                    webIndex = payload.optInt("activeSourceIndex", 0)
                )
            )
        }

        return result
    }

    private fun buildSourceSpinner(): Spinner {
        val episodePickerEnabled = canChooseEpisode()
        val season = payload.optInt("season", 0)
        val episode = payload.optInt("episode", 0)
        val labels = mutableListOf<String>()

        if (episodePickerEnabled) {
            labels.add(
                if (season > 0) "Season $season • choose season" else "Choose season"
            )
            labels.add(
                if (episode > 0) "Episode $episode • choose episode" else "Choose episode"
            )
        }

        labels.addAll(
            nativeSources.mapIndexed { index, item ->
                "${index + 1}. ${item.label}"
            }
        )

        val sourceAdapter = object : ArrayAdapter<String>(
            this,
            android.R.layout.simple_spinner_item,
            labels
        ) {
            private fun style(view: View, dropdown: Boolean): View {
                val text = view as? TextView ?: return view
                text.setTextColor(Color.WHITE)
                text.setBackgroundColor(
                    if (dropdown) Color.rgb(24, 24, 24)
                    else Color.argb(220, 12, 12, 12)
                )
                text.textSize = 15f
                text.gravity = Gravity.CENTER_VERTICAL
                text.minHeight = dp(52)
                text.setPadding(dp(14), 0, dp(14), 0)
                return text
            }

            override fun getView(position: Int, convertView: View?, parent: ViewGroup): View =
                style(super.getView(position, convertView, parent), false)

            override fun getDropDownView(
                position: Int,
                convertView: View?,
                parent: ViewGroup
            ): View = style(super.getDropDownView(position, convertView, parent), true)
        }.apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

        return Spinner(this, Spinner.MODE_DROPDOWN).apply {
            id = View.generateViewId()
            adapter = sourceAdapter
            visibility = View.GONE
            isFocusable = true
            isFocusableInTouchMode = false
            contentDescription = when {
                live -> "Choose Live TV source"
                episodePickerEnabled -> "Choose season, episode or playback source"
                else -> "Choose playback source"
            }

            val selectedPosition = activeSourceIndex + sourceSelectorOffset()
            setSelection(
                selectedPosition.coerceIn(0, maxOf(0, labels.lastIndex)),
                false
            )

            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onNothingSelected(parent: AdapterView<*>?) = Unit

                override fun onItemSelected(
                    parent: AdapterView<*>?,
                    view: View?,
                    position: Int,
                    id: Long
                ) {
                    if (!sourceSelectorReady) {
                        return
                    }

                    if (episodePickerEnabled && position in 0..1) {
                        finishWithResult(reason = "episode")
                        return
                    }

                    val sourcePosition = position - sourceSelectorOffset()
                    if (
                        sourcePosition !in nativeSources.indices ||
                        sourcePosition == activeSourceIndex
                    ) {
                        return
                    }

                    if (!live) {
                        finishWithResult(
                            reason = "source",
                            selectedSourceIndex = nativeSources[sourcePosition].webIndex
                        )
                        return
                    }

                    failedLiveSourceIndexes.remove(sourcePosition)
                    switchNativeSource(sourcePosition, automaticRecovery = false)
                    hideSourceSelector()
                }
            }

            post {
                sourceSelectorReady = true
            }
        }
    }

    private fun switchNativeSource(
        index: Int,
        automaticRecovery: Boolean = false
    ) {
        if (
            index !in nativeSources.indices ||
            index == activeSourceIndex ||
            resultSent ||
            compatibilityPlayerOpen
        ) {
            return
        }

        val nextUrl = nativeSources[index].url.trim()
        if (!(nextUrl.startsWith("https://") || nextUrl.startsWith("http://"))) {
            if (live) {
                failedLiveSourceIndexes.add(index)

                if (automaticRecovery) {
                    recoverLivePlayback("The next Live TV source was not playable.")
                } else {
                    finishWithResult(
                        reason = "source",
                        selectedSourceIndex = nativeSources[index].webIndex
                    )
                }
            }
            return
        }

        clearLiveWatchdogs()
        livePlaybackStarted = false
        liveRecoveryPending = false
        activeSourceIndex = index
        streamUrl = nextUrl
        genericHttpsMimeRetryIndex = 0
        restorePositionMs = 0L
        releasePlayer()
        initialisePlayer()
        sourceSpinner.setSelection(activeSourceIndex + sourceSelectorOffset(), false)

        if (automaticRecovery) {
            hideControllerNow()
        } else {
            showControllerTemporarily()
        }

        playerView.requestFocus()
    }

    private fun currentSourceHeaders(): Map<String, String> =
        nativeSources.getOrNull(activeSourceIndex)?.headers
            ?: readHeaders(payload.optJSONObject("headers"))

    private fun currentSourceMimeType(): String =
        nativeSources.getOrNull(activeSourceIndex)?.mimeType
            ?.takeIf { it.isNotBlank() }
            ?: payload.optString("mimeType").trim()

    private fun currentSourceDrm(): JSONObject? =
        nativeSources.getOrNull(activeSourceIndex)?.drm
            ?: payload.optJSONObject("drm")

    private fun initialisePlayer() {
        if (player != null || resultSent || compatibilityPlayerOpen) {
            return
        }

        val headers = currentSourceHeaders()

        val dataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent("MediaGodFireTV/1.0")

        if (headers.isNotEmpty()) {
            dataSourceFactory.setDefaultRequestProperties(headers)
        }

        val mediaSourceFactory = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(dataSourceFactory)

        val renderersFactory = DefaultRenderersFactory(this)
            .setEnableDecoderFallback(true)

        val exoPlayer = ExoPlayer.Builder(this, renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
            .setVideoChangeFrameRateStrategy(
                C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS
            )
            .build()

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        exoPlayer.setAudioAttributes(audioAttributes, true)
        exoPlayer.setHandleAudioBecomingNoisy(true)

        val preferredAudio = payload.optString("audioLanguage", "en")
        val preferredSubtitle = payload.optString("subtitleLanguage", "en")
        val subtitlesEnabled = payload.optBoolean("subtitlesEnabled", false)

        exoPlayer.trackSelectionParameters =
            exoPlayer.trackSelectionParameters
                .buildUpon()
                .setPreferredAudioLanguage(preferredAudio)
                .setPreferredAudioRoleFlags(C.ROLE_FLAG_MAIN)
                .setPreferredTextLanguage(preferredSubtitle)
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !subtitlesEnabled)
                .build()

        exoPlayer.addListener(object : Player.Listener {
            override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                var selectedFrameRate = 0f

                outer@ for (group in tracks.groups) {
                    if (group.type != C.TRACK_TYPE_VIDEO) continue
                    for (index in 0 until group.length) {
                        if (!group.isTrackSelected(index)) continue
                        val frameRate = group.getTrackFormat(index).frameRate
                        if (frameRate > 0f) {
                            selectedFrameRate = frameRate
                            break@outer
                        }
                    }
                }

                if (selectedFrameRate > 0f) {
                    DisplayRateMatcher.apply(
                        this@PlayerActivity,
                        selectedFrameRate,
                        forceDisplayMode = true
                    )
                }

                /*
                 * Manual-only audio policy: do not override tracks, pause for
                 * English validation, or launch compatibility recovery from a
                 * track-change callback. Keep Media3's current track untouched.
                 */
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

                    if (live) {
                        livePlaybackStarted = true
                        liveRecoveryPending = false
                        clearLiveWatchdogs()
                    }
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

                    if (
                        live &&
                        livePlaybackStarted &&
                        exoPlayer.playWhenReady &&
                        exoPlayer.playbackState == Player.STATE_BUFFERING
                    ) {
                        armLiveStallWatchdog()
                    }
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (live) {
                    when (playbackState) {
                        Player.STATE_BUFFERING -> {
                            if (livePlaybackStarted) {
                                armLiveStallWatchdog()
                            } else {
                                armLiveStartupWatchdog()
                            }
                        }

                        Player.STATE_READY -> {
                            if (exoPlayer.isPlaying) {
                                livePlaybackStarted = true
                                clearLiveWatchdogs()
                            }
                        }

                        Player.STATE_ENDED -> {
                            recoverLivePlayback("This Live TV stream ended.")
                        }
                    }
                    return
                }

                /*
                 * Do not infer provider failure from duration while READY.
                 * Hosted/progressive streams can report a short or sliding
                 * duration during startup even while playback is healthy.
                 * Real player errors and genuine end-of-stream remain the
                 * authoritative failure/end signals.
                 */
                if (playbackState == Player.STATE_ENDED) {
                    finishWithResult("ended")
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                if (retryUnknownHttpsSourceType(exoPlayer)) {
                    if (live) {
                        livePlaybackStarted = false
                        armLiveStartupWatchdog()
                    }
                    return
                }

                if (
                    shouldUseCompatibilityFallback(error) &&
                    launchCompatibilityPlayer(exoPlayer, error)
                ) {
                    return
                }

                if (
                    live &&
                    recoverLivePlayback(
                        error.message ?: "Native Fire TV Live TV playback failed."
                    )
                ) {
                    return
                }

                finishWithResult(
                    "error",
                    error.message ?: "Native Fire TV playback failed"
                )
            }
        })

        val mediaItem = buildMediaItem()

        player = exoPlayer
        PlaybackInstanceRegistry.onPlayerAttached()
        playerView.player = exoPlayer
        mediaSession = MediaSession.Builder(this, exoPlayer).build()

        val holdForEnglishStartup =
            strictEnglishStartupRequired()

        /*
         * Set the startup gate before prepare(). ExoPlayer may report tracks
         * immediately during preparation on local/cached HTTP files; setting
         * playWhenReady first guarantees a foreign container default can never
         * become audible in that race window.
         */
        exoPlayer.playWhenReady =
            shouldPlayWhenReady && !holdForEnglishStartup

        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()

        if (!live && restorePositionMs > 0L) {
            exoPlayer.seekTo(restorePositionMs)
        }

        if (shouldPlayWhenReady && !holdForEnglishStartup) {
            exoPlayer.play()
        } else if (holdForEnglishStartup) {
            armStrictEnglishStartupWatchdog()
        }

        if (live) {
            livePlaybackStarted = false
            armLiveStartupWatchdog()
        }

        hideControllerNow()
    }

    private fun shouldUseCompatibilityFallback(error: PlaybackException): Boolean {
        if (currentSourceDrm() != null) {
            return false
        }

        /*
         * Audio fallback is manual-only. Real audio renderer/sink errors return
         * to the web player so the viewer can choose Audio or Source instead of
         * Media God automatically replacing the decoder underneath them.
         */
        val audioFailureText =
            "${error.errorCodeName} ${error.message.orEmpty()}"
        if (
            error.errorCode in 5001..5004 ||
            Regex(
                """audio|dts|true[ ._-]?hd|mlp|atmos|e[ ._-]?ac[ ._-]?3|joc|silent|no[- ]?sound""",
                RegexOption.IGNORE_CASE
            ).containsMatchIn(audioFailureText)
        ) {
            return false
        }

        val code = error.errorCode

        return code == 3003 ||
            code in 4001..4005
    }

    private fun launchCompatibilityPlayer(
        activePlayer: ExoPlayer,
        error: PlaybackException? = null,
        compatibilityReason: String = ""
    ): Boolean {
        if (compatibilityPlayerOpen || resultSent) {
            return false
        }

        val positionMs = max(0L, activePlayer.currentPosition)
        restorePositionMs = positionMs
        shouldPlayWhenReady = activePlayer.playWhenReady || shouldPlayWhenReady

        val compatibilityPayload = try {
            JSONObject(payload.toString())
        } catch (_: Throwable) {
            JSONObject()
        }.apply {
            put("requestId", requestId)
            put("url", streamUrl)
            put("startPositionMs", positionMs)
            put("mimeType", currentSourceMimeType())
            put(
                "activeSourceIndex",
                nativeSources.getOrNull(activeSourceIndex)?.webIndex
                    ?: payload.optInt("activeSourceIndex", activeSourceIndex)
            )
            put("compatibilityErrorCode", error?.errorCode ?: 0)
            put("verifiedEnglishMain", currentVerifiedEnglishMain())
            put("preferredAudioTrackName", currentPreferredEnglishTrackName())
            put("preferredAudioTrackLanguage", currentPreferredEnglishTrackLanguage())
            put("preferredAudioTrackCodec", currentPreferredEnglishTrackCodec())
            put("preferredAudioTrackStream", currentPreferredEnglishTrackStream())
            put("compatibilityReason", compatibilityReason)
            put(
                "compatibilityError",
                error?.message.orEmpty().ifBlank { compatibilityReason }
            )
            val compatibilityText =
                compatibilityReason + " " +
                    error?.message.orEmpty() + " " +
                    payload.optString("audioCodec") + " " +
                    payload.optString("hintText")
            put(
                "compatibilityAudioRecovery",
                Regex(
                    """audio|dts|true[ ._-]?hd|mlp|atmos|e[ ._-]?ac[ ._-]?3|joc|silent|no[- ]?sound""",
                    RegexOption.IGNORE_CASE
                ).containsMatchIn(compatibilityText)
            )

            val headerJson = JSONObject()
            currentSourceHeaders().forEach { (key, value) ->
                headerJson.put(key, value)
            }
            put("headers", headerJson)
        }

        compatibilityPlayerOpen = true
        clearLiveWatchdogs()
        releasePlayer()

        return try {
            val intent = Intent(this, CompatibilityPlayerActivity::class.java).apply {
                putExtra(EXTRA_PAYLOAD, compatibilityPayload.toString())
            }

            @Suppress("DEPRECATION")
            startActivityForResult(intent, REQUEST_COMPATIBILITY_PLAYER)
            true
        } catch (_: Throwable) {
            compatibilityPlayerOpen = false
            false
        }
    }

    private data class AudioReadiness(
        val present: Boolean,
        val supported: Boolean,
        val selected: Boolean,
        val softwareFallbackPreferred: Boolean
    )

    private fun inspectAudioReadiness(
        tracks: androidx.media3.common.Tracks
    ): AudioReadiness {
        var present = false
        var supported = false
        var selected = false
        var softwareFallbackPreferred = false

        tracks.groups.forEach { group ->
            if (group.type != C.TRACK_TYPE_AUDIO) return@forEach

            for (index in 0 until group.length) {
                present = true

                if (group.isTrackSupported(index)) {
                    supported = true
                }

                if (group.isTrackSelected(index)) {
                    selected = true
                }

                val mime = group.getTrackFormat(index)
                    .sampleMimeType
                    .orEmpty()
                    .trim()
                    .lowercase()

                if (
                    group.isTrackSelected(index) &&
                    mime in setOf(
                        "audio/vnd.dts",
                        "audio/vnd.dts.hd",
                        "audio/true-hd",
                        "audio/vnd.dolby.mlp",
                        "audio/eac3-joc"
                    )
                ) {
                    softwareFallbackPreferred = true
                }
            }
        }

        return AudioReadiness(
            present = present,
            supported = supported,
            selected = selected,
            softwareFallbackPreferred = softwareFallbackPreferred
        )
    }

    private data class PreferredEnglishReadiness(
        val present: Boolean,
        val supported: Boolean,
        val selected: Boolean
    )

    private fun inspectPreferredEnglishReadiness(
        tracks: androidx.media3.common.Tracks
    ): PreferredEnglishReadiness {
        var present = false
        var supported = false
        var selected = false

        tracks.groups.forEach { group ->
            if (group.type != C.TRACK_TYPE_AUDIO) return@forEach

            for (index in 0 until group.length) {
                val format = group.getTrackFormat(index)
                if (
                    !(
                        formatLooksEnglish(format) ||
                            formatMatchesVerifiedEnglishHint(format)
                    ) ||
                    formatLooksCommentary(format)
                ) {
                    continue
                }

                present = true

                if (group.isTrackSupported(index)) {
                    supported = true
                }

                if (group.isTrackSelected(index)) {
                    selected = true
                }
            }
        }

        return PreferredEnglishReadiness(
            present = present,
            supported = supported,
            selected = selected
        )
    }

    private fun scheduleMissingAudioCheck(
        activePlayer: ExoPlayer,
        tracks: androidx.media3.common.Tracks
    ) {
        /*
         * Intentionally disabled. Audio recovery is manual-only: neither track
         * metadata nor silence heuristics may interrupt VOD playback. The
         * viewer decides whether to use Audio or Source.
         */
        @Suppress("UNUSED_VARIABLE")
        val keepManualOnly = activePlayer to tracks
    }

    private fun buildMediaItem(mimeTypeOverride: String? = null): MediaItem {
        val builder = MediaItem.Builder()
            .setUri(streamUrl)
            .setMediaId(requestId.ifBlank { streamUrl })

        val explicitMimeType =
            mimeTypeOverride?.trim().orEmpty().ifBlank {
                currentSourceMimeType()
            }

        if (explicitMimeType.isNotBlank()) {
            builder.setMimeType(explicitMimeType)
        } else {
            inferPrimaryMimeType(streamUrl)?.let(builder::setMimeType)
        }

        currentSourceDrm()?.let { drm ->
            val scheme = drm.optString("scheme", "widevine").trim().lowercase()
            val licenseUrl = drm.optString("licenseUrl").trim()

            if (scheme == "widevine" && licenseUrl.startsWith("http")) {
                val drmBuilder = MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)
                    .setLicenseUri(licenseUrl)

                val drmHeaders = readHeaders(drm.optJSONObject("headers"))
                if (drmHeaders.isNotEmpty()) {
                    drmBuilder.setLicenseRequestHeaders(drmHeaders)
                }

                builder.setDrmConfiguration(drmBuilder.build())
            }
        }

        val subtitleConfigurations = buildSubtitleConfigurations(
            payload.optJSONArray("subtitles") ?: JSONArray()
        )

        if (subtitleConfigurations.isNotEmpty()) {
            builder.setSubtitleConfigurations(subtitleConfigurations)
        }

        return builder.build()
    }

    private fun buildSubtitleConfigurations(
        subtitles: JSONArray
    ): List<MediaItem.SubtitleConfiguration> {
        val result = mutableListOf<MediaItem.SubtitleConfiguration>()

        for (index in 0 until minOf(subtitles.length(), 20)) {
            val item = subtitles.optJSONObject(index) ?: continue
            val url = item.optString("url").trim()

            if (!(url.startsWith("https://") || url.startsWith("http://"))) {
                continue
            }

            val explicitMime = item.optString("mimeType").trim()
            val mimeType = explicitMime.ifBlank { inferSubtitleMimeType(url) }

            val subtitleBuilder = MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
                .setMimeType(mimeType)

            item.optString("language").trim().takeIf { it.isNotBlank() }?.let {
                subtitleBuilder.setLanguage(it)
            }

            item.optString("label").trim().takeIf { it.isNotBlank() }?.let {
                subtitleBuilder.setLabel(it)
            }

            result.add(subtitleBuilder.build())
        }

        return result
    }

    private fun inferPrimaryMimeType(url: String): String? {
        val lower = url.substringBefore('?').substringBefore('#').lowercase()

        return when {
            lower.endsWith(".m3u8") -> MimeTypes.APPLICATION_M3U8
            lower.endsWith(".mpd") -> MimeTypes.APPLICATION_MPD
            lower.endsWith(".mp4") || lower.endsWith(".m4v") -> "video/mp4"
            lower.endsWith(".m4a") -> "audio/mp4"
            lower.endsWith(".mkv") -> "video/x-matroska"
            lower.endsWith(".mka") -> "audio/x-matroska"
            lower.endsWith(".webm") -> "video/webm"
            lower.endsWith(".ts") || lower.endsWith(".m2ts") || lower.endsWith(".mts") -> "video/mp2t"
            lower.endsWith(".avi") -> "video/x-msvideo"
            lower.endsWith(".mpg") || lower.endsWith(".mpeg") || lower.endsWith(".vob") -> "video/mpeg"
            lower.endsWith(".mp3") -> "audio/mpeg"
            lower.endsWith(".flac") -> "audio/flac"
            lower.endsWith(".ogg") || lower.endsWith(".oga") || lower.endsWith(".opus") -> "audio/ogg"
            lower.endsWith(".wav") -> "audio/wav"
            else -> null
        }
    }

    private fun retryUnknownHttpsSourceType(activePlayer: ExoPlayer): Boolean {
        if (!streamUrl.startsWith("https://")) {
            return false
        }

        val suppliedMime = currentSourceMimeType()
        if (suppliedMime.isNotBlank() || inferPrimaryMimeType(streamUrl) != null) {
            return false
        }

        val retryMimeType = when (genericHttpsMimeRetryIndex) {
            0 -> MimeTypes.APPLICATION_M3U8
            1 -> MimeTypes.APPLICATION_MPD
            else -> return false
        }

        genericHttpsMimeRetryIndex += 1

        val positionMs = max(0L, activePlayer.currentPosition)
        val resumePlayback = activePlayer.playWhenReady || shouldPlayWhenReady

        return try {
            activePlayer.stop()
            activePlayer.clearMediaItems()
            activePlayer.setMediaItem(buildMediaItem(retryMimeType))
            activePlayer.prepare()

            if (!live && positionMs > 0L) {
                activePlayer.seekTo(positionMs)
            }

            activePlayer.playWhenReady = resumePlayback
            if (resumePlayback) {
                activePlayer.play()
            }

            true
        } catch (_: Throwable) {
            false
        }
    }

    private fun inferSubtitleMimeType(url: String): String {
        val lower = url.substringBefore('?').substringBefore('#').lowercase()

        return when {
            lower.endsWith(".srt") -> MimeTypes.APPLICATION_SUBRIP
            lower.endsWith(".ass") || lower.endsWith(".ssa") -> MimeTypes.TEXT_SSA
            lower.endsWith(".ttml") || lower.endsWith(".xml") -> MimeTypes.APPLICATION_TTML
            else -> MimeTypes.TEXT_VTT
        }
    }

    private fun seekBy(deltaMs: Long) {
        val activePlayer = player ?: return

        if (live && !activePlayer.isCurrentMediaItemSeekable) {
            return
        }

        val duration = activePlayer.duration.takeIf { it > 0L } ?: Long.MAX_VALUE
        val target = (activePlayer.currentPosition + deltaMs)
            .coerceAtLeast(0L)
            .coerceAtMost(duration)

        activePlayer.seekTo(target)
        showControllerTemporarily()
    }

    private fun releasePlayer() {
        audioPresenceCheckGeneration += 1
        clearStrictEnglishStartupWatchdog()
        clearLiveWatchdogs()

        if (::playerView.isInitialized) {
            playerView.removeCallbacks(hideControllerRunnable)
        }

        val activePlayer = player ?: return

        restorePositionMs = max(0L, activePlayer.currentPosition)
        shouldPlayWhenReady = activePlayer.playWhenReady

        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        mediaSession?.release()
        mediaSession = null

        playerView.player = null
        activePlayer.release()
        player = null
        PlaybackInstanceRegistry.onPlayerReleased()
    }

    private fun finishWithResult(
        reason: String,
        message: String = "",
        selectedSourceIndex: Int = -1
    ) {
        if (resultSent) {
            return
        }

        resultSent = true
        clearLiveWatchdogs()

        val activePlayer = player
        val positionMs = max(
            0L,
            activePlayer?.currentPosition ?: restorePositionMs
        )
        val durationMs = max(
            0L,
            activePlayer?.duration?.takeIf { it > 0L } ?: 0L
        )
        val resultSourceIndex =
            if (selectedSourceIndex >= 0) {
                selectedSourceIndex
            } else if (live) {
                nativeSources.getOrNull(activeSourceIndex)?.webIndex ?: -1
            } else {
                -1
            }

        val diagnostics = NativePlaybackDiagnostics.snapshot(
            payload = payload,
            url = streamUrl,
            engine = "media3",
            event = reason,
            message = message,
            context = this
        ).toString()

        val result = Intent().apply {
            putExtra(EXTRA_REQUEST_ID, requestId)
            putExtra(EXTRA_REASON, reason)
            putExtra(EXTRA_POSITION_MS, positionMs)
            putExtra(EXTRA_DURATION_MS, durationMs)
            putExtra(EXTRA_MESSAGE, message)
            putExtra(EXTRA_DIAGNOSTICS, diagnostics)
            putExtra(EXTRA_SELECTED_SOURCE_INDEX, resultSourceIndex)
        }

        setResult(RESULT_OK, result)
        releasePlayer()
        finish()
    }

    private fun enterImmersiveMode() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
}
