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
            val xLiteral = cssX.toString()
            val yLiteral = cssY.toString()
            webView.evaluateJavascript("""(function(){
              var frame=document.querySelector('[data-mg-onlyflix-player="true"] [data-mg-embed-iframe="true"]');
              if(!frame)return [];
              var x=$xLiteral, y=$yLiteral;
              var rect=frame.getBoundingClientRect();
              if(x<rect.left || x>rect.right || y<rect.top || y>rect.bottom ||
                 document.elementFromPoint(x,y)!==frame)return [0,0,0,0,0];
              // getBoundingClientRect() returns layout-viewport CSS coordinates.
              // visualViewport.width can be narrower on a TV WebView even at scale 1,
              // which magnifies pointer coordinates and misses the iframe.
              return [window.innerWidth,window.innerHeight,window.devicePixelRatio||1,0,1];
            })()""".trimIndent()) { raw ->
                if (!allowed()) return@evaluateJavascript
                val viewport = runCatching { JSONArray(raw) }.getOrNull() ?: return@evaluateJavascript
                // Refuse a tap unless hit-testing confirms the point is inside
                // the OnlyFlix iframe. This prevents a scaled-coordinate miss
                // from activating Media God's source selector underneath it.
                if (viewport.optInt(4, 0) != 1) return@evaluateJavascript
                val width = viewport.optDouble(0, 0.0).toFloat()
                val height = viewport.optDouble(1, 0.0).toFloat()
                val pixelRatio = viewport.optDouble(2, 1.0).toFloat()
                if (!width.isFinite() || !height.isFinite() || !pixelRatio.isFinite() ||
                    width <= 0f || height <= 0f || pixelRatio <= 0f ||
                    cssX < 0f || cssY < 0f || cssX >= width || cssY >= height) return@evaluateJavascript
                // MotionEvent coordinates are Android physical pixels, while DOM
                // hit-testing returns CSS pixels. The layout viewport can be wider
                // than visualViewport on TV devices, so width-ratio scaling is wrong;
                // use Chromium's CSS-to-device pixel ratio instead.
                val x = cssX * pixelRatio
                val y = cssY * pixelRatio
                /*
                 * Fire TV's D-pad pointer is a mouse-like remote interaction.
                 * Sending a real primary-button mouse sequence is more reliable
                 * for HTML5 controls inside a cross-origin iframe than treating
                 * Select as a touchscreen gesture. In particular, video players
                 * commonly gate their Play control on trusted mouse activation.
                 */
                val downAt = SystemClock.uptimeMillis()
                val hover = MotionEvent.obtain(
                    downAt,
                    downAt,
                    MotionEvent.ACTION_HOVER_MOVE,
                    x,
                    y,
                    0
                )
                hover.source = InputDevice.SOURCE_MOUSE
                webView.dispatchGenericMotionEvent(hover)
                hover.recycle()

                /*
                 * Chromium's WebView expects mouse-button transitions as
                 * ACTION_BUTTON_PRESS / ACTION_BUTTON_RELEASE generic-motion
                 * events. Include BUTTON_PRIMARY in buttonState for the press;
                 * MotionEvent.setActionButton is not exposed by this SDK.
                 */
                val down = obtainMouseButtonEvent(
                    downAt,
                    downAt,
                    MotionEvent.ACTION_BUTTON_PRESS,
                    x,
                    y
                )
                webView.dispatchGenericMotionEvent(down)
                down.recycle()

                webView.postDelayed({
                    if (allowed()) {
                        val upAt = SystemClock.uptimeMillis()
                        val up = obtainMouseButtonEvent(
                            downAt,
                            upAt,
                            MotionEvent.ACTION_BUTTON_RELEASE,
                            x,
                            y
                        ).apply {
                            // Avoid compile-time dependency on setActionButton, which is
                            // absent from the project's compile SDK but present on supported Fire TV APIs.
                            runCatching {
                                javaClass.getMethod("setActionButton", Int::class.javaPrimitiveType)
                                    .invoke(this, MotionEvent.BUTTON_PRIMARY)
                            }
                        }
                        webView.dispatchGenericMotionEvent(up)
                        up.recycle()
                    }
                }, 80L)
            }
        }
        return true
    }

    /**
     * Build a mouse-button event with buttonState supplied to MotionEvent.obtain.
     * MotionEvent.buttonState is read-only on Android's Kotlin API.
     */
    private fun obtainMouseButtonEvent(
        downTime: Long,
        eventTime: Long,
        action: Int,
        x: Float,
        y: Float
    ): MotionEvent {
        val properties = MotionEvent.PointerProperties().apply {
            id = 0
            toolType = MotionEvent.TOOL_TYPE_MOUSE
        }
        val coordinates = MotionEvent.PointerCoords().apply {
            this.x = x
            this.y = y
            pressure = 1f
            size = 1f
        }
        return MotionEvent.obtain(
            downTime,
            eventTime,
            action,
            1,
            arrayOf(properties),
            arrayOf(coordinates),
            0,
            if (action == MotionEvent.ACTION_BUTTON_PRESS)
                MotionEvent.BUTTON_PRIMARY else 0,
            1f,
            1f,
            0,
            0,
            InputDevice.SOURCE_MOUSE,
            0
        )
    }
}