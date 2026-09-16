package com.mediagod.firetv

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
    private var initialPositionMs = 0L
    private var restorePositionMs = 0L
    private var shouldPlayWhenReady = true
    private var resultSent = false
    private var genericHttpsMimeRetryIndex = 0
    private var compatibilityPlayerOpen = false

    private val failedLiveSourceIndexes = linkedSetOf<Int>()
    private var livePlaybackStarted = false
    private var liveRecoveryPending = false

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
                    if (sourceSelectorAvailable() && !sourceSpinner.hasFocus()) {
                        showSourceSelector()
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
        val subtitlesEnabled = payload.optBoolean("subtitlesEnabled", true)

        exoPlayer.trackSelectionParameters =
            exoPlayer.trackSelectionParameters
                .buildUpon()
                .setPreferredAudioLanguage(preferredAudio)
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
        playerView.player = exoPlayer
        mediaSession = MediaSession.Builder(this, exoPlayer).build()

        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()

        if (!live && restorePositionMs > 0L) {
            exoPlayer.seekTo(restorePositionMs)
        }

        exoPlayer.playWhenReady = shouldPlayWhenReady
        if (shouldPlayWhenReady) {
            exoPlayer.play()
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

        val code = error.errorCode

        return code == 3003 ||
            code in 4001..4005 ||
            code in 5001..5004
    }

    private fun launchCompatibilityPlayer(
        activePlayer: ExoPlayer,
        error: PlaybackException
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
            put("compatibilityErrorCode", error.errorCode)
            put("compatibilityError", error.message.orEmpty())

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
