package com.mediagod.firetv

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlaybackLifecycleRegressionTest {
    private var scenario: ActivityScenario<PlayerActivity>? = null

    @Before
    fun resetRegistry() {
        PlaybackInstanceRegistry.resetForTests()
    }

    @After
    fun closeActivity() {
        runCatching { scenario?.close() }
        waitUntil { PlaybackInstanceRegistry.activePlayers() == 0 }
    }

    @Test
    fun rapidSourceSwitchRotationAndResumeNeverCreateTwoPlayers() {
        val launched = ActivityScenario.launch<PlayerActivity>(livePlayerIntent())
        scenario = launched
        waitUntil { PlaybackInstanceRegistry.maxObservedPlayers() >= 1 }
        assertEquals(1, PlaybackInstanceRegistry.maxObservedPlayers())

        repeat(9) { step ->
            launched.onActivity { activity ->
                val method = PlayerActivity::class.java.getDeclaredMethod(
                    "switchNativeSource",
                    Int::class.javaPrimitiveType!!,
                    Boolean::class.javaPrimitiveType!!
                )
                method.isAccessible = true
                method.invoke(activity, (step + 1) % 3, false)
            }
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            assertTrue("Rapid Fire TV source switching created more than one native player", PlaybackInstanceRegistry.activePlayers() <= 1)
            assertEquals(1, PlaybackInstanceRegistry.maxObservedPlayers())
        }

        launched.recreate()
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        assertTrue(PlaybackInstanceRegistry.activePlayers() <= 1)
        assertEquals(1, PlaybackInstanceRegistry.maxObservedPlayers())

        launched.moveToState(Lifecycle.State.CREATED)
        waitUntil { PlaybackInstanceRegistry.activePlayers() == 0 }

        launched.moveToState(Lifecycle.State.RESUMED)
        waitUntil { PlaybackInstanceRegistry.activePlayers() <= 1 }
        assertEquals(1, PlaybackInstanceRegistry.maxObservedPlayers())
    }

    private fun livePlayerIntent(): Intent {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val sources = JSONArray()
        repeat(3) { index ->
            sources.put(
                JSONObject()
                    .put("label", "Regression source ${index + 1}")
                    .put("url", "https://10.255.255.${index + 1}/live.m3u8")
                    .put("webIndex", index)
            )
        }

        val payload = JSONObject()
            .put("requestId", "regression-fire-tv")
            .put("url", "https://10.255.255.1/live.m3u8")
            .put("title", "Playback regression")
            .put("live", true)
            .put("audioLanguage", "en")
            .put("activeSourceIndex", 0)
            .put("sources", sources)

        return Intent(context, PlayerActivity::class.java)
            .putExtra(PlayerActivity.EXTRA_PAYLOAD, payload.toString())
    }

    private fun waitUntil(timeoutMs: Long = 5000L, condition: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        while (SystemClock.elapsedRealtime() < deadline) {
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            if (condition()) return
            SystemClock.sleep(50L)
        }
        assertTrue("Timed out waiting for playback lifecycle state", condition())
    }
}
