package com.mediagod.firetv

import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject

/** Keep iframe remote input in the app document, where its navigator lives. */
class EmbeddedPlayerRemote(private val webView: WebView, private val allowed: () -> Boolean) {
    @Volatile var enabled = false

    fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (!enabled || !allowed()) return false
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
            KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
            KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> "Enter"
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "MediaPlayPause"
            KeyEvent.KEYCODE_MEDIA_PLAY -> "MediaPlay"
            else -> return false
        }
        if (event.action == KeyEvent.ACTION_DOWN && (event.repeatCount == 0 || key.startsWith("Arrow"))) {
            webView.evaluateJavascript(
                """(function(){
                  if(!document.querySelector('[data-mg-onlyflix-player="true"]'))return;
                  window.dispatchEvent(new KeyboardEvent('keydown',{
                    key:${JSONObject.quote(key)},bubbles:true,cancelable:true,repeat:${event.repeatCount > 0}
                  }));
                })()""".trimIndent(), null
            )
        }
        return true // Consume both halves so WebView cannot also click the iframe.
    }

    fun tap(cssX: Float, cssY: Float): Boolean {
        if (!enabled || !allowed() || !cssX.isFinite() || !cssY.isFinite()) return false
        webView.post {
            if (!allowed()) return@post
            // Convert layout-relative CSS coordinates through the visible viewport.
            // A fixed TV layout can be wider than the area WebView is showing.
            webView.evaluateJavascript("""(function(){
              if(!document.querySelector('[data-mg-onlyflix-player="true"]'))return [];
              var v=window.visualViewport;
              return v?[v.width,v.height,v.offsetLeft,v.offsetTop]:[window.innerWidth,window.innerHeight,0,0];
            })()""".trimIndent()) { raw ->
                if (!allowed()) return@evaluateJavascript
                val viewport = runCatching { JSONArray(raw) }.getOrNull() ?: return@evaluateJavascript
                val width = viewport.optDouble(0, 0.0).toFloat()
                val height = viewport.optDouble(1, 0.0).toFloat()
                val left = viewport.optDouble(2, 0.0).toFloat()
                val top = viewport.optDouble(3, 0.0).toFloat()
                if (!width.isFinite() || !height.isFinite() || !left.isFinite() || !top.isFinite() ||
                    width <= 0f || height <= 0f || cssX < left || cssY < top ||
                    cssX >= left + width || cssY >= top + height) return@evaluateJavascript
                val x = (cssX - left) * webView.width / width
                val y = (cssY - top) * webView.height / height
                val downAt = SystemClock.uptimeMillis()
                val down = MotionEvent.obtain(downAt, downAt, MotionEvent.ACTION_DOWN, x, y, 0)
                down.source = InputDevice.SOURCE_TOUCHSCREEN
                webView.dispatchTouchEvent(down)
                down.recycle()
                webView.postDelayed({
                    if (allowed()) {
                        val up = MotionEvent.obtain(downAt, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y, 0)
                        up.source = InputDevice.SOURCE_TOUCHSCREEN
                        webView.dispatchTouchEvent(up)
                        up.recycle()
                    }
                }, 60L)
            }
        }
        return true
    }
}