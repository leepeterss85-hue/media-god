package com.mediagod.mobile

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.os.SystemClock
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlaybackLifecycleRegressionTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @Test
    fun isolatedPlayerProcessSurvivesRapidRelaunchBackgroundAndResume() {
        val mainPid = Process.myPid()

        repeat(5) { index ->
            context.startActivity(
                playerIntent(index).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
            )

            waitUntil { media3PlayerPids().isNotEmpty() }
            val pids = media3PlayerPids()

            assertEquals(
                "Android must keep exactly one isolated Media3 player process",
                1,
                pids.size
            )
            assertNotEquals(
                "Media3 must never share Media God's main process",
                mainPid,
                pids.single()
            )
        }

        instrumentation.uiAutomation.executeShellCommand("input keyevent 3").close()
        SystemClock.sleep(300L)

        context.startActivity(
            playerIntent(99).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        )

        waitUntil { media3PlayerPids().isNotEmpty() }
        val resumedPids = media3PlayerPids()
        assertEquals(1, resumedPids.size)
        assertNotEquals(mainPid, resumedPids.single())
        assertTrue("Instrumentation/main Media God process must remain alive", isProcessAlive(mainPid))
    }

    private fun playerIntent(index: Int): Intent {
        val payload = JSONObject()
            .put("requestId", "regression-mobile-$index")
            .put("url", "https://10.255.255.${(index % 200) + 1}/media.mp4")
            .put("title", "Playback regression")
            .put("audioLanguage", "en")
            .put("subtitlesEnabled", false)

        return Intent(context, PlayerActivity::class.java)
            .putExtra(PlayerActivity.EXTRA_PAYLOAD, payload.toString())
    }

    private fun media3PlayerPids(): List<Int> {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val expectedName = "${context.packageName}:media3_player"

        return manager.runningAppProcesses.orEmpty()
            .filter { it.processName == expectedName }
            .map { it.pid }
            .distinct()
    }

    private fun isProcessAlive(pid: Int): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return manager.runningAppProcesses.orEmpty().any { it.pid == pid }
    }

    private fun waitUntil(timeoutMs: Long = 5000L, condition: () -> Boolean) {
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        while (SystemClock.elapsedRealtime() < deadline) {
            instrumentation.waitForIdleSync()
            if (condition()) return
            SystemClock.sleep(50L)
        }
        assertTrue("Timed out waiting for isolated playback lifecycle state", condition())
    }
}
