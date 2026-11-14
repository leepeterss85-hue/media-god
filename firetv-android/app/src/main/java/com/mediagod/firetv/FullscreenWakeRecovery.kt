package com.mediagod.firetv

import android.view.View
import android.widget.FrameLayout

/** Rebind Chromium's fullscreen surface after Fire OS dreams/backgrounding. */
internal class FullscreenWakeRecovery(
    private val root: () -> FrameLayout,
    private val currentView: () -> View?
) {
    private var resumed = false
    private var interruptedView: View? = null
    private var queued = false

    fun onPause() {
        resumed = false
        interruptedView = currentView()
    }

    fun onResume() {
        resumed = true
        recoverWhenReady()
    }

    fun onWindowFocusChanged(hasFocus: Boolean) {
        if (!hasFocus) interruptedView = currentView()
        else recoverWhenReady()
    }

    fun clear() {
        interruptedView = null
    }

    private fun recoverWhenReady() {
        val view = interruptedView ?: return
        if (!resumed || queued) return
        val host = root()
        if (!host.hasWindowFocus()) return
        queued = true
        host.post {
            queued = false
            // Pause, Back or a new fullscreen session can race this posted work.
            if (!resumed || !host.hasWindowFocus()) return@post
            if (interruptedView !== view || currentView() !== view) return@post
            interruptedView = null
            if (view.parent !== host) return@post
            val params = view.layoutParams
            // Keep the same Chromium view and callback. Reattaching recreates
            // its lost surface without navigating, seeking, or pressing Play.
            host.removeView(view)
            host.addView(view, params)
            view.visibility = View.VISIBLE
            view.requestLayout()
            view.invalidate()
            view.requestFocus()
        }
    }
}
