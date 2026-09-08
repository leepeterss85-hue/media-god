package com.mediagod.firetv

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

        playerView = PlayerView(this).apply {
            setBackgroundColor(Color.BLACK)
            useController = true
            controllerAutoShow = true
            controllerHideOnTouch = false
            controllerShowTimeoutMs = 5000
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
        initialisePlayer()
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
        releasePlayer()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enterImmersiveMode()
            playerView.showController()
        }
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
                        playerView.showController()
                    }
                    return true
                }

                KeyEvent.KEYCODE_MEDIA_PLAY -> {
                    activePlayer?.play()
                    playerView.showController()
                    return true
                }

                KeyEvent.KEYCODE_MEDIA_PAUSE,
                KeyEvent.KEYCODE_MEDIA_STOP -> {
                    activePlayer?.pause()
                    playerView.showController()
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

    private fun initialisePlayer() {
        if (player != null || resultSent) {
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
            .setUserAgent("MediaGodFireTV/1.0")

        if (headers.isNotEmpty()) {
            dataSourceFactory.setDefaultRequestProperties(headers)
        }

        val mediaSourceFactory = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(dataSourceFactory)

        /*
         * Fire TV models expose different hardware decoders and HDMI
         * passthrough combinations. Let Media3 fall back to another decoder
         * when the preferred one rejects a stream instead of immediately
         * returning the source to the web player. This materially helps HEVC,
         * AV1, VP9, MPEG-2, AC3/EAC3 and model-dependent DTS playback.
         */
        val renderersFactory = DefaultRenderersFactory(this)
            .setEnableDecoderFallback(true)

        val exoPlayer = ExoPlayer.Builder(this, renderersFactory)
            .setMediaSourceFactory(mediaSourceFactory)
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

        playerView.showController()
    }

    private fun buildMediaItem(): MediaItem {
        val builder = MediaItem.Builder()
            .setUri(streamUrl)
            .setMediaId(requestId.ifBlank { streamUrl })

        inferPrimaryMimeType(streamUrl)?.let(builder::setMimeType)

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
            else -> null
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
        playerView.showController()
    }

    private fun releasePlayer() {
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

        val result = Intent().apply {
            putExtra(EXTRA_REQUEST_ID, requestId)
            putExtra(EXTRA_REASON, reason)
            putExtra(EXTRA_POSITION_MS, positionMs)
            putExtra(EXTRA_DURATION_MS, durationMs)
            putExtra(EXTRA_MESSAGE, message)
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
