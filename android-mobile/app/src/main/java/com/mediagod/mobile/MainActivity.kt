package com.mediagod.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.media.MediaCodecList
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    companion object {
        private const val REQUEST_NATIVE_PLAYER = 8401
    }

    private lateinit var webView: WebView
    private val nativePlayerLock = Any()
    @Volatile private var playerOpen = false
    @Volatile private var activeNativeRequestId = ""
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
            value
        }

        val returnedRequestId =
            data?.getStringExtra(PlayerActivity.EXTRA_REQUEST_ID).orEmpty().ifBlank {
                expectedRequestId
            }

        val result = JSONObject().apply {
            put("requestId", returnedRequestId)
            put("reason", data?.getStringExtra(PlayerActivity.EXTRA_REASON) ?: "back")
            put("positionMs", data?.getLongExtra(PlayerActivity.EXTRA_POSITION_MS, 0L) ?: 0L)
            put("durationMs", data?.getLongExtra(PlayerActivity.EXTRA_DURATION_MS, 0L) ?: 0L)
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

    inner class NativeBridge {
        @JavascriptInterface
        fun isAvailable(): Boolean = true

        @JavascriptInterface
        fun getDisplayInfo(): String {
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
        fun getAppInfo(): String =
            JSONObject().apply {
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

        @JavascriptInterface
        fun getCodecInfo(): String {
            val videoTypes = sortedSetOf<String>()
            val audioTypes = sortedSetOf<String>()

            try {
                MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos
                    .filter { !it.isEncoder }
                    .forEach { info ->
                        info.supportedTypes.forEach { rawType ->
                            val type = rawType.trim().lowercase()

                            when {
                                type.startsWith("video/") -> videoTypes.add(type)
                                type.startsWith("audio/") -> audioTypes.add(type)
                            }
                        }
                    }
            } catch (_: Throwable) {
                // Some older Fire OS builds expose incomplete codec lists.
            }

            return JSONObject().apply {
                put("video", JSONArray(videoTypes.toList()))
                put("audio", JSONArray(audioTypes.toList()))
            }.toString()
        }

        @JavascriptInterface
        fun exitApp(): Boolean {
            runOnUiThread {
                finishAndRemoveTask()
            }
            return true
        }

        @JavascriptInterface
        fun openExternalUrl(url: String): Boolean {
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
        fun startUpdate(_url: String, versionName: String): String =
            if (::appUpdater.isInitialized) {
                appUpdater.startUpdate(versionName)
            } else {
                "error"
            }

        @JavascriptInterface
        fun play(payloadJson: String): String {
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

            val playbackDecision = PlaybackCompatibilityRouter.decide(payload)
            if (playbackDecision.useCompatibility) {
                payload.put("compatibilityPreflight", true)
                payload.put("compatibilityReason", playbackDecision.reason)
                payload.put(
                    "compatibilityAudioRecovery",
                    playbackDecision.reason.startsWith("audio", ignoreCase = true)
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
                    runOnUiThread {
                val activityClass =
                    if (playbackDecision.useCompatibility) {
                        CompatibilityPlayerActivity::class.java
                    } else {
                        PlayerActivity::class.java
                    }

                val intent = Intent(this@MainActivity, activityClass).apply {
                    putExtra(PlayerActivity.EXTRA_PAYLOAD, payload.toString())
                }

                try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(intent, REQUEST_NATIVE_PLAYER)
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
