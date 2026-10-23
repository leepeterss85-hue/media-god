package com.mediagod.firetv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.BroadcastReceiver
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import android.graphics.Bitmap
import android.graphics.Color
import android.media.MediaCodecList
import android.media.AudioManager
import android.os.Build
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.lang.ref.WeakReference

class MainActivity : Activity() {
    companion object {
        private const val REQUEST_NATIVE_PLAYER = 8401
        private const val REQUEST_VOICE_SEARCH = 8402
        private var activeActivity: WeakReference<MainActivity>? = null

        /**
         * Read the actual source dropdown when the native player is opened.
         * Discovery may add torrents after the initial one-URL handoff; the
         * WebView retains that complete list while Media3/LibVLC owns video.
         */
        fun fetchCurrentSourceChoices(requestId: String, onResult: (JSONArray?) -> Unit) {
            val activity = activeActivity?.get()
            if (activity == null) {
                onResult(null)
                return
            }
            activity.runOnUiThread {
                if (activity.activeNativeRequestId != requestId || !activity.playerOpen) {
                    onResult(null)
                    return@runOnUiThread
                }
                var delivered = false
                fun deliver(choices: JSONArray?) {
                    if (delivered) return
                    delivered = true
                    onResult(choices?.takeIf { it.length() > 0 })
                }
                // A paused WebView can be slow to answer. Keep Sources usable
                // with the launch-time snapshot if JavaScript does not reply.
                activity.webView.postDelayed({ deliver(null) }, 900L)
                try {
                activity.webView.evaluateJavascript(
                    """(function(){
                      var select=document.querySelector('select[aria-label="Choose from all playback sources"]');
                      if(!select)return [];
                      return Array.from(select.options).filter(function(option){
                        return /^\d+$/.test(option.value) && !option.disabled;
                      }).slice(0,500).map(function(option){
                        return {webIndex:Number(option.value),label:String(option.textContent||"").trim().slice(0,110)};
                      });
                    })()""".trimIndent()
                ) { raw ->
                    val parsed = runCatching { JSONTokener(raw).nextValue() }.getOrNull()
                    val choices = when (parsed) {
                        is JSONArray -> parsed
                        is String -> runCatching { JSONArray(parsed) }.getOrNull()
                        else -> null
                    }
                    deliver(choices)
                }
                } catch (_: Throwable) {
                    deliver(null)
                }
            }
        }
    }

    private lateinit var webView: WebView
    private val embeddedPlayerRemote by lazy { EmbeddedPlayerRemote(webView) { nativeBridgeAllowed() } }
    private val nativePlayerLock = Any()
    @Volatile private var playerOpen = false
    @Volatile private var activeNativeRequestId = ""
    private var pendingNativeResultScript: String? = null
    private lateinit var appUpdater: AppUpdater
    @Volatile private var currentTopLevelUrl = ""

    private var nativeProgressReceiverRegistered = false
    private val nativeProgressReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != "$packageName.NATIVE_PLAYBACK_PROGRESS" || !playerOpen ||
                activeNativeRequestId.isBlank() || intent.getStringExtra("requestId") != activeNativeRequestId) return
            val durationMs = intent.getLongExtra("durationMs", 0L)
            if (durationMs <= 0L) return
            val detail = JSONObject().apply {
                put("requestId", activeNativeRequestId)
                put("tmdbId", intent.getLongExtra("tmdbId", 0L))
                put("season", intent.getIntExtra("season", 0))
                put("episode", intent.getIntExtra("episode", 0))
                put("positionSeconds", intent.getLongExtra("positionMs", 0L).coerceAtLeast(0L) / 1000.0)
                put("durationSeconds", durationMs / 1000.0)
            }
            dispatchJavascript("window.dispatchEvent(new CustomEvent('mg:native-playback-progress',{detail:JSON.parse(${JSONObject.quote(detail.toString())})}));")
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ContextCompat.registerReceiver(this, nativeProgressReceiver,
            IntentFilter("$packageName.NATIVE_PLAYBACK_PROGRESS"), ContextCompat.RECEIVER_NOT_EXPORTED)
        nativeProgressReceiverRegistered = true

        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        enterImmersiveMode()

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            setOnLongClickListener { true }

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                useWideViewPort = true
                loadWithOverviewMode = false
                builtInZoomControls = false
                displayZoomControls = false
                setSupportZoom(false)
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                userAgentString =
                    "${userAgentString} MediaGodFireTV/1.0 AmazonWebAppPlatform FireTV"
            }

            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(
                    view: WebView?,
                    url: String?,
                    favicon: Bitmap?
                ) {
                    embeddedPlayerRemote.enabled = false
                    currentTopLevelUrl = url.orEmpty()
                    super.onPageStarted(view, url, favicon)
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    currentTopLevelUrl = url.orEmpty()
                    super.onPageFinished(view, url)
                    injectFireTvBootstrap()
                    requestFocus()
                }
            }

            addJavascriptInterface(NativeBridge(), "MediaGodNative")
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        setContentView(webView)
        activeActivity = WeakReference(this)

        appUpdater = AppUpdater(this) { detail ->
            dispatchJavascript(
                "window.dispatchEvent(new CustomEvent('mg:fire-tv-update-status',{detail:JSON.parse(${JSONObject.quote(detail.toString())})}));"
            )
        }

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.MEDIA_GOD_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }

        webView.requestFocus()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
        webView.onResume()
        webView.resumeTimers()
        injectFireTvBootstrap()

        pendingNativeResultScript?.let { script ->
            pendingNativeResultScript = null
            dispatchJavascript(script)
        }

        if (::appUpdater.isInitialized) {
            appUpdater.onResume()
        }
    }

    override fun onPause() {
        if (::appUpdater.isInitialized) {
            appUpdater.onHostPaused()
        }
        webView.onPause()
        // Native owns all video/audio. Keep metadata/source prefetch timers
        // alive while that player is open so episode controls can arrive late.
        if (!playerOpen) webView.pauseTimers()
        super.onPause()
    }

    override fun onDestroy() {
        if (nativeProgressReceiverRegistered) {
            runCatching { unregisterReceiver(nativeProgressReceiver) }
            nativeProgressReceiverRegistered = false
        }
        if (activeActivity?.get() === this) activeActivity = null
        try {
            webView.apply {
                loadUrl("about:blank")
                stopLoading()
                clearHistory()
                removeJavascriptInterface("MediaGodNative")
                destroy()
            }
        } catch (_: Throwable) {
            // Best-effort WebView teardown.
        }
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enterImmersiveMode()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (::webView.isInitialized && !playerOpen && embeddedPlayerRemote.dispatchKeyEvent(event)) {
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            val url = webView.url.orEmpty()
            val publicAuthScreen =
                url.contains("/login") ||
                    url.contains("/register") ||
                    url.contains("/forgot-password") ||
                    url.contains("/reset-password")

            if (publicAuthScreen) {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
                return true
            }

            dispatchJavascript(
                "window.dispatchEvent(new CustomEvent('mg:native-back'));"
            )
            return true
        }

        return super.onKeyDown(keyCode, event)
    }

    @Deprecated("Deprecated in Android; retained for Fire OS compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == REQUEST_VOICE_SEARCH) {
            val spoken = if (resultCode == RESULT_OK) {
                data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)
                    ?.firstOrNull().orEmpty()
            } else ""
            val detail = JSONObject().apply {
                put("text", spoken)
                if (spoken.isBlank()) put("error", "cancelled")
            }
            dispatchJavascript(
                "window.dispatchEvent(new CustomEvent('mg:voice-search-result',{detail:JSON.parse(${JSONObject.quote(detail.toString())})}));"
            )
            return
        }

        if (requestCode != REQUEST_NATIVE_PLAYER) {
            return
        }

        val expectedRequestId = synchronized(nativePlayerLock) {
            val value = activeNativeRequestId
            playerOpen = false
            activeNativeRequestId = ""
            value
        }

        val returnedRequestId =
            data?.getStringExtra(PlayerActivity.EXTRA_REQUEST_ID).orEmpty().ifBlank {
                expectedRequestId
            }
        val reason =
            data?.getStringExtra(PlayerActivity.EXTRA_REASON) ?: "back"

        val result = JSONObject().apply {
            put("requestId", returnedRequestId)
            put("reason", reason)
            put("positionMs", data?.getLongExtra(PlayerActivity.EXTRA_POSITION_MS, 0L) ?: 0L)
            put("durationMs", data?.getLongExtra(PlayerActivity.EXTRA_DURATION_MS, 0L) ?: 0L)
            put("autoNextCancelled", data?.getBooleanExtra(PlayerActivity.EXTRA_AUTO_NEXT_CANCELLED, false) ?: false)
            put("message", data?.getStringExtra(PlayerActivity.EXTRA_MESSAGE).orEmpty())
            val diagnosticsText =
                data?.getStringExtra(PlayerActivity.EXTRA_DIAGNOSTICS).orEmpty()
            if (diagnosticsText.isNotBlank()) {
                try {
                    put("diagnostics", JSONObject(diagnosticsText))
                } catch (_: Throwable) {
                    put("diagnostics", diagnosticsText)
                }
            }
            put(
                "selectedSourceIndex",
                data?.getIntExtra(PlayerActivity.EXTRA_SELECTED_SOURCE_INDEX, -1) ?: -1
            )
        }

        val episodePickerScript =
            if (reason.equals("episode", ignoreCase = true)) {
                val pickerKey = JSONObject.quote("episode:$returnedRequestId")
                """
                (function(){
                  var key=$pickerKey;
                  if(window.__MG_NATIVE_EPISODE_PICKER_KEY__===key){return;}
                  window.__MG_NATIVE_EPISODE_PICKER_KEY__=key;
                  window.dispatchEvent(new CustomEvent('mg:choose-episode'));
                })();
                """.trimIndent()
            } else {
                ""
            }

        val resultScript =
            "window.dispatchEvent(new CustomEvent('mg:native-player-result',{detail:JSON.parse(${JSONObject.quote(result.toString())})}));$episodePickerScript"

        /*
         * Fire OS devices do not all order onActivityResult/onResume in the
         * same way. Dispatch now and also keep the same event queued for
         * onResume. If the immediate dispatch succeeds, the duplicate resume
         * event is harmless because the web player has already cleared the
         * matching request id. The episode-picker bridge is also guarded by
         * the request id so it opens only once.
         */
        pendingNativeResultScript = resultScript
        dispatchJavascript(resultScript)
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

    private fun injectFireTvBootstrap() {
        if (!::webView.isInitialized) return

        dispatchJavascript(
            """
            (function(){
              try {
                var html=document.documentElement;
                var body=document.body;
                html.classList.add('mg-fire-tv','mg-fire-tv-stable','mg-tv-remote','mg-native-fire-tv');
                if(body){body.classList.add('mg-fire-tv','mg-fire-tv-stable','mg-tv-remote','mg-native-fire-tv');}
                var meta=document.querySelector('meta[name="viewport"]');
                if(!meta){meta=document.createElement('meta');meta.name='viewport';document.head.appendChild(meta);}
                meta.setAttribute('content','width=960, height=540, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');

                /*
                 * Some Android WebView builds keep the old hardware video layer
                 * alive for one render after a source switch. Retire every
                 * superseded surface before paint so poster and video layers
                 * can never shrink into a side-by-side pair.
                 */
                if(!window.__MG_SINGLE_VIDEO_SURFACE_GUARD__){
                  window.__MG_SINGLE_VIDEO_SURFACE_GUARD__=true;
                  var singleSurfaceQueued=false;
                  /* Cast can insert extra media elements and a source
                   * switch can briefly leave old and new videos in the DOM.
                   * DOM order is NOT playback ownership. The former guard
                   * always kept the last <video> and deleted src from every
                   * other video, including an actively playing real movie.
                   * That produced audio-with-black-picture regressions.
                   *
                   * Never delete a video's URL or force video CSS layout.
                   * Only hide clearly paused, superseded videos when an
                   * actual active stage video has been identified.
                   */
                  var restorePlaybackSurface=function(video){
                    if(!video){return;}
                    video.removeAttribute('data-mg-playback-retired');
                    video.style.removeProperty('display');
                    video.style.removeProperty('visibility');
                    video.style.removeProperty('pointer-events');
                  };
                  var enforceSinglePlaybackSurface=function(){
                    singleSurfaceQueued=false;
                    var stages=Array.prototype.slice.call(
                      document.querySelectorAll('[data-mg-player-stage="true"]')
                    );
                    stages.forEach(function(stage){
                      var videos=Array.prototype.slice.call(stage.querySelectorAll('video'));
                      if(videos.length<2){
                        videos.forEach(restorePlaybackSurface);
                        return;
                      }
                      var active=videos.filter(function(video){
                        return !video.paused && !video.ended &&
                          !!(video.currentSrc || video.getAttribute('src'));
                      });
                      // Ambiguous ownership? Do nothing. Never retire a
                      // video merely because a Cast overlay was inserted.
                      if(active.length!==1){
                        videos.forEach(restorePlaybackSurface);
                        return;
                      }
                      var keep=active[0];
                      videos.forEach(function(video){
                        if(video===keep || !video.paused){
                          restorePlaybackSurface(video);
                          return;
                        }
                        video.setAttribute('data-mg-playback-retired','true');
                        video.style.setProperty('display','none','important');
                        video.style.setProperty('visibility','hidden','important');
                        video.style.setProperty('pointer-events','none','important');
                      });
                    });
                  };
                  var queueSinglePlaybackSurfaceGuard=function(){
                    if(singleSurfaceQueued){return;}
                    singleSurfaceQueued=true;
                    Promise.resolve().then(enforceSinglePlaybackSurface);
                  };
                  if(document.body){
                    new MutationObserver(queueSinglePlaybackSurfaceGuard).observe(
                      document.body,
                      {childList:true,subtree:true,attributes:true,attributeFilter:['src','poster']}
                    );
                  }
                  document.addEventListener('play',queueSinglePlaybackSurfaceGuard,true);
                  window.addEventListener('mg:player-visibility',queueSinglePlaybackSurfaceGuard);
                  queueSinglePlaybackSurfaceGuard();
                }

                window.dispatchEvent(new CustomEvent('mg:tv-remote-detected'));
              } catch(e) {}
            })();
            """.trimIndent()
        )
    }

    private fun nativeBridgeAllowed(): Boolean {
        if (!::webView.isInitialized) {
            return false
        }

        val expected = runCatching {
            Uri.parse(BuildConfig.MEDIA_GOD_URL)
        }.getOrNull() ?: return false

        val current = runCatching {
            Uri.parse(currentTopLevelUrl)
        }.getOrNull() ?: return false

        val expectedHost = expected.host.orEmpty()
        val currentHost = current.host.orEmpty()

        return (
            expected.scheme.equals("https", ignoreCase = true) &&
                current.scheme.equals(expected.scheme, ignoreCase = true) &&
                expectedHost.isNotBlank() &&
                currentHost.equals(expectedHost, ignoreCase = true) &&
                current.port == expected.port
        )
    }

    private fun dispatchJavascript(script: String) {
        if (!::webView.isInitialized) return

        webView.post {
            try {
                webView.evaluateJavascript(script, null)
            } catch (_: Throwable) {
                // The page may be navigating while an event is being sent.
            }
        }
    }

    /*
     * Fire TV launches its decoder Activity through the same Android Binder
     * boundary as phone/tablet. VOD can legitimately discover hundreds of
     * torrents, but the native decoder only needs the source it is opening.
     * Keep Live TV unchanged because its native failover intentionally owns the
     * full channel-source list. This second native guard also protects Fire TV
     * if an older or regressed hosted bundle ever sends a huge VOD catalogue.
     */
    private fun compactNativeActivityPayload(payload: JSONObject): String {
        if (payload.optBoolean("live", false)) {
            return payload.toString()
        }

        val compact = try {
            JSONObject(payload.toString())
        } catch (_: Throwable) {
            JSONObject()
        }

        val sources = payload.optJSONArray("sources")
        val activeWebIndex = payload.optInt("activeSourceIndex", -1)
        val targetUrl = payload.optString("url").trim()
        var selectedSource: JSONObject? = null

        if (sources != null) {
            for (index in 0 until sources.length()) {
                val item = sources.optJSONObject(index) ?: continue
                val webIndex = if (item.has("webIndex")) item.optInt("webIndex", index) else index
                if (webIndex == activeWebIndex) {
                    selectedSource = item
                    break
                }
            }

            if (selectedSource == null && targetUrl.isNotBlank()) {
                for (index in 0 until sources.length()) {
                    val item = sources.optJSONObject(index) ?: continue
                    if (item.optString("url").trim() == targetUrl) {
                        selectedSource = item
                        break
                    }
                }
            }
        }

        val compactSources = JSONArray()
        selectedSource?.let { item ->
            val copy = JSONObject()
            val allowedKeys = arrayOf(
                "label",
                "sourceName",
                "url",
                "mimeType",
                "videoCodec",
                "audioCodec",
                "container",
                "videoProfile",
                "width",
                "height",
                "fps",
                "bitDepth",
                "bitrate",
                "hdrFormat",
                "verifiedEnglishMain",
                "preferredAudioTrackName",
                "preferredAudioTrackLanguage",
                "preferredAudioTrackCodec",
                "preferredAudioTrackStream",
                "webIndex",
                "headers",
                "drm",
                "hintText"
            )
            allowedKeys.forEach { key ->
                if (item.has(key)) {
                    copy.put(key, item.opt(key))
                }
            }
            if (copy.has("hintText")) {
                copy.put("hintText", copy.optString("hintText").take(2048))
            }
            compactSources.put(copy)
        }
        compact.put("sources", compactSources)
        compact.put("hintText", compact.optString("hintText").take(2048))

        var encoded = compact.toString()
        if (encoded.toByteArray(Charsets.UTF_8).size > 256 * 1024) {
            val subtitles = compact.optJSONArray("subtitles")
            val trimmedSubtitles = JSONArray()
            if (subtitles != null) {
                for (index in 0 until minOf(subtitles.length(), 8)) {
                    val item = subtitles.optJSONObject(index) ?: continue
                    trimmedSubtitles.put(
                        JSONObject().apply {
                            put("url", item.optString("url").take(4096))
                            put("language", item.optString("language").take(32))
                            put("label", item.optString("label").take(256))
                            put("mimeType", item.optString("mimeType").take(128))
                        }
                    )
                }
            }
            compact.put("subtitles", trimmedSubtitles)
            encoded = compact.toString()
        }

        if (encoded.toByteArray(Charsets.UTF_8).size > 384 * 1024) {
            compact.put("sources", JSONArray())
            compact.put("sourceChoices", JSONArray())
            compact.put("subtitles", JSONArray())
            compact.put("hintText", compact.optString("hintText").take(512))
            encoded = compact.toString()
        }

        return encoded
    }

    inner class NativeBridge {
        @JavascriptInterface
        fun downloadFile(payloadJson: String): Boolean {
            if (!nativeBridgeAllowed() || payloadJson.length > 4_096) return false
            return try {
                val data = JSONObject(payloadJson)
                val url = Uri.parse(data.optString("url"))
                val host = url.host.orEmpty().lowercase()
                if (url.scheme != "https" || host.isBlank() ||
                    host == "localhost" || host.endsWith(".local") ||
                    host.matches(Regex("^(127|10|192|169)\\..*")) ||
                    host.matches(Regex("^172\\.(1[6-9]|2[0-9]|3[01])\\..*"))) return false
                val filename = data.optString("filename")
                    .substringAfterLast('/').substringAfterLast('\\\\')
                    .replace(Regex("[^A-Za-z0-9._ ()\\[\\]-]"), "_")
                    .take(140).trimStart('.')
                if (!filename.matches(Regex("(?i)^.{1,130}\\.(mp4|mkv|avi|mov|webm|m4v|ts)$"))) return false
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    try {
                        val request = android.app.DownloadManager.Request(url)
                            .setTitle(filename)
                            .setDescription("Media God video download")
                            .setNotificationVisibility(
                                android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                            )
                            .setMimeType("application/octet-stream")
                        if (Build.VERSION.SDK_INT >= 29) {
                            request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, filename)
                        } else {
                            request.setDestinationInExternalFilesDir(
                                this@MainActivity, android.os.Environment.DIRECTORY_DOWNLOADS, filename
                            )
                        }
                        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
                        manager.enqueue(request)
                        dispatchJavascript("window.dispatchEvent(new CustomEvent('mg:download-started'));")
                    } catch (_: Throwable) {
                        dispatchJavascript("window.dispatchEvent(new CustomEvent('mg:download-failed'));")
                    }
                }
                true
            } catch (_: Throwable) {
                false
            }
        }

        @JavascriptInterface
        fun updatePlaybackContext(payloadJson: String): Boolean {
            if (!nativeBridgeAllowed() || !playerOpen || payloadJson.length > 16_384) return false
            return try {
                val context = JSONObject(payloadJson)
                val requestId = activeNativeRequestId
                if (requestId.isBlank() || context.optString("requestId") != requestId ||
                    context.optString("mediaType") != "tv" || context.optInt("tmdbId") <= 0 ||
                    context.optInt("season") <= 0 || context.optInt("episode") <= 0) return false
                sendBroadcast(Intent("$packageName.UPDATE_PLAYBACK_CONTEXT").apply {
                    setPackage(packageName)
                    putExtra("requestId", requestId)
                    putExtra("payload", context.toString())
                })
                true
            } catch (_: Throwable) {
                false
            }
        }

        @JavascriptInterface
        fun startVoiceSearch(): Boolean {
            if (!nativeBridgeAllowed()) return false
            val intent = Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "en-GB")
                putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-GB")
                putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Search Media God")
                putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            return try {
                if (intent.resolveActivity(packageManager) == null) return false
                runOnUiThread {
                    try {
                        @Suppress("DEPRECATION")
                        startActivityForResult(intent, REQUEST_VOICE_SEARCH)
                    } catch (_: Throwable) {
                        dispatchJavascript("window.dispatchEvent(new CustomEvent('mg:voice-search-result',{detail:{error:'unavailable'}}));")
                    }
                }
                true
            } catch (_: Throwable) {
                false
            }
        }

        @JavascriptInterface
        fun isAvailable(): Boolean =
            nativeBridgeAllowed()

        @JavascriptInterface
        fun getDisplayInfo(): String {
            if (!nativeBridgeAllowed()) {
                return JSONObject()
                    .put("native", false)
                    .toString()
            }

            val configuration = resources.configuration

            return JSONObject().apply {
                put("native", true)
                put("platform", "fire-tv")
                put("widthDp", configuration.screenWidthDp)
                put("heightDp", configuration.screenHeightDp)
                put("logicalWidth", 960)
                put("logicalHeight", 540)
            }.toString()
        }

        @JavascriptInterface
        fun getAppInfo(): String {
            if (!nativeBridgeAllowed()) {
                return JSONObject()
                    .put("native", false)
                    .toString()
            }

            return JSONObject().apply {
                put("native", true)
                put("platform", "fire-tv")
                put("packageName", packageName)
                put("versionCode", BuildConfig.VERSION_CODE)
                put("versionName", BuildConfig.VERSION_NAME)
                put("selfUpdateSupported", ::appUpdater.isInitialized && appUpdater.isSupported())
                put(
                    "updateInstallPermissionGranted",
                    ::appUpdater.isInitialized && appUpdater.installPermissionGranted()
                )
            }.toString()
        }

        @JavascriptInterface
        fun getCodecInfo(): String {
            if (!nativeBridgeAllowed()) {
                return JSONObject().apply {
                    put("video", JSONArray())
                    put("audio", JSONArray())
                }.toString()
            }

            val videoTypes = sortedSetOf<String>()
            val audioTypes = sortedSetOf<String>()
            val audioLimits = JSONObject()

            try {
                MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos
                    .filter { !it.isEncoder }
                    .forEach { info ->
                        info.supportedTypes.forEach { rawType ->
                            val type = rawType.trim().lowercase()

                            when {
                                type.startsWith("video/") -> videoTypes.add(type)
                                type.startsWith("audio/") -> {
                                    audioTypes.add(type)
                                    try {
                                        val caps = info.getCapabilitiesForType(rawType).audioCapabilities
                                        if (caps != null) {
                                            val previous = audioLimits.optJSONObject(type)
                                            val maxChannels = maxOf(
                                                caps.maxInputChannelCount,
                                                previous?.optInt("maxChannels") ?: 0
                                            )
                                            val rates = sortedSetOf<Int>()
                                            caps.supportedSampleRates.forEach { rates.add(it) }
                                            previous?.optJSONArray("sampleRates")?.let { old ->
                                                for (i in 0 until old.length()) rates.add(old.optInt(i))
                                            }
                                            audioLimits.put(type, JSONObject().apply {
                                                put("maxChannels", maxChannels)
                                                put("sampleRates", JSONArray(rates.toList()))
                                            })
                                        }
                                    } catch (_: Throwable) { /* MIME still reported. */ }
                                }
                            }
                        }
                    }
            } catch (_: Throwable) {
                // Some older Fire OS builds expose incomplete codec lists.
            }

            return JSONObject().apply {
                put("video", JSONArray(videoTypes.toList()))
                put("audio", JSONArray(audioTypes.toList()))
                put("audioCapabilities", audioLimits)
                val outputs = sortedSetOf<Int>()
                if (Build.VERSION.SDK_INT >= 23) {
                    try {
                        val manager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                        manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).forEach { device ->
                            device.encodings.forEach { outputs.add(it) }
                        }
                    } catch (_: Throwable) { /* Unknown output capabilities. */ }
                }
                put("outputEncodings", JSONArray(outputs.toList()))
            }.toString()
        }

        @JavascriptInterface
        fun openExternalUrl(url: String): Boolean {
            if (!nativeBridgeAllowed()) {
                return false
            }

            val target = url.trim()

            if (!(target.startsWith("https://") || target.startsWith("http://"))) {
                return false
            }

            runOnUiThread {
                try {
                    val intent = Intent(
                        this@MainActivity,
                        ExternalWebActivity::class.java
                    ).apply {
                        putExtra(ExternalWebActivity.EXTRA_URL, target)
                    }
                    startActivity(intent)
                } catch (_: Throwable) {
                    webView.loadUrl(target)
                }
            }

            return true
        }

        @JavascriptInterface
        fun launchReeznTvApp(): Boolean {
            if (!nativeBridgeAllowed()) {
                return false
            }

            val launcherIntent = Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)

            val target = try {
                packageManager.queryIntentActivities(launcherIntent, 0).firstOrNull { resolved ->
                    val activity = resolved.activityInfo
                    val packageId = activity?.packageName.orEmpty()
                    val label = resolved.loadLabel(packageManager)?.toString().orEmpty()
                    (label.contains("reezn", ignoreCase = true) ||
                        packageId.contains("reezn", ignoreCase = true)) &&
                        packageId != packageName
                }
            } catch (_: Throwable) {
                null
            } ?: return false

            val targetActivity = target.activityInfo ?: return false
            runOnUiThread {
                try {
                    val launchIntent = Intent(Intent.ACTION_MAIN)
                        .addCategory(Intent.CATEGORY_LAUNCHER)
                        .setClassName(targetActivity.packageName, targetActivity.name)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(launchIntent)
                } catch (_: Throwable) {
                    // The JavaScript caller can fall back to the ReeznTV website.
                }
            }

            return true
        }

        @JavascriptInterface
        fun openExternalPlayer(url: String): Boolean {
            if (!nativeBridgeAllowed()) {
                return false
            }

            val target = url.trim()

            if (!(target.startsWith("https://") || target.startsWith("http://"))) {
                return false
            }

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.parse(target), "video/*")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            if (intent.resolveActivity(packageManager) == null) {
                return false
            }

            runOnUiThread {
                try {
                    startActivity(intent)
                } catch (_: Throwable) {
                    // No compatible external player remained available.
                }
            }

            return true
        }

        @JavascriptInterface
        fun startUpdate(_url: String, versionName: String): String {
            if (!nativeBridgeAllowed()) {
                return "error"
            }

            return if (::appUpdater.isInitialized) {
                appUpdater.startUpdate(versionName)
            } else {
                "error"
            }
        }

        @JavascriptInterface
        fun setEmbeddedPlayerRemoteActive(active: Boolean): Boolean {
            if (!nativeBridgeAllowed()) return false
            embeddedPlayerRemote.enabled = active
            return true
        }

        @JavascriptInterface
        fun simulateTap(cssX: Float, cssY: Float): Boolean =
            embeddedPlayerRemote.tap(cssX, cssY)

        @JavascriptInterface
        fun exitApp(): Boolean {
            if (!nativeBridgeAllowed()) {
                return false
            }

            runOnUiThread {
                try {
                    finishAndRemoveTask()
                } catch (_: Throwable) {
                    finishAffinity()
                }
            }

            return true
        }

        @JavascriptInterface
        fun play(payloadJson: String): String {
            if (!nativeBridgeAllowed()) {
                return "error"
            }

            val payload = try {
                JSONObject(payloadJson)
            } catch (_: Throwable) {
                return "error"
            }

            val url = payload.optString("url").trim()
            if (!(url.startsWith("https://") || url.startsWith("http://"))) {
                return "error"
            }

            val requestId = payload.optString("requestId").trim().ifBlank {
                "native-${System.currentTimeMillis()}"
            }
            payload.put("requestId", requestId)

            /*
             * Older/stale WebView code could send canChooseEpisode=false when
             * one metadata field (usually TMDB id) was missing, even though
             * this was clearly TV episode playback. Normalise the native
             * payload here so the PlayerActivity always gets its Season and
             * Episode menu entries for TV episodes.
             */
            val title = payload.optString("title")
            val titleEpisode = Regex(
                "(?:^|\\b)S(\\d{1,3})E(\\d{1,4})(?:\\b|$)",
                RegexOption.IGNORE_CASE
            ).find(title)

            val titleSeason =
                titleEpisode?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0
            val titleEpisodeNumber =
                titleEpisode?.groupValues?.getOrNull(2)?.toIntOrNull() ?: 0

            val suppliedSeason = payload.optInt("season", 0)
            val suppliedEpisode = payload.optInt("episode", 0)
            val resolvedSeason =
                if (suppliedSeason > 0) suppliedSeason else titleSeason
            val resolvedEpisode =
                if (suppliedEpisode > 0) suppliedEpisode else titleEpisodeNumber

            val mediaType = payload.optString("mediaType").trim().lowercase()
            val looksLikeTvEpisode =
                mediaType == "tv" ||
                    mediaType == "series" ||
                    (resolvedSeason > 0 && resolvedEpisode > 0)

            if (!payload.optBoolean("live", false) && looksLikeTvEpisode) {
                payload.put("canChooseEpisode", true)

                if (resolvedSeason > 0) {
                    payload.put("season", resolvedSeason)
                }

                if (resolvedEpisode > 0) {
                    payload.put("episode", resolvedEpisode)
                }

                if (mediaType.isBlank()) {
                    payload.put("mediaType", "tv")
                }
            }

            /*
             * This first decision uses the metadata already supplied by the web
             * player. NativeStreamPreflight may discover a better MIME/container
             * identity, so the launch decision is recomputed after preflight
             * before any player Activity is shown.
             */
            val initialPlaybackDecision =
                PlaybackCompatibilityRouter.decide(payload)
            if (initialPlaybackDecision.useCompatibility) {
                payload.put("compatibilityPreflight", true)
                payload.put("compatibilityReason", initialPlaybackDecision.reason)
                payload.put(
                    "compatibilityAudioRecovery",
                    initialPlaybackDecision.reason.startsWith("audio", ignoreCase = true)
                )
            }

            val accepted = synchronized(nativePlayerLock) {
                if (playerOpen) {
                    false
                } else {
                    playerOpen = true
                    activeNativeRequestId = requestId
                    true
                }
            }

            /*
             * Do not tell JavaScript that playback started when an earlier
             * native activity is still considered open. The old code checked
             * playerOpen only later on the UI thread, returned "true"
             * immediately, and left the web player spinning forever because
             * no Activity was actually launched for the new request.
             */
            if (!accepted) {
                return "busy"
            }

            Thread {
                val preflight = NativeStreamPreflight.checkPayload(payload)
                payload.put("streamPreflight", preflight.toJson())

                if (
                    payload.optString("mimeType").isBlank() &&
                    preflight.contentType.isNotBlank()
                ) {
                    payload.put(
                        "mimeType",
                        preflight.contentType.substringBefore(';').trim()
                    )
                }

                val networkRisk =
                    payload.optBoolean("networkAware4K", true) &&
                        preflight.networkRisk

                if (preflight.shouldSkip || networkRisk) {
                    synchronized(nativePlayerLock) {
                        playerOpen = false
                        if (activeNativeRequestId == requestId) {
                            activeNativeRequestId = ""
                        }
                    }

                    val message =
                        when {
                            networkRisk ->
                                "This 4K source needs about ${String.format("%.1f", preflight.requiredMbps)} Mbps but the pre-check measured ${String.format("%.1f", preflight.estimatedMbps)} Mbps. Trying another 4K/backup source."
                            preflight.statusCode > 0 ->
                                "Stream pre-check rejected this source (HTTP ${preflight.statusCode}). Trying another source."
                            else ->
                                "Stream pre-check rejected this source. Trying another source."
                        }

                    val diagnostics = NativePlaybackDiagnostics.snapshot(
                        payload = payload,
                        url = url,
                        engine = "preflight",
                        event = "rejected",
                        message = message,
                        extra = preflight.toJson(),
                        context = this@MainActivity
                    )

                    val result = JSONObject().apply {
                        put("requestId", requestId)
                        put("reason", "error")
                        put("positionMs", 0)
                        put("durationMs", 0)
                        put("message", message)
                        put("selectedSourceIndex", payload.optInt("activeSourceIndex", -1))
                        put("diagnostics", diagnostics)
                    }

                    dispatchJavascript(
                        "window.dispatchEvent(new CustomEvent('mg:native-player-result',{detail:JSON.parse(${JSONObject.quote(result.toString())})}));"
                    )
                } else {
                    /*
                     * Preflight can reveal the real MIME/container after the
                     * initial web payload was accepted. Recompute now so the
                     * correct engine opens first and the viewer does not see a
                     * Media3 player followed by a second compatibility player.
                     */
                    val finalPlaybackDecision =
                        PlaybackCompatibilityRouter.decide(payload)

                    if (finalPlaybackDecision.useCompatibility) {
                        payload.put("compatibilityPreflight", true)
                        payload.put(
                            "compatibilityReason",
                            finalPlaybackDecision.reason
                        )
                        payload.put(
                            "compatibilityAudioRecovery",
                            finalPlaybackDecision.reason.startsWith(
                                "audio",
                                ignoreCase = true
                            )
                        )
                    }

                    runOnUiThread {
                val activityClass =
                    if (finalPlaybackDecision.useCompatibility) {
                        CompatibilityPlayerActivity::class.java
                    } else {
                        PlayerActivity::class.java
                    }

                val compactPlayerPayload = compactNativeActivityPayload(payload)
                val intent = Intent(this@MainActivity, activityClass).apply {
                    putExtra(PlayerActivity.EXTRA_PAYLOAD, compactPlayerPayload)
                }

                try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(intent, REQUEST_NATIVE_PLAYER)
                    @Suppress("DEPRECATION")
                    overridePendingTransition(0, 0)
                } catch (error: Throwable) {
                    synchronized(nativePlayerLock) {
                        playerOpen = false
                        if (activeNativeRequestId == requestId) {
                            activeNativeRequestId = ""
                        }
                    }

                    val result = JSONObject().apply {
                        put("requestId", requestId)
                        put("reason", "error")
                        put("positionMs", 0)
                        put("durationMs", 0)
                        put("message", error.message ?: "Could not open Fire TV player")
                    }

                    dispatchJavascript(
                        "window.dispatchEvent(new CustomEvent('mg:native-player-result',{detail:JSON.parse(${JSONObject.quote(result.toString())})}));"
                    )
                }
                    }
                }
            }.start()

            return "true"
        }
    }
}