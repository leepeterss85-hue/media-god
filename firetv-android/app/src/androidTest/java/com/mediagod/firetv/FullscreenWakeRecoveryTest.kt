package com.mediagod.firetv

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FullscreenWakeRecoveryTest {
    private class Host(context: Context) : FrameLayout(context) {
        var focused = true
        var additions = 0
        val pending = mutableListOf<Runnable>()
        override fun hasWindowFocus() = focused
        override fun post(action: Runnable): Boolean { pending.add(action); return true }
        override fun onViewAdded(child: View) { super.onViewAdded(child); additions++ }
        fun drain() { val tasks = pending.toList(); pending.clear(); tasks.forEach { it.run() } }
    }

    @Test fun wakeWaitsForFocusAndReattachesSameViewOnlyOnce() = onMain {
        val host = Host(ApplicationProvider.getApplicationContext())
        val video = View(host.context)
        host.addView(video)
        val recovery = FullscreenWakeRecovery({ host }, { video })
        recovery.onResume()
        assertEquals(0, host.pending.size)
        recovery.onPause()
        host.focused = false
        recovery.onWindowFocusChanged(false)
        recovery.onResume()
        assertEquals(0, host.pending.size)
        host.focused = true
        recovery.onWindowFocusChanged(true)
        recovery.onResume()
        assertEquals(1, host.pending.size)
        host.drain()
        assertSame(video, host.getChildAt(0))
        assertEquals(2, host.additions)
        recovery.onWindowFocusChanged(true)
        host.drain()
        assertEquals(2, host.additions)
    }

    @Test fun backOrReplacementCancelsPendingRecovery() = onMain {
        val host = Host(ApplicationProvider.getApplicationContext())
        var video: View? = View(host.context)
        host.addView(video)
        val recovery = FullscreenWakeRecovery({ host }, { video })
        recovery.onResume()
        recovery.onPause()
        recovery.onResume()
        recovery.clear()
        host.removeAllViews()
        video = View(host.context)
        host.addView(video)
        host.drain()
        assertEquals(2, host.additions)
        assertSame(video, host.getChildAt(0))
    }

    @Test fun focusOnlyScreensaverAndPauseBeforePostedWorkAreSafe() = onMain {
        val host = Host(ApplicationProvider.getApplicationContext())
        val video = View(host.context)
        host.addView(video)
        val recovery = FullscreenWakeRecovery({ host }, { video })
        recovery.onResume()
        host.focused = false
        recovery.onWindowFocusChanged(false)
        host.focused = true
        recovery.onWindowFocusChanged(true)
        recovery.onPause()
        host.drain()
        assertEquals(1, host.additions)
        recovery.onResume()
        host.drain()
        assertEquals(2, host.additions)
    }

    private fun onMain(block: () -> Unit) =
        InstrumentationRegistry.getInstrumentation().runOnMainSync(block)
}
