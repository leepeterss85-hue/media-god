package com.mediagod.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
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
                cacheMode = WebSettings.LOAD_DEFAULT
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
                override fun onPageCommitVisible(view: WebView?, url: String?) {
                    super.onPageCommitVisible(view, url)
                    injectMobileBootstrap()
                }

                override fun onPageFinished(view: WebView?, url: String?) {
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
                    if(!blocked){
                      videos.forEach(function(video){
                        if(video.dataset&&video.dataset.mgCometUncachedBlocked==='true'){
                          video.style.removeProperty('opacity');
                          delete video.dataset.mgCometUncachedBlocked;
                        }
                      });
                      return;
                    }
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

                window.dispatchEvent(new CustomEvent('mg:android-mobile-detected'));
              } catch(e) {}
            })();
            """.trimIndent()
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

            runOnUiThread {
                val intent = Intent(this@MainActivity, PlayerActivity::class.java).apply {
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

            return "true"
        }
    }
}
