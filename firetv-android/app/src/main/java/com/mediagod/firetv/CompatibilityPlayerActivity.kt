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

/**
 * Last-chance playback engine for sources that the Fire TV MediaCodec/Media3
 * path cannot decode. Normal playback still uses Media3 first. LibVLC is only
 * opened for a genuine decoder/container/audio-output incompatibility, giving
 * Media God software coverage for older and less common codecs without making
 * every stream pay the software-decoding cost.
 */
class CompatibilityPlayerActivity : Activity() {
    companion object {
        private const val CONTROLS_HIDE_DELAY_MS = 2600L
    }

    private lateinit var root: FrameLayout
    private lateinit var videoLayout: VLCVideoLayout
    private lateinit var controls: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var playPauseButton: Button

    private var libVLC: LibVLC? = null
    private var vlcPlayer: MediaPlayer? = null

    private var payload = JSONObject()
    private var requestId = ""
    private var streamUrl = ""
    private var startPositionMs = 0L
    private var pendingStartPositionMs = 0L
    private var resultSent = false
    private var selectedSourceIndex = -1

    private val hideControlsRunnable = Runnable {
        if (!resultSent && ::controls.isInitialized) {
            controls.visibility = View.GONE
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        payload = try {
            JSONObject(intent.getStringExtra(PlayerActivity.EXTRA_PAYLOAD).orEmpty())
        } catch (_: Throwable) {
            JSONObject()
        }

        requestId = payload.optString("requestId")
        streamUrl = payload.optString("url").trim()
        startPositionMs = max(0L, payload.optLong("startPositionMs", 0L))
        pendingStartPositionMs = startPositionMs
        selectedSourceIndex = payload.optInt("activeSourceIndex", -1)

        if (!isPlayableUrl(streamUrl)) {
            finishWithResult("error", "Compatibility player received an invalid stream URL.")
            return
        }

        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        enterImmersiveMode()
        buildUi()
        startCompatibilityPlayback()
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enterImmersiveMode()
        }
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            showControlsTemporarily()
        }
        return super.dispatchTouchEvent(event)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && !event.isLongPress) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> {
                    finishWithResult("back")
                    return true
                }

                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                KeyEvent.KEYCODE_HEADSETHOOK -> {
                    togglePlayback()
                    return true
                }

                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_MEDIA_REWIND -> {
                    seekBy(-10_000L)
                    return true
                }

                KeyEvent.KEYCODE_DPAD_RIGHT,
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                    seekBy(10_000L)
                    return true
                }

                KeyEvent.KEYCODE_MEDIA_PLAY -> {
                    vlcPlayer?.play()
                    updatePlayPauseLabel()
                    showControlsTemporarily()
                    return true
                }

                KeyEvent.KEYCODE_MEDIA_PAUSE,
                KeyEvent.KEYCODE_MEDIA_STOP -> {
                    vlcPlayer?.pause()
                    updatePlayPauseLabel()
                    showControlsTemporarily()
                    return true
                }

                KeyEvent.KEYCODE_MENU,
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    showControlsTemporarily()
                }
            }
        }

        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        if (::root.isInitialized) {
            root.removeCallbacks(hideControlsRunnable)
        }
        releaseCompatibilityPlayer()
        super.onDestroy()
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

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
            setBackgroundColor(Color.argb(185, 0, 0, 0))
            setPadding(dp(12), dp(7), dp(12), dp(7))
        }

        val backButton = controlButton("Back") {
            finishWithResult("back")
        }

        val rewindButton = controlButton("−10s") {
            seekBy(-10_000L)
        }

        playPauseButton = controlButton("Pause") {
            togglePlayback()
        }

        val forwardButton = controlButton("+10s") {
            seekBy(10_000L)
        }

        controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(dp(10), dp(8), dp(10), dp(8))
            setBackgroundColor(Color.argb(205, 8, 8, 8))
            addView(backButton)
            addView(rewindButton)
            addView(playPauseButton)
            addView(forwardButton)
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
                    gravity = Gravity.TOP or Gravity.START
                    topMargin = dp(18)
                    marginStart = dp(22)
                }
            )
            addView(
                controls,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                    bottomMargin = dp(24)
                }
            )
        }

        setContentView(root)
        videoLayout.requestFocus()
        showControlsTemporarily()
    }

    private fun controlButton(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.argb(210, 35, 35, 35))
            isFocusable = true
            isFocusableInTouchMode = false
            minWidth = dp(88)
            minHeight = dp(48)
            setPadding(dp(14), dp(8), dp(14), dp(8))
            setOnClickListener {
                action()
                showControlsTemporarily()
            }
        }

    private fun startCompatibilityPlayback() {
        try {
            val engine = LibVLC(
                this,
                arrayListOf(
                    "--network-caching=1800",
                    "--file-caching=1200",
                    "--live-caching=1800",
                    "--clock-jitter=0"
                )
            )
            libVLC = engine

            val player = MediaPlayer(engine)
            vlcPlayer = player
            player.attachViews(videoLayout, null, true, false)

            player.setEventListener { event ->
                root.post {
                    if (resultSent) return@post

                    when (event.type) {
                        MediaPlayer.Event.Opening -> {
                            statusText.text = "Compatibility decoder · opening"
                        }

                        MediaPlayer.Event.Buffering -> {
                            statusText.text = "Compatibility decoder · buffering"
                        }

                        MediaPlayer.Event.Playing -> {
                            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            statusText.text = "Compatibility decoder"

                            if (pendingStartPositionMs > 0L) {
                                val target = pendingStartPositionMs
                                pendingStartPositionMs = 0L
                                player.time = target
                            }

                            updatePlayPauseLabel()
                            showControlsTemporarily()
                        }

                        MediaPlayer.Event.Paused -> {
                            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            updatePlayPauseLabel()
                            showControlsTemporarily()
                        }

                        MediaPlayer.Event.EndReached -> {
                            finishWithResult("ended")
                        }

                        MediaPlayer.Event.EncounteredError -> {
                            finishWithResult(
                                "error",
                                "The compatibility decoder could not play this source."
                            )
                        }
                    }
                }
            }

            val media = Media(engine, Uri.parse(streamUrl)).apply {
                // Use device hardware when it works, but do not force it. LibVLC
                // can therefore drop to its software decoders for unsupported
                // H.26x/AV1/VPx/VC-1/MPEG/DTS/TrueHD/etc. combinations.
                setHWDecoderEnabled(true, false)
                addOption(":network-caching=1800")
                addOption(":file-caching=1200")
                addOption(":live-caching=1800")

                val headers = currentHeaders()
                headerValue(headers, "User-Agent")?.let {
                    addOption(":http-user-agent=$it")
                }
                headerValue(headers, "Referer")?.let {
                    addOption(":http-referrer=$it")
                }

                addExternalSubtitles(this, payload.optJSONArray("subtitles") ?: JSONArray())
            }

            player.media = media
            media.release()
            player.play()
        } catch (error: Throwable) {
            finishWithResult(
                "error",
                error.message ?: "Could not start the compatibility decoder."
            )
        }
    }

    private fun currentHeaders(): Map<String, String> {
        val result = linkedMapOf<String, String>()

        fun collect(json: JSONObject?) {
            if (json == null) return
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = json.optString(key).trim()
                if (key.isNotBlank() && value.isNotBlank()) {
                    result[key] = value
                }
            }
        }

        collect(payload.optJSONObject("headers"))

        val sources = payload.optJSONArray("sources") ?: JSONArray()
        for (index in 0 until sources.length()) {
            val item = sources.optJSONObject(index) ?: continue
            if (item.optString("url").trim() == streamUrl) {
                collect(item.optJSONObject("headers"))
                selectedSourceIndex = item.optInt("webIndex", selectedSourceIndex)
                break
            }
        }

        return result
    }

    private fun headerValue(headers: Map<String, String>, name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }
            ?.value
            ?.takeIf { it.isNotBlank() }

    private fun addExternalSubtitles(media: Media, subtitles: JSONArray) {
        for (index in 0 until minOf(subtitles.length(), 20)) {
            val item = subtitles.optJSONObject(index) ?: continue
            val url = item.optString("url").trim()
            if (!isPlayableUrl(url)) continue

            try {
                media.addSlave(
                    IMedia.Slave(
                        IMedia.Slave.Type.Subtitle,
                        4,
                        Uri.parse(url).toString()
                    )
                )
            } catch (_: Throwable) {
                // A bad optional subtitle must never block video playback.
            }
        }
    }

    private fun togglePlayback() {
        val player = vlcPlayer ?: return
        if (player.isPlaying) {
            player.pause()
        } else {
            player.play()
        }
        updatePlayPauseLabel()
        showControlsTemporarily()
    }

    private fun updatePlayPauseLabel() {
        if (::playPauseButton.isInitialized) {
            playPauseButton.text = if (vlcPlayer?.isPlaying == true) "Pause" else "Play"
        }
    }

    private fun seekBy(deltaMs: Long) {
        val player = vlcPlayer ?: return
        val length = player.length.takeIf { it > 0L } ?: Long.MAX_VALUE
        val target = (player.time + deltaMs)
            .coerceAtLeast(0L)
            .coerceAtMost(length)
        player.time = target
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
            try {
                player.stop()
            } catch (_: Throwable) {
            }
            try {
                player.detachViews()
            } catch (_: Throwable) {
            }
            try {
                player.release()
            } catch (_: Throwable) {
            }
        }
        vlcPlayer = null

        try {
            libVLC?.release()
        } catch (_: Throwable) {
        }
        libVLC = null
    }

    private fun finishWithResult(reason: String, message: String = "") {
        if (resultSent) return
        resultSent = true

        val player = vlcPlayer
        val positionMs = max(0L, player?.time ?: startPositionMs)
        val durationMs = max(0L, player?.length?.takeIf { it > 0L } ?: 0L)

        val result = Intent().apply {
            putExtra(PlayerActivity.EXTRA_REQUEST_ID, requestId)
            putExtra(PlayerActivity.EXTRA_REASON, reason)
            putExtra(PlayerActivity.EXTRA_POSITION_MS, positionMs)
            putExtra(PlayerActivity.EXTRA_DURATION_MS, durationMs)
            putExtra(PlayerActivity.EXTRA_MESSAGE, message)
            putExtra(PlayerActivity.EXTRA_SELECTED_SOURCE_INDEX, selectedSourceIndex)
        }

        setResult(RESULT_OK, result)
        releaseCompatibilityPlayer()
        finish()
    }

    private fun isPlayableUrl(url: String): Boolean {
        val lower = url.lowercase()
        return lower.startsWith("https://") ||
            lower.startsWith("http://") ||
            lower.startsWith("rtsp://") ||
            lower.startsWith("rtmp://")
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
