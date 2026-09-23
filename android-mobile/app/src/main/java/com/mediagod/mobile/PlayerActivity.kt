package com.mediagod.mobile

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
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

        private const val REQUEST_COMPATIBILITY_PLAYER = 8402
        private const val CONTROLLER_HIDE_DELAY_MS = 2500L
        private const val STRICT_ENGLISH_STARTUP_TIMEOUT_MS = 10000L
        private const val NEXT_EPISODE_COUNTDOWN_MS = 10000L
    }

    private lateinit var playerView: PlayerView
    private lateinit var assistControls: LinearLayout
    private lateinit var skipRecapButton: Button
    private lateinit var skipIntroButton: Button
    private lateinit var skipCreditsButton: Button
    private lateinit var playNextButton: Button
    private lateinit var cancelNextButton: Button
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    private var payload = JSONObject()
    private var requestId = ""
    private var streamUrl = ""
    private var title = ""
    private var live = false
    private var initialPositionMs = 0L
    private var restorePositionMs = 0L
    private var shouldPlayWhenReady = true
    private var resultSent = false
    private var genericHttpsMimeRetryIndex = 0
    private var compatibilityPlayerOpen = false
    private var audioPresenceCheckGeneration = 0
    private var autoNext = true
    private var recapStartMs = -1L
    private var recapEndMs = -1L
    private var introStartMs = -1L
    private var introEndMs = -1L
    private var creditsStartMs = -1L
    private var nextEpisodeCountdownStartedAtMs = -1L
    private var nextEpisodeCountdownCancelled = false

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
        val activeWebIndex = payload.optInt("activeSourceIndex", 0)

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

    private val updateAssistControlsRunnable = object : Runnable {
        override fun run() {
            if (resultSent || !::playerView.isInitialized) return
            updateAssistControls()
            playerView.postDelayed(this, 500L)
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
        autoNext = payload.optBoolean("autoNext", true)
        recapStartMs = payloadMarkerMs("recapStart")
        recapEndMs = payloadMarkerMs("recapEnd")
        introStartMs = payloadMarkerMs("introStart")
        introEndMs = payloadMarkerMs("introEnd")
        creditsStartMs = payloadMarkerMs("creditsStart")
        initialPositionMs = max(0L, payload.optLong("startPositionMs", 0L))
        restorePositionMs = initialPositionMs

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
            forceDisplayMode = false
        )

        playerView = PlayerView(this).apply {
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

        assistControls = buildAssistControls()

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
                assistControls,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.BOTTOM or Gravity.END
                    bottomMargin = dp(24)
                    marginEnd = dp(16)
                }
            )
        }

        setContentView(root)
        playerView.requestFocus()
        playerView.post(updateAssistControlsRunnable)
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
    }

    override fun onPause() {
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
        if (::playerView.isInitialized) {
            playerView.removeCallbacks(hideControllerRunnable)
            playerView.removeCallbacks(updateAssistControlsRunnable)
        }
        DisplayRateMatcher.clear(this)
        releasePlayer()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enterImmersiveMode()
            showControllerTemporarily()
        }
    }

    @Deprecated("Deprecated in Android; retained for broad Android compatibility")
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
        }

        setResult(RESULT_OK, forwarded)
        finish()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && !event.isLongPress) {
            val activePlayer = player

            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> {
                    finishWithResult("back")
                    return true
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

    private fun initialisePlayer() {
        if (player != null || resultSent || compatibilityPlayerOpen) {
            return
        }

        val headers = mutableMapOf<String, String>()
        val headerJson = payload.optJSONObject("headers")
        if (headerJson != null) {
            val keys = headerJson.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = headerJson.optString(key)
                if (key.isNotBlank() && value.isNotBlank()) {
                    headers[key] = value
                }
            }
        }

        val dataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent("MediaGodMobile/1.0")

        if (headers.isNotEmpty()) {
            dataSourceFactory.setDefaultRequestProperties(headers)
        }

        val mediaSourceFactory = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(dataSourceFactory)

        /*
         * Prefer the device's hardware decoder. Media3 may fall back to another
         * device decoder first; if the platform genuinely cannot decode the
         * source, onPlayerError opens Media God's broad LibVLC safety net.
         */
        val renderersFactory = DefaultRenderersFactory(this)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)

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
                        forceDisplayMode = false
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

                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
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
                    return
                }

                if (
                    shouldUseCompatibilityFallback(error) &&
                    launchCompatibilityPlayer(exoPlayer, error)
                ) {
                    return
                }

                finishWithResult(
                    "error",
                    error.message ?: "Native Android playback failed"
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

        showControllerTemporarily()
    }

    private fun shouldUseCompatibilityFallback(error: PlaybackException): Boolean {
        if (payload.optJSONObject("drm") != null) {
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
            put("compatibilityErrorCode", error?.errorCode ?: 0)
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
        }

        compatibilityPlayerOpen = true
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
                payload.optString("mimeType").trim()
            }

        if (explicitMimeType.isNotBlank()) {
            builder.setMimeType(explicitMimeType)
        } else {
            inferPrimaryMimeType(streamUrl)?.let(builder::setMimeType)
        }

        payload.optJSONObject("drm")?.let { drm ->
            val scheme = drm.optString("scheme", "widevine").trim().lowercase()
            val licenseUrl = drm.optString("licenseUrl").trim()

            if (scheme == "widevine" && licenseUrl.startsWith("http")) {
                val drmBuilder = MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)
                    .setLicenseUri(licenseUrl)

                val drmHeaders = mutableMapOf<String, String>()
                drm.optJSONObject("headers")?.let { headerJson ->
                    val keys = headerJson.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        val value = headerJson.optString(key).trim()
                        if (key.isNotBlank() && value.isNotBlank()) {
                            drmHeaders[key] = value
                        }
                    }
                }

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

        val suppliedMime = payload.optString("mimeType").trim()
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

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    private fun payloadMarkerMs(key: String): Long {
        val value = payload.optDouble(key, -1.0)
        if (!value.isFinite() || value < 0.0) return -1L
        return if (value >= 10_000.0) {
            value.toLong().coerceAtLeast(0L)
        } else {
            (value * 1000.0).toLong().coerceAtLeast(0L)
        }
    }

    private fun isTvEpisode(): Boolean =
        !live &&
            (
                payload.optString("mediaType").equals("tv", ignoreCase = true) ||
                    payload.optString("mediaType").equals("series", ignoreCase = true) ||
                    payload.optInt("season", 0) > 0 ||
                    payload.optInt("episode", 0) > 0
            )

    private fun buildAssistButton(label: String, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 13f
            minHeight = dp(48)
            minWidth = dp(108)
            setPadding(dp(10), 0, dp(10), 0)
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.argb(220, 20, 20, 20))
            visibility = View.GONE
            isFocusable = true
            isFocusableInTouchMode = true
            setOnClickListener { onClick() }
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
                val mediaDuration = activePlayer.duration.takeIf { it > 0L } ?: return@buildAssistButton
                seekAssistTo(maxOf(0L, mediaDuration - 750L))
            }
        }

        playNextButton = buildAssistButton("Next episode") {
            finishWithResult("next")
        }

        cancelNextButton = buildAssistButton("Stay here") {
            nextEpisodeCountdownCancelled = true
            nextEpisodeCountdownStartedAtMs = -1L
            updateAssistControls()
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(3), dp(4), dp(3))
            setBackgroundColor(Color.argb(170, 0, 0, 0))
            visibility = View.GONE
            addView(skipRecapButton)
            addView(skipIntroButton)
            addView(skipCreditsButton)
            addView(playNextButton)
            addView(cancelNextButton)
        }
    }

    private fun setAssistVisible(button: Button, visible: Boolean) {
        button.visibility = if (visible) View.VISIBLE else View.GONE
    }

    private fun seekAssistTo(targetMs: Long) {
        val activePlayer = player ?: return
        if (live && !activePlayer.isCurrentMediaItemSeekable) return
        val mediaDuration = activePlayer.duration.takeIf { it > 0L } ?: Long.MAX_VALUE
        activePlayer.seekTo(targetMs.coerceAtLeast(0L).coerceAtMost(mediaDuration))
        activePlayer.play()
        showControllerTemporarily()
    }

    private fun updateAssistControls() {
        if (resultSent || !::assistControls.isInitialized || live) {
            if (::assistControls.isInitialized) assistControls.visibility = View.GONE
            return
        }

        val activePlayer = player ?: run {
            assistControls.visibility = View.GONE
            return
        }

        val position = maxOf(0L, activePlayer.currentPosition)
        val mediaDuration = activePlayer.duration.takeIf { it > 0L } ?: 0L
        val remaining = if (mediaDuration > 0L) maxOf(0L, mediaDuration - position) else Long.MAX_VALUE
        val tvEpisode = isTvEpisode()
        val playingNow = activePlayer.isPlaying
        val episodeNumber = payload.optInt("episode", 0).coerceAtLeast(0)
        val nextEpisodeKnown =
            payload.has("nextEpisodeAvailable") &&
                !payload.isNull("nextEpisodeAvailable")
        val hasNextEpisode =
            !nextEpisodeKnown ||
                payload.optBoolean("nextEpisodeAvailable", true)
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
                (mediaDuration <= 0L || remaining > 180_000L)
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
                (mediaDuration <= 0L || remaining > 120_000L)
        val introVisible = !recapVisible && (exactIntro || fallbackIntro)

        val creditsFallbackWindow =
            if (tvEpisode) {
                if (mediaDuration > 0L) {
                    minOf(90_000L, maxOf(45_000L, (mediaDuration * 0.04).toLong()))
                } else 0L
            } else {
                if (mediaDuration > 0L) {
                    minOf(180_000L, maxOf(90_000L, (mediaDuration * 0.05).toLong()))
                } else 0L
            }

        val exactCredits =
            mediaDuration >= 300_000L &&
                creditsStartMs > 0L &&
                position >= creditsStartMs &&
                position < mediaDuration - 500L
        val fallbackCredits =
            mediaDuration >= 300_000L &&
                creditsStartMs <= 0L &&
                position > (mediaDuration * 0.70).toLong() &&
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
                mediaDuration >= 180_000L &&
                position >= 60_000L &&
                (exactCredits || remaining <= 60_000L)
        setAssistVisible(playNextButton, nextEpisodeWindow)

        val countdownWindow =
            tvEpisode &&
                hasNextEpisode &&
                mediaDuration >= 180_000L &&
                position >= 60_000L &&
                (
                    (exactCredits && remaining <= 75_000L) ||
                        remaining <= 20_000L
                )

        if (autoNext && countdownWindow && playingNow && !nextEpisodeCountdownCancelled) {
            if (nextEpisodeCountdownStartedAtMs < 0L) {
                nextEpisodeCountdownStartedAtMs = android.os.SystemClock.elapsedRealtime()
            }
            val elapsed = android.os.SystemClock.elapsedRealtime() - nextEpisodeCountdownStartedAtMs
            val left = NEXT_EPISODE_COUNTDOWN_MS - elapsed
            if (left <= 0L) {
                nextEpisodeCountdownCancelled = true
                nextEpisodeCountdownStartedAtMs = -1L
                finishWithResult("next")
                return
            }
            val seconds = maxOf(1L, (left + 999L) / 1000L)
            playNextButton.text = "Next episode in ${seconds}s"
            setAssistVisible(cancelNextButton, true)
        } else {
            if (!countdownWindow || !playingNow || !autoNext) {
                nextEpisodeCountdownStartedAtMs = -1L
            }
            playNextButton.text = "Next episode"
            setAssistVisible(cancelNextButton, false)
        }

        assistControls.visibility =
            if (
                skipRecapButton.visibility == View.VISIBLE ||
                    skipIntroButton.visibility == View.VISIBLE ||
                    skipCreditsButton.visibility == View.VISIBLE ||
                    playNextButton.visibility == View.VISIBLE ||
                    cancelNextButton.visibility == View.VISIBLE
            ) View.VISIBLE else View.GONE
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

    private fun finishWithResult(reason: String, message: String = "") {
        if (resultSent) {
            return
        }

        resultSent = true

        val activePlayer = player
        val positionMs = max(
            0L,
            activePlayer?.currentPosition ?: restorePositionMs
        )
        val durationMs = max(
            0L,
            activePlayer?.duration?.takeIf { it > 0L } ?: 0L
        )

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
