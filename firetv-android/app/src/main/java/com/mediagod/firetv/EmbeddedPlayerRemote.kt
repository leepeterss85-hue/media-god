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
            // Use the Fire TV remote Menu button to reach provider tabs at
            // the top without stealing D-pad pointer control from playback.
            KeyEvent.KEYCODE_MENU -> "ContextMenu"
            else -> return false
        }
        if (event.action == KeyEvent.ACTION_DOWN && (event.repeatCount == 0 || key.startsWith("Arrow"))) {
            webView.evaluateJavascript(
                """(function(){
                  var root=document.querySelector('[data-mg-embedded-remote-player="true"]');
                  if(!root)return;
                  var key=${JSONObject.quote(key)};
                  var repeated=${event.repeatCount > 0};
                  // Provider controls belong to the trusted app document,
                  // never to the cross-origin iframe. Handle them here so a
                  // stalled/black iframe cannot swallow Menu, D-pad or Select.
                  // Restrict this recovery to VOD scrapers: Live TV unchanged.
                  var updateDialog=document.querySelector('[data-mg-fire-tv-update="true"]');
                  var updateIsOpen=updateDialog && updateDialog.getBoundingClientRect().height>1;
                  if(root.matches('[data-mg-onlyflix-player="true"]') && !updateIsOpen){
                    var bar=root.querySelector('[data-mg-movie-player-backups="true"], [data-mg-episode-player-backups="true"]');
                    var usable=function(el){
                      if(!el || !el.getBoundingClientRect)return false;
                      var r=el.getBoundingClientRect(),s=getComputedStyle(el);
                      return r.width>1 && r.height>1 && s.display!=='none' && s.visibility!=='hidden';
                    };
                    var tabs=bar?Array.from(bar.querySelectorAll('button')).filter(usable):[];
                    var headers=Array.from(root.querySelectorAll('[data-mg-player-topbar="true"] button')).filter(usable);
                    var source=root.querySelector('[data-mg-embedded-open-sources="true"]');
                    var fullscreen=root.querySelector('[data-mg-safe-fullscreen-toggle="true"]');
                    var frame=root.querySelector('[data-mg-embed-iframe="true"]');
                    var expanded=!!root.querySelector('[data-mg-safe-embed-fullscreen="true"]');
                    var current=document.activeElement;
                    var focus=function(el){
                      if(!usable(el))return;
                      try{el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'});}
                      catch(e){el.focus();}
                    };
                    var selected=tabs.find(function(el){return el.getAttribute('aria-pressed')==='true';})||tabs[0];
                    var tabIndex=tabs.indexOf(current),headIndex=headers.indexOf(current);
                    if(key==='ContextMenu'){
                      if(expanded)focus(fullscreen);
                      else if(tabIndex>=0)focus(source||headers[0]||fullscreen);
                      else if(headIndex>=0)focus(fullscreen||selected);
                      else focus(selected||source||fullscreen);
                      return;
                    }
                    if(tabIndex>=0 && (key.indexOf('Arrow')===0 || key==='Enter')){
                      if(key==='ArrowLeft')focus(tabs[(tabIndex-1+tabs.length)%tabs.length]);
                      else if(key==='ArrowRight')focus(tabs[(tabIndex+1)%tabs.length]);
                      else if(key==='ArrowDown')focus(fullscreen||frame);
                      else if(key==='ArrowUp')focus(source||headers[0]);
                      else if(!repeated)current.click();
                      return;
                    }
                    if(headIndex>=0 && (key.indexOf('Arrow')===0 || key==='Enter')){
                      if(key==='ArrowLeft')focus(headers[(headIndex-1+headers.length)%headers.length]);
                      else if(key==='ArrowRight')focus(headers[(headIndex+1)%headers.length]);
                      else if(key==='ArrowDown')focus(selected||fullscreen||frame);
                      else if(!repeated && key==='Enter')current.click();
                      return;
                    }
                    if(current===fullscreen && (key.indexOf('Arrow')===0 || key==='Enter')){
                      if(key==='Enter' && !repeated)current.click();
                      else if(key==='ArrowDown' && !expanded)focus(frame);
                      else if(key==='ArrowUp' && !expanded)focus(selected||source);
                      return;
                    }
                    // D-pad Up must still reach the playback controls INSIDE
                    // the iframe. Only leave cursor mode at the top edge; Menu
                    // always opens the scraper strip immediately.
                    if(key==='ArrowUp' && tabs.length && !expanded && current===frame){
                      var pointer=root.querySelector('[data-mg-embed-pointer="true"]');
                      var frameRect=frame&&frame.getBoundingClientRect();
                      var pointerRect=pointer&&pointer.getBoundingClientRect();
                      if(frameRect && pointerRect && frameRect.height>0 &&
                         pointerRect.top<=frameRect.top+Math.max(28,frameRect.height*0.1)){
                        focus(selected);return;
                      }
                    }
                  }
                  window.dispatchEvent(new KeyboardEvent('keydown',{
                    key:key,bubbles:true,cancelable:true,repeat:repeated
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
              var frame=document.querySelector('[data-mg-embedded-remote-player="true"] [data-mg-embed-iframe="true"]');
              if(!frame)return [];
              var x=$xLiteral, y=$yLiteral;
              var rect=frame.getBoundingClientRect();
              if(x<rect.left || x>rect.right || y<rect.top || y>rect.bottom ||
                 document.elementFromPoint(x,y)!==frame)return [0,0,0,0,0];
              // getBoundingClientRect() returns layout-viewport CSS coordinates.
              // visualViewport.width can be narrower on a TV WebView even at scale 1,
              // which magnifies pointer coordinates and misses the iframe.
              var visible=window.visualViewport;
              return [window.innerWidth,window.innerHeight,
                visible&&visible.width>0?visible.width:window.innerWidth,
                visible&&visible.height>0?visible.height:window.innerHeight,1];
            })()""".trimIndent()) { raw ->
                if (!allowed()) return@evaluateJavascript
                val viewport = runCatching { JSONArray(raw) }.getOrNull() ?: return@evaluateJavascript
                // Refuse a tap unless hit-testing confirms the point is inside
                // the OnlyFlix iframe. This prevents a scaled-coordinate miss
                // from activating Media God's source selector underneath it.
                if (viewport.optInt(4, 0) != 1) return@evaluateJavascript
                val width = viewport.optDouble(0, 0.0).toFloat()
                val height = viewport.optDouble(1, 0.0).toFloat()
                val visibleWidth = viewport.optDouble(2, width.toDouble()).toFloat()
                val visibleHeight = viewport.optDouble(3, height.toDouble()).toFloat()
                if (!width.isFinite() || !height.isFinite() ||
                    !visibleWidth.isFinite() || !visibleHeight.isFinite() ||
                    width <= 0f || height <= 0f || visibleWidth <= 0f || visibleHeight <= 0f ||
                    cssX < 0f || cssY < 0f || cssX >= width || cssY >= height) return@evaluateJavascript
                // The Fire TV WebView can have a fixed layout viewport wider than its
                // visible CSS viewport. Convert the pointer from visible CSS coordinates
                // to physical WebView pixels so the mouse press lands on the same element
                // that document.elementFromPoint() verified.
                val x = cssX * webView.width / visibleWidth
                val y = cssY * webView.height / visibleHeight
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
                 * WebView maps trusted mouse clicks from generic mouse-button events.
                 * Touch ACTION_DOWN/UP only produced touch events and never a DOM click.
                 * Set actionButton explicitly so Chromium sees which mouse button changed.
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
                        )
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
        ).also { event ->
            // ACTION_BUTTON_PRESS/RELEASE need the changed button encoded separately
            // from buttonState. Keep this guarded for vendor WebView/API differences.
            runCatching {
                MotionEvent::class.java
                    .getMethod("setActionButton", Int::class.javaPrimitiveType)
                    .invoke(event, MotionEvent.BUTTON_PRIMARY)
            }
        }
    }
}