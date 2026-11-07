package com.mediagod.firetv

import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.widget.Button
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

/** Run on the Android-box candidate APK as well as a Fire TV regression device. */
@RunWith(AndroidJUnit4::class)
class ExternalWebRecoveryTest {
    @Test
    fun scraperNavigationCannotLaunchAnInstalledPlayer() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, ExternalWebActivity::class.java)
            .putExtra(ExternalWebActivity.EXTRA_URL, "https://example.test/player")
        ActivityScenario.launch<ExternalWebActivity>(intent).use { scenario ->
            scenario.onActivity { activity ->
                val route = ExternalWebActivity::class.java.getDeclaredMethod(
                    "handleNonWebUri", Uri::class.java
                ).apply { isAccessible = true }
                fun consumed(url: String) = route.invoke(activity, Uri.parse(url)) as Boolean
                for (url in listOf(
                    "intent://play#Intent;scheme=video;package=example.player;end",
                    "vlc://https://example.test/video.mp4", "market://details?id=example.player",
                    "file:///sdcard/video.mp4", "javascript:window.open('https://example.test')"
                )) assertTrue(url, consumed(url))
                for (url in listOf(
                    "https://example.test/player", "http://example.test/player",
                    "blob:https://example.test/video", "about:blank"
                )) assertFalse(url, consumed(url))

                val field = ExternalWebActivity::class.java.getDeclaredField("webView")
                    .apply { isAccessible = true }
                val webView = field.get(activity) as WebView
                assertTrue(webView.settings.supportMultipleWindows())
                assertFalse(webView.settings.javaScriptCanOpenWindowsAutomatically)
                assertTrue(webView.settings.javaScriptEnabled)
                assertTrue(webView.settings.domStorageEnabled)
                assertFalse(webView.settings.mediaPlaybackRequiresUserGesture)
            }
            scenario.recreate()
            scenario.onActivity { activity -> assertFalse(activity.isFinishing) }
        }
    }
    @Test
    fun onlyMainPageFailureShowsRemoteRetryAndBack() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, ExternalWebActivity::class.java)
            .putExtra(ExternalWebActivity.EXTRA_URL, "https://example.test/player")
        ActivityScenario.launch<ExternalWebActivity>(intent).use { scenario ->
            scenario.onActivity { activity ->
                fun field(name: String) = ExternalWebActivity::class.java.getDeclaredField(name)
                    .apply { isAccessible = true }.get(activity)
                val webView = field("webView") as WebView
                webView.stopLoading()
                val client = webView.webViewClient
                client.onPageStarted(webView, "https://example.test/player", null)
                val error = object : WebResourceError() {
                    override fun getErrorCode() = -2
                    override fun getDescription(): CharSequence = "Host unavailable"
                }
                fun request(main: Boolean) = object : WebResourceRequest {
                    override fun getUrl() = Uri.parse("https://example.test/player")
                    override fun isForMainFrame() = main
                    override fun isRedirect() = false
                    override fun hasGesture() = false
                    override fun getMethod() = "GET"
                    override fun getRequestHeaders(): MutableMap<String, String> = mutableMapOf()
                }
                client.onReceivedError(webView, request(false), error)
                assertNull(field("loadErrorPanel"))
                client.onReceivedError(webView, request(true), error)
                assertNotNull(field("loadErrorPanel"))
                val retry = field("retryButton") as Button
                assertTrue(retry.hasFocus())
                client.onPageFinished(webView, "https://example.test/player")
                assertTrue("Page-finished must not steal remote focus", retry.hasFocus())
                retry.performClick()
                assertNull(field("loadErrorPanel"))
                client.onReceivedError(webView, request(true), error)
                activity.onKeyDown(android.view.KeyEvent.KEYCODE_BACK,
                    android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_BACK))
                assertTrue(activity.isFinishing)
            }
        }
    }

}
