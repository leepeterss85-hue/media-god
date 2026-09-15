package com.mediagod.mobile

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
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
    }

    private lateinit var playerView: PlayerView
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

    private val hideControllerRunnable = Runnable {
        if (!resultSent && ::playerView.isInitialized) {
            playerView.hideController()
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

        setContentView(playerView)
        playerView.requestFocus()
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
        super.onPause()
    }

    override fun onStop() {
        releasePlayer()
        super.onStop()
    }

    override fun onDestroy() {
        if (::playerView.isInitialized) {
            playerView.removeCallbacks(hideControllerRunnable)
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
                        forceDisplayMode = false
                    )
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
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

        showControllerTemporarily()
    }

    private fun shouldUseCompatibilityFallback(error: PlaybackException): Boolean {
        if (payload.optJSONObject("drm") != null) {
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
            put("compatibilityErrorCode", error.errorCode)
            put("compatibilityError", error.message.orEmpty())
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
