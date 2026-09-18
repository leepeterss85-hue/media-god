package com.mediagod.mobile

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlaybackLifecycleRegressionTest {
    private val openScenarios = mutableListOf<ActivityScenario<PlayerActivity>>()

    @Before
    fun resetRegistry() {
        PlaybackInstanceRegistry.resetForTests()
    }

    @After
    fun closeActivities() {
        openScenarios.asReversed().forEach { scenario ->
            runCatching { scenario.close() }
        }
        waitUntil { PlaybackInstanceRegistry.activePlayers() == 0 }
    }

    @Test
    fun rapidSourceSwitchRotationAndResumeNeverCreateTwoPlayers() {
        repeat(5) { index ->
            val scenario = ActivityScenario.launch<PlayerActivity>(playerIntent(index))
            openScenarios += scenario
            waitUntil { PlaybackInstanceRegistry.maxObservedPlayers() >= 1 }
            assertTrue("Rapid source switching created more than one native player", PlaybackInstanceRegistry.activePlayers() <= 1)
            assertEquals(1, PlaybackInstanceRegistry.maxObservedPlayers())
        }

        val activeScenario = openScenarios.last()
        activeScenario.recreate()
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        assertTrue(PlaybackInstanceRegistry.activePlayers() <= 1)
        assertEquals(1, PlaybackInstanceRegistry.maxObservedPlayers())

        activeScenario.moveToState(Lifecycle.State.CREATED)
        waitUntil { PlaybackInstanceRegistry.activePlayers() == 0 }

        activeScenario.moveToState(Lifecycle.State.RESUMED)
        waitUntil { PlaybackInstanceRegistry.activePlayers() <= 1 }
        assertEquals(1, PlaybackInstanceRegistry.maxObservedPlayers())
    }

    private fun playerIntent(index: Int): Intent {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val payload = JSONObject()
            .put("requestId", "regression-mobile-$index")
            .put("url", "https://10.255.255.${index + 1}/media.mp4")
            .put("title", "Playback regression")
            .put("audioLanguage", "en")
            .put("subtitlesEnabled", false)

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
