package com.mediagod.mobile

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import org.json.JSONObject

/** Device-side safety guard for expensive software-decoded UHD playback. */
object DevicePerformanceGuard {
    fun snapshot(context: Context): JSONObject {
        val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val memory = ActivityManager.MemoryInfo()
        try {
            activity?.getMemoryInfo(memory)
        } catch (_: Throwable) {
        }

        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val thermalStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try { power?.currentThermalStatus ?: PowerManager.THERMAL_STATUS_NONE }
            catch (_: Throwable) { PowerManager.THERMAL_STATUS_NONE }
        } else {
            PowerManager.THERMAL_STATUS_NONE
        }

        val total = memory.totalMem.coerceAtLeast(0L)
        val available = memory.availMem.coerceAtLeast(0L)
        val lowRatio = total > 0L && available.toDouble() / total.toDouble() < 0.08
        val lowMemory = memory.lowMemory || lowRatio

        return JSONObject().apply {
            put("thermalStatus", thermalStatus)
            put("thermalStatusName", thermalName(thermalStatus))
            put("lowMemory", lowMemory)
            put("availableMemoryBytes", available)
            put("totalMemoryBytes", total)
            put("powerSaveMode", try { power?.isPowerSaveMode == true } catch (_: Throwable) { false })
        }
    }

    fun shouldProtect4k(context: Context, payload: JSONObject, url: String): Boolean {
        if (!payload.optBoolean("thermalProtection", true) || !looksUhd(payload, url)) return false
        val state = snapshot(context)
        val thermal = state.optInt("thermalStatus", PowerManager.THERMAL_STATUS_NONE)
        return state.optBoolean("lowMemory", false) ||
            thermal >= PowerManager.THERMAL_STATUS_SEVERE
    }

    private fun looksUhd(payload: JSONObject, url: String): Boolean {
        val width = payload.optInt("width", 0)
        val height = payload.optInt("height", 0)
        if (width >= 3000 || height >= 1700) return true
        val text = listOf(
            payload.optString("quality"),
            payload.optString("hintText"),
            payload.optString("title"),
            url
        ).joinToString(" ")
        return Regex("""(?:^|[^a-z0-9])(?:4k|2160p|uhd)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
            .containsMatchIn(text)
    }

    private fun thermalName(status: Int): String = when (status) {
        PowerManager.THERMAL_STATUS_NONE -> "normal"
        PowerManager.THERMAL_STATUS_LIGHT -> "light"
        PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
        PowerManager.THERMAL_STATUS_SEVERE -> "severe"
        PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
        PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
        PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
        else -> "unknown"
    }
}
