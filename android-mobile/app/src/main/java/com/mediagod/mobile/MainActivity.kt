package com.mediagod.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.media.MediaCodecList
import android.media.AudioManager
import android.os.Build
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
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
    private val nativePlayerLock = Any()
    private val nativeHandoffHandler = Handler(Looper.getMainLooper())
    @Volatile private var playerOpen = false
    @Volatile private var activeNativeRequestId = ""
    @Volatile private var pendingNativePreflightRequestId = ""
    private var pendingNativeResultScript: String? = null
    private lateinit var appUpdater: AppUpdater
    @Volatile private var currentTopLevelUrl = ""

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false)
                mediaPlaybackRequiresUserGesture = false
                /* Always ask the network for the current Base44 HTML/JS bundle.
                 * The app intentionally keeps cookies and DOM storage, so login
                 * survives, but stale player JavaScript cannot remain pinned in
                 * WebView after a Base44 publish. */
                cacheMode = WebSettings.LOAD_NO_CACHE
                useWideViewPort = true
                loadWithOverviewMode = false
                builtInZoomControls = false
                displayZoomControls = false
                setSupportZoom(false)
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                userAgentString =
                    "${userAgentString} MediaGodMobile/1.0 AndroidMobile"
            }

            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(
                    view: WebView?,
                    url: String?,
                    favicon: Bitmap?
                ) {
                    currentTopLevelUrl = url.orEmpty()
                    super.onPageStarted(view, url, favicon)
                }

                override fun onPageCommitVisible(view: WebView?, url: String?) {
                    currentTopLevelUrl = url.orEmpty()
                    super.onPageCommitVisible(view, url)
                    injectMobileBootstrap()
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    currentTopLevelUrl = url.orEmpty()
                    super.onPageFinished(view, url)
                    injectMobileBootstrap()
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
                "window.dispatchEvent(new CustomEvent('mg:android-mobile-update-status',{detail:JSON.parse(${JSONObject.quote(detail.toString())})}));"
            )
        }

        val webPrefs = getSharedPreferences("media_god_mobile_web", MODE_PRIVATE)
        val lastCacheVersion = webPrefs.getInt("cache_version", -1)
        val forceFreshHostedApp = lastCacheVersion != BuildConfig.VERSION_CODE

        if (forceFreshHostedApp) {
            /* Package upgrades must never reopen a cached copy of the hosted
             * app. clearCache() does not clear cookies/localStorage, so account
             * state remains intact while old HTML/JS/assets are discarded. */
            webView.clearCache(true)
            webView.clearHistory()
            webPrefs.edit()
                .putInt("cache_version", BuildConfig.VERSION_CODE)
                .apply()
        }

        if (savedInstanceState == null || forceFreshHostedApp) {
            val separator = if (BuildConfig.MEDIA_GOD_URL.contains("?")) "&" else "?"
            val freshUrl =
                "${BuildConfig.MEDIA_GOD_URL}${separator}mg_mobile_v=${BuildConfig.VERSION_CODE}"

            webView.loadUrl(
                freshUrl,
                mapOf(
                    "Cache-Control" to "no-cache, no-store, max-age=0",
                    "Pragma" to "no-cache"
                )
            )
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
        webView.onResume()
        webView.resumeTimers()
        injectMobileBootstrap()

        pendingNativeResultScript?.let { script ->
            pendingNativeResultScript = null
            dispatchJavascript(script)
        }

        if (::appUpdater.isInitialized) {
            appUpdater.onResume()
        }
    }

    override fun onPause() {
        webView.onPause()
        webView.pauseTimers()
        super.onPause()
    }

    override fun onDestroy() {
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

    @Deprecated("Deprecated in Android; retained for broad Android compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode != REQUEST_NATIVE_PLAYER) {
            return
        }

        val expectedRequestId = synchronized(nativePlayerLock) {
            val value = activeNativeRequestId
            playerOpen = false
            activeNativeRequestId = ""
            pendingNativePreflightRequestId = ""
            value
        }

        val returnedRequestId =
            data?.getStringExtra(PlayerActivity.EXTRA_REQUEST_ID).orEmpty().ifBlank {
                expectedRequestId
            }

        val abnormalNativeExit =
            resultCode != RESULT_OK || data == null

        val result = JSONObject().apply {
            put("requestId", returnedRequestId)
            put(
                "reason",
                if (abnormalNativeExit) {
                    "error"
                } else {
                    data?.getStringExtra(PlayerActivity.EXTRA_REASON) ?: "back"
                }
            )
            put("positionMs", data?.getLongExtra(PlayerActivity.EXTRA_POSITION_MS, 0L) ?: 0L)
            put("durationMs", data?.getLongExtra(PlayerActivity.EXTRA_DURATION_MS, 0L) ?: 0L)
            put("selectedSourceIndex", data?.getIntExtra(PlayerActivity.EXTRA_SELECTED_SOURCE_INDEX, -1) ?: -1)
            put(
                "message",
                if (abnormalNativeExit) {
                    "The Android video process exited unexpectedly. Media God stayed open and can try another ready source."
                } else {
                    data?.getStringExtra(PlayerActivity.EXTRA_MESSAGE).orEmpty()
                }
            )
            val diagnosticsText =
                data?.getStringExtra(PlayerActivity.EXTRA_DIAGNOSTICS).orEmpty()
            if (diagnosticsText.isNotBlank()) {
                try {
                    put("diagnostics", JSONObject(diagnosticsText))
                } catch (_: Throwable) {
                    put("diagnostics", diagnosticsText)
                }
            }
        }

        val resultScript =
            "window.dispatchEvent(new CustomEvent('mg:native-player-result',{detail:JSON.parse(${JSONObject.quote(result.toString())})}));"

        /*
         * Android devices do not all order onActivityResult/onResume in the
         * same way. Dispatch now and also keep the same event queued for
         * onResume. If the immediate dispatch succeeds, the duplicate resume
         * event is harmless because the web player has already cleared the
         * matching request id. If it cannot run while the WebView is paused,
         * the queued copy guarantees delivery when Media God becomes active.
         */
        pendingNativeResultScript = resultScript
        dispatchJavascript(resultScript)
    }

    private fun injectMobileBootstrap() {
        if (!::webView.isInitialized) return

        dispatchJavascript(
            """
            (function(){
              try {
                var html=document.documentElement;
                var body=document.body;
                var remove=['mg-fire-tv','mg-fire-tv-mode','mg-fire-tv-stable','mg-fire-tv-player-open','mg-tv-remote','mg-native-fire-tv'];
                remove.forEach(function(name){html.classList.remove(name);if(body){body.classList.remove(name);}});
                window.__MG_FIRE_TV_STABLE_MODE__=false;
                html.classList.add('mg-android-mobile','mg-native-android-mobile','mg-touch-device');
                if(body){body.classList.add('mg-android-mobile','mg-native-android-mobile','mg-touch-device');}
                /* Replace, rather than mutate, any viewport node. Older Media God
                   builds could leave a Fire TV MutationObserver attached to the
                   old node and force 960x540 back after mobile bootstrap ran. */
                var metas=Array.prototype.slice.call(document.querySelectorAll('meta[name="viewport"]'));
                metas.forEach(function(meta){if(meta&&meta.parentNode){meta.parentNode.removeChild(meta);}});
                var mobileMeta=document.createElement('meta');
                mobileMeta.name='viewport';
                mobileMeta.setAttribute('content','width=device-width, initial-scale=1.0, viewport-fit=cover');
                (document.head||document.documentElement).appendChild(mobileMeta);

                /* The public Comet addon can expose RD⬇ entries as playable URLs.
                   They are not films: they are "not cached yet / being prepared"
                   status media. Older hosted Media God bundles can therefore put
                   that status card on the video surface. Keep an APK-side guard
                   until every hosted client is on the newer source filter. */
                if(!window.__MG_ANDROID_COMET_UNCACHED_GUARD__){
                  window.__MG_ANDROID_COMET_UNCACHED_GUARD__=true;
                  var guardQueued=false;
                  var isBlockedCometText=function(value){
                    value=String(value||'');
                    return /\bComet\b/i.test(value)&&/\[\s*RD\s*⬇(?:️)?\s*\]/i.test(value);
                  };
                  var guardCometUncached=function(){
                    guardQueued=false;
                    var root=document.querySelector('[data-mg-player-root="true"]');
                    if(!root){return;}
                    var blocked=isBlockedCometText(root.innerText||root.textContent||'');
                    var videos=Array.prototype.slice.call(root.querySelectorAll('video'));
                    var rdCacheSource=root.getAttribute('data-mg-rd-cache-source')==='true';
                    var restoreVideos=function(){
                      videos.forEach(function(video){
                        if(video.dataset&&video.dataset.mgCometUncachedBlocked==='true'){
                          video.style.removeProperty('opacity');
                          delete video.dataset.mgCometUncachedBlocked;
                        }
                      });
                    };
                    /* Newer web builds deliberately turn RD⬇ into a Media God
                       Real-Debrid cache job. Do not fight that flow, including
                       after the cached file becomes a real playable video. */
                    if(rdCacheSource){restoreVideos();return;}
                    /* Older hosted builds only need intervention if they have
                       actually put Comet's placeholder onto a video element. */
                    if(!blocked||videos.length===0){restoreVideos();return;}
                    videos.forEach(function(video){
                      try{video.pause();}catch(e){}
                      if(video.dataset){video.dataset.mgCometUncachedBlocked='true';}
                      video.style.setProperty('opacity','0','important');
                    });
                    var selects=Array.prototype.slice.call(root.querySelectorAll('select'));
                    var sourceSelect=selects.find(function(select){
                      return /source|quality/i.test(String(select.getAttribute('aria-label')||''));
                    })||selects.find(function(select){return select.options&&select.options.length>1;});
                    if(!sourceSelect||!sourceSelect.options||sourceSelect.options.length<2){return;}
                    var current=sourceSelect.selectedIndex;
                    for(var offset=1;offset<sourceSelect.options.length;offset+=1){
                      var next=(current+offset)%sourceSelect.options.length;
                      var option=sourceSelect.options[next];
                      if(!option||option.disabled||isBlockedCometText(option.textContent||option.label||'')){continue;}
                      sourceSelect.selectedIndex=next;
                      try{sourceSelect.value=option.value;}catch(e){}
                      sourceSelect.dispatchEvent(new Event('input',{bubbles:true}));
                      sourceSelect.dispatchEvent(new Event('change',{bubbles:true}));
                      break;
                    }
                  };
                  var queueCometGuard=function(){
                    if(guardQueued){return;}
                    guardQueued=true;
                    window.requestAnimationFrame(guardCometUncached);
                  };
                  if(document.body){
                    new MutationObserver(queueCometGuard).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','src','value']});
                  }
                  document.addEventListener('play',queueCometGuard,true);
                  window.addEventListener('mg:player-status',queueCometGuard);
                  queueCometGuard();
                }


                /*
                 * Some Android WebView builds keep the old hardware video layer
                 * alive for one render after a source switch. Retire every
                 * superseded surface before paint so poster and video layers
                 * can never shrink into a side-by-side pair.
                 */
                if(!window.__MG_SINGLE_VIDEO_SURFACE_GUARD__){
                  window.__MG_SINGLE_VIDEO_SURFACE_GUARD__=true;
                  var singleSurfaceQueued=false;
                  var retirePlaybackSurface=function(video){
                    if(!video){return;}
                    try{video.pause();}catch(e){}
                    try{
                      video.removeAttribute('autoplay');
                      video.removeAttribute('poster');
                      video.removeAttribute('src');
                      Array.prototype.slice.call(video.querySelectorAll('source')).forEach(function(source){
                        source.removeAttribute('src');
                      });
                      video.load();
                    }catch(e){}
                    video.setAttribute('data-mg-playback-retired','true');
                    video.style.setProperty('display','none','important');
                    video.style.setProperty('visibility','hidden','important');
                    video.style.setProperty('pointer-events','none','important');
                  };
                  var restorePlaybackSurface=function(video){
                    if(!video){return;}
                    video.removeAttribute('data-mg-playback-retired');
                    video.style.removeProperty('display');
                    video.style.removeProperty('visibility');
                    video.style.removeProperty('pointer-events');
                    video.style.setProperty('position','absolute','important');
                    video.style.setProperty('inset','0','important');
                    video.style.setProperty('width','100%','important');
                    video.style.setProperty('height','100%','important');
                    video.style.setProperty('max-width','100%','important');
                    video.style.setProperty('flex','0 0 100%','important');
                  };
                  var enforceSinglePlaybackSurface=function(){
                    singleSurfaceQueued=false;
                    var videos=Array.prototype.slice.call(
                      document.querySelectorAll('[data-mg-player-root="true"] video')
                    );
                    if(videos.length===0){return;}
                    var keep=videos[videos.length-1];
                    videos.forEach(function(video){
                      if(video===keep){restorePlaybackSurface(video);}
                      else{retirePlaybackSurface(video);}
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

                window.dispatchEvent(new CustomEvent('mg:android-mobile-detected'));
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
     * Android Activity launches cross a Binder transaction boundary. The web
     * player can legitimately know about hundreds of torrents, but the native
     * decoder only needs the source it is opening. Passing the whole catalogue
     * in one Intent can exceed Android's transaction budget and make a title
     * fail only in the APK while the same title works in Base44/browser.
     *
     * Keep this native-side compactor even though the current web bridge also
     * sends only the active source. It protects installed APKs from an older or
     * accidentally regressed hosted bundle. The regression suite exercises a
     * 355-source VOD handoff so this Activity/Binder boundary stays bounded.
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
            /*
             * Subtitles are optional for launching the decoder. Preserve a
             * small useful subset if an unusual provider returned enormous
             * subtitle URLs/metadata, rather than risk a Binder crash.
             */
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
            /* Final safety valve: all active-source essentials already live at
             * the payload top level, so drop optional nested arrays entirely. */
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
                put("platform", "android-mobile")
                put("widthDp", configuration.screenWidthDp)
                put("heightDp", configuration.screenHeightDp)
                put("logicalWidth", configuration.screenWidthDp)
                put("logicalHeight", configuration.screenHeightDp)
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
                put("platform", "android-mobile")
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
        fun exitApp(): Boolean {
            if (!nativeBridgeAllowed()) {
                return false
            }

            runOnUiThread {
                finishAndRemoveTask()
            }
            return true
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
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(target)).apply {
                        addCategory(Intent.CATEGORY_BROWSABLE)
                    }
                    startActivity(intent)
                } catch (_: Throwable) {
                    webView.loadUrl(target)
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
                    pendingNativePreflightRequestId = requestId
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

            if (!payload.optBoolean("live", false)) {
                /*
                 * WebView keeps its timers running while native preflight is
                 * pending. The accepted request owns playback until Android
                 * sends an explicit result; a slow/redirecting server must not
                 * leave a permanent spinner or invite a second WebView player.
                 */
                nativeHandoffHandler.postDelayed({
                    val timedOut = synchronized(nativePlayerLock) {
                        if (playerOpen && pendingNativePreflightRequestId == requestId) {
                            playerOpen = false
                            activeNativeRequestId = ""
                            pendingNativePreflightRequestId = ""
                            true
                        } else {
                            false
                        }
                    }
                    if (timedOut) {
                        val result = JSONObject().apply {
                            put("requestId", requestId)
                            put("reason", "error")
                            put("message", "Android stream check timed out. Select another source or retry.")
                            put("positionMs", 0)
                            put("durationMs", 0)
                        }
                        dispatchJavascript(
                            "window.dispatchEvent(new CustomEvent('mg:native-player-result',{detail:JSON.parse(${JSONObject.quote(result.toString())})}));"
                        )
                    }
                }, 15_000L)
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
                    val stillCurrent = synchronized(nativePlayerLock) {
                        if (!playerOpen || pendingNativePreflightRequestId != requestId) {
                            false
                        } else {
                            playerOpen = false
                            activeNativeRequestId = ""
                            pendingNativePreflightRequestId = ""
                            true
                        }
                    }
                    if (!stillCurrent) return@Thread

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
                val stillCurrent = synchronized(nativePlayerLock) {
                    if (playerOpen && pendingNativePreflightRequestId == requestId) {
                        pendingNativePreflightRequestId = ""
                        true
                    } else {
                        false
                    }
                }
                if (!stillCurrent || isFinishing || isDestroyed) return@runOnUiThread

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
                        pendingNativePreflightRequestId = ""
                    }

                    val result = JSONObject().apply {
                        put("requestId", requestId)
                        put("reason", "error")
                        put("positionMs", 0)
                        put("durationMs", 0)
                        put("message", error.message ?: "Could not open Android player")
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
