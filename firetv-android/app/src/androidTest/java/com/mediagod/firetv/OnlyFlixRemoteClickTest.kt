package com.mediagod.firetv

import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** Exercises real WebView touch delivery; the child player is a separate origin. */
@RunWith(AndroidJUnit4::class)
class OnlyFlixRemoteClickTest {
    class ClickProbe {
        val diagnostics = java.util.concurrent.CopyOnWriteArrayList<String>()
        @JavascriptInterface fun record(value: String) { diagnostics.add(value) }
        val loaded = CountDownLatch(1)
        val firstClick = CountDownLatch(1)
        val secondClick = CountDownLatch(1)
        val clicks = AtomicInteger(0)
        val lastClick = AtomicReference<JSONObject>()

        @JavascriptInterface fun ready() { loaded.countDown() }
        @JavascriptInterface fun clicked(value: String) {
            lastClick.set(JSONObject(value))
            if (clicks.incrementAndGet() == 1) firstClick.countDown()
            else secondClick.countDown()
        }
    }

    @Test
    fun selectAndPlayPressTheButtonInsideAFocusedCrossOriginFrame() = verifyRemoteClick(960)

    @Test
    fun selectAndPlayRemainAccurateWithAWiderLayoutViewport() = verifyRemoteClick(1600)

    private fun verifyRemoteClick(viewportWidth: Int) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val probe = ClickProbe()
        val source = instrumentation.context.assets.open("onlyFlixRemoteActions.js")
            .bufferedReader().use { it.readText() }
            .replace(Regex("^import[^\\n]+\\n"), "")
            .replace("export const tapOnlyFlixForRemote", "const tapOnlyFlixForRemote")
        val childUrl = "https://onlyflix-player.test/player"
        val parent = """
            <!doctype html><meta name="viewport" content="width=$viewportWidth, initial-scale=1.0">
            <style>body{margin:0}#stage{position:relative;margin:90px 3% 0;width:94%;height:260px}
            iframe{width:100%;height:100%;border:0}#pointer{position:absolute;left:10%;top:67%;
            width:28px;height:28px;transform:translate(-50%,-50%);pointer-events:none}</style>
            <div data-mg-onlyflix-player="true"><button id="toolbar">Back</button>
              <div id="stage"><iframe data-mg-embed-iframe="true" src="$childUrl"
                allow="autoplay; fullscreen" sandbox="allow-scripts allow-same-origin"></iframe>
                <div id="pointer" data-mg-embed-pointer="true"></div></div></div>
            <script>
            const nativeFireTvSimulateTap=(x,y)=>{
              const accepted=MediaGodNative.simulateTap(x,y);
              ClickProbe.record(JSON.stringify({tap:[x,y],accepted,inner:[innerWidth,innerHeight],
                visual:[visualViewport.width,visualViewport.height,visualViewport.offsetLeft,visualViewport.offsetTop,visualViewport.scale]}));
              return accepted;
            };
            $source
            window.addEventListener('keydown',event=>{
              ClickProbe.record('key:'+event.key+',focus:'+document.activeElement.tagName);
              const direction=event.key.startsWith('Arrow')?event.key.slice(5).toLowerCase():null;
              tapOnlyFlixForRemote({direction,selectKey:event.key==='Enter',repeat:event.repeat,
                mediaAction:event.key==='MediaPlayPause'?'playpause':event.key==='MediaPlay'?'play':null});
            });
            window.addEventListener('mg:onlyflix-pointer-move',event=>{
              if(event.detail==='right')document.getElementById('pointer').style.left='calc(10% + 16px)';
            });
            window.addEventListener('message',event=>{
              if(event.origin==='https://onlyflix-player.test'){
                ClickProbe.record(JSON.stringify(event.data));
                if(event.data.type==='clicked')ClickProbe.clicked(JSON.stringify(event.data));
              }
            });
            document.querySelector('iframe').onload=()=>{
              document.querySelector('iframe').focus();
              ClickProbe.record('enabled:'+MediaGodNative.setEmbeddedPlayerRemoteActive(true));ClickProbe.ready();
            };
            </script>
        """.trimIndent()
        val child = """
            <!doctype html><style>body{margin:0}button{position:absolute;left:10%;top:67%;
            width:160px;height:100px;transform:translate(-50%,-50%)}</style>
            <button id="play">Play movie</button><script>
            window.addEventListener('load',()=>parent.postMessage({type:'child',inner:[innerWidth,innerHeight],
              rect:document.getElementById('play').getBoundingClientRect().toJSON()},'*'));
            document.addEventListener('touchstart',event=>parent.postMessage({type:'touch',
              x:event.touches[0].clientX,y:event.touches[0].clientY,target:event.target.tagName},'*'));
            document.getElementById('play').onclick=event=>{
              event.target.textContent='Playing';parent.postMessage({type:'clicked',
              trusted:event.isTrusted,activation:navigator.userActivation.isActive},'*');
            };
            </script>
        """.trimIndent()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val field = MainActivity::class.java.getDeclaredField("webView")
                    .apply { isAccessible = true }
                val view = field.get(activity) as WebView
                view.stopLoading()
                view.setOnTouchListener { _, event ->
                    probe.record("native touch:${event.action}:${event.x},${event.y},view:${view.width},${view.height}")
                    false
                }
                view.addJavascriptInterface(probe, "ClickProbe")
                view.webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView?, request: WebResourceRequest?
                    ): WebResourceResponse {
                        val html = if (request?.url.toString() == childUrl) child else parent
                        return WebResourceResponse("text/html", "UTF-8", html.byteInputStream())
                    }
                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                        MainActivity::class.java.getDeclaredField("currentTopLevelUrl")
                            .apply { isAccessible = true }.set(activity, url.orEmpty())
                    }
                }
                view.loadUrl(BuildConfig.MEDIA_GOD_URL)
            }
            assertTrue("Embedded player did not load", probe.loaded.await(15, TimeUnit.SECONDS))
            val rendered = CountDownLatch(1)
            scenario.onActivity { activity ->
                val view = MainActivity::class.java.getDeclaredField("webView")
                    .apply { isAccessible = true }.get(activity) as WebView
                view.postVisualStateCallback(1, object : WebView.VisualStateCallback() {
                    override fun onComplete(requestId: Long) { rendered.countDown() }
                })
            }
            assertTrue("Embedded player did not render", rendered.await(10, TimeUnit.SECONDS))
            scenario.onActivity { activity ->
                assertTrue(activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER)))
                assertTrue(activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_CENTER)))
            }
            val selected = probe.firstClick.await(10, TimeUnit.SECONDS)
            assertTrue("Select never pressed the movie Play button: ${probe.diagnostics.joinToString("; ")}", selected)
            assertTrue("The player click must be a trusted touch", probe.lastClick.get().getBoolean("trusted"))
            assertTrue("The player must receive user activation", probe.lastClick.get().getBoolean("activation"))
            assertEquals(1, probe.clicks.get())
            scenario.onActivity { activity ->
                activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT))
                activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_RIGHT))
                // The first click leaves focus in the child; Play must still reach that player.
                activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
                activity.dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
            }
            assertTrue("Play/Pause never reached the focused child player", probe.secondClick.await(10, TimeUnit.SECONDS))
            assertEquals(2, probe.clicks.get())
            assertTrue(probe.lastClick.get().getBoolean("trusted"))
        }
    }
}
