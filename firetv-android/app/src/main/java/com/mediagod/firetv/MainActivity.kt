package com.mediagod.firetv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.media.MediaCodecList
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

class MainActivity : Activity() {
    companion object {
        private const val REQUEST_NATIVE_PLAYER = 8401
    }

    private lateinit var webView: WebView
    private val nativePlayerLock = Any()
    @Volatile private var playerOpen = false
    @Volatile private var activeNativeRequestId = ""
    private var pendingNativeResultScript: String? = null

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
                override fun onPageFinished(view: WebView?, url: String?) {
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

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enterImmersiveMode()
        }
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
         * Fire OS devices do not all order onActivityResult/onResume in the
         * same way. Dispatch now and also keep the same event queued for
         * onResume. If the immediate dispatch succeeds, the duplicate resume
         * event is harmless because the web player has already cleared the
         * matching request id. If it cannot run while the WebView is paused,
         * the queued copy guarantees delivery when Media God becomes active.
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
                window.dispatchEvent(new CustomEvent('mg:tv-remote-detected'));
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
                put("platform", "fire-tv")
                put("widthDp", configuration.screenWidthDp)
                put("heightDp", configuration.screenHeightDp)
                put("logicalWidth", 960)
                put("logicalHeight", 540)
            }.toString()
        }

        @JavascriptInterface
        fun getAppInfo(): String =
            JSONObject().apply {
                put("native", true)
                put("platform", "fire-tv")
                put("packageName", packageName)
                put("versionCode", BuildConfig.VERSION_CODE)
                put("versionName", BuildConfig.VERSION_NAME)
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
                        put("message", error.message ?: "Could not open Fire TV player")
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
