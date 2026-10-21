package com.mediagod.mobile

import android.net.Uri
import androidx.fragment.app.FragmentActivity
import androidx.mediarouter.app.MediaRouteChooserDialogFragment
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage
import org.json.JSONObject

/**
 * Android WebView is not a Google Cast sender. Use the native Cast SDK and a
 * real Cast route chooser rather than WebView's audio-only Remote Playback.
 * The receiver downloads video itself; native decoding/LibVLC cannot make
 * an unsupported MKV/HEVC video format playable on a Chromecast.
 */
internal class MediaGodCastManager(
    private val activity: FragmentActivity,
    private val status: (String, String) -> Unit,
) {
    private val castContext: CastContext? =
        runCatching { CastContext.getSharedInstance(activity) }.getOrNull()
    private var pendingMedia: JSONObject? = null
    private var observedClient: RemoteMediaClient? = null
    private val playbackCallback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() {
            val mediaStatus = observedClient?.mediaStatus ?: return
            when {
                mediaStatus.playerState == MediaStatus.PLAYER_STATE_PLAYING ->
                    status("playing", "Video is casting to the selected screen.")
                mediaStatus.playerState == MediaStatus.PLAYER_STATE_BUFFERING ->
                    status("connecting", "The Cast receiver is buffering video…")
                mediaStatus.playerState == MediaStatus.PLAYER_STATE_IDLE &&
                    mediaStatus.idleReason == MediaStatus.IDLE_REASON_ERROR ->
                    status("error", "The receiver could not play this video. Select a compatible H.264 MP4 or HLS source.")
            }
        }
    }

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) {
            status("connecting", "Connecting to Cast receiver…")
        }
        override fun onSessionStarted(session: CastSession, sessionId: String) {
            loadPendingVideo(session)
        }
        override fun onSessionStartFailed(session: CastSession, error: Int) {
            pendingMedia = null
            status("error", "Could not connect to the Cast receiver.")
        }
        override fun onSessionEnding(session: CastSession) = Unit
        override fun onSessionEnded(session: CastSession, error: Int) {
            detachMedia()
            pendingMedia = null
            status("disconnected", "")
        }
        override fun onSessionResuming(session: CastSession, sessionId: String) = Unit
        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
            if (pendingMedia != null) loadPendingVideo(session)
        }
        override fun onSessionResumeFailed(session: CastSession, error: Int) {
            status("error", "Cast session could not be resumed.")
        }
        override fun onSessionSuspended(session: CastSession, reason: Int) {
            status("connecting", "Cast connection interrupted…")
        }
    }

    init {
        runCatching {
            castContext?.sessionManager?.addSessionManagerListener(
                sessionListener, CastSession::class.java
            )
        }
    }

    fun start(raw: String): Boolean {
        val request = runCatching { JSONObject(raw) }.getOrNull() ?: return false
        val url = request.optString("url").trim()
        val contentType = request.optString("contentType").lowercase().trim()
        val uri = runCatching { Uri.parse(url) }.getOrNull()
        if (uri == null || (uri.scheme != "https" && uri.scheme != "http") ||
            url.length > 8192 || castContext == null ||
            contentType !in setOf("video/mp4", "video/webm", "application/x-mpegurl", "application/dash+xml")
        ) {
            status("error", "Choose a direct MP4 or HLS video to cast.")
            return false
        }
        // Only the site's existing JavaScript bridge may submit a Cast request.
        activity.runOnUiThread {
            val current = castContext.sessionManager.currentCastSession
            pendingMedia = request
            if (current?.isConnected == true) {
                loadPendingVideo(current)
            } else {
                status("connecting", "Select your Chromecast or Google TV device…")
                runCatching {
                    val chooser = MediaRouteChooserDialogFragment()
                    chooser.routeSelector = castContext?.mergedSelector
                        ?: throw IllegalStateException("No Cast routes available")
                    chooser.show(activity.supportFragmentManager, "media-god-cast-route")
                }.onFailure {
                    pendingMedia = null
                    status("error", "Could not open the Cast device chooser.")
                }
            }
        }
        return true
    }

    private fun loadPendingVideo(session: CastSession) {
        val request = pendingMedia ?: return
        pendingMedia = null
        val client = session.remoteMediaClient
        if (client == null) {
            status("error", "The receiver has no video playback service.")
            return
        }
        detachMedia()
        observedClient = client
        client.registerCallback(playbackCallback)
        try {
            val title = request.optString("title", "Media God").take(150)
            val poster = request.optString("poster")
            val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE)
            metadata.putString(MediaMetadata.KEY_TITLE, title)
            if (poster.startsWith("https://")) {
                metadata.addImage(WebImage(Uri.parse(poster)))
            }
            val mediaInfo = MediaInfo.Builder(request.getString("url"))
                .setContentType(request.getString("contentType"))
                .setStreamType(
                    if (request.optBoolean("live")) MediaInfo.STREAM_TYPE_LIVE
                    else MediaInfo.STREAM_TYPE_BUFFERED
                )
                .setMetadata(metadata)
                .build()
            val startSeconds = request.optDouble("startTime", 0.0)
            val startPositionMs = if (!request.optBoolean("live") && startSeconds.isFinite()) {
                (startSeconds.coerceIn(0.0, 86400.0) * 1000).toLong()
            } else 0L
            val loadRequest = MediaLoadRequestData.Builder()
                .setMediaInfo(mediaInfo)
                .setAutoplay(true)
                .setCurrentTime(startPositionMs)
                .build()
            status("connecting", "Loading video on the Cast receiver…")
            client.load(loadRequest).setResultCallback { result ->
                if (!result.status.isSuccess) {
                    status("error", "Cast could not load this video. Try a direct H.264 MP4 or HLS source.")
                }
            }
        } catch (_: Throwable) {
            status("error", "Could not send the selected video to the receiver.")
        }
    }

    private fun detachMedia() {
        observedClient?.unregisterCallback(playbackCallback)
        observedClient = null
    }

    fun close() {
        detachMedia()
        runCatching {
            castContext?.sessionManager?.removeSessionManagerListener(
                sessionListener, CastSession::class.java
            )
        }
    }
}
