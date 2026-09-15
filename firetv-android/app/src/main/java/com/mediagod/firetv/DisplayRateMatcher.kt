package com.mediagod.firetv

import android.app.Activity
import android.os.Build
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.round

/**
 * Supplies Android/Fire OS with the content frame-rate hint. On Fire TV we also
 * select a same-resolution display mode when the device exposes a clean exact
 * or integer-multiple match (23.976/24/25/50/59.94/60 etc.).
 */
object DisplayRateMatcher {
    fun apply(
        activity: Activity,
        payload: JSONObject,
        url: String,
        forceDisplayMode: Boolean
    ): Float {
        val fps = contentFrameRate(payload, url)
        apply(activity, fps, forceDisplayMode)
        return fps
    }

    fun apply(
        activity: Activity,
        fps: Float,
        forceDisplayMode: Boolean
    ) {
        if (!fps.isFinite() || fps < 20f || fps > 240f) return

        try {
            val attributes = activity.window.attributes
            attributes.preferredRefreshRate = fps

            if (forceDisplayMode && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                @Suppress("DEPRECATION")
                val display = activity.windowManager.defaultDisplay
                val current = display.mode
                val sameResolution = display.supportedModes.filter {
                    it.physicalWidth == current.physicalWidth &&
                        it.physicalHeight == current.physicalHeight
                }

                val best = sameResolution
                    .mapNotNull { mode ->
                        val ratio = mode.refreshRate / fps
                        val nearestMultiple = round(ratio).toInt()
                        if (nearestMultiple < 1) return@mapNotNull null
                        val ratioError = abs(ratio - nearestMultiple)
                        if (ratioError > 0.025f) return@mapNotNull null

                        val score =
                            ratioError * 1000f +
                                (nearestMultiple - 1) * 8f +
                                abs(mode.refreshRate - fps) * 0.02f
                        mode to score
                    }
                    .minByOrNull { it.second }
                    ?.first

                if (best != null) {
                    attributes.preferredDisplayModeId = best.modeId
                }
            }

            activity.window.attributes = attributes
        } catch (_: Throwable) {
            // Frame-rate matching is an optimisation, never a playback blocker.
        }
    }

    fun clear(activity: Activity) {
        try {
            val attributes = activity.window.attributes
            attributes.preferredRefreshRate = 0f
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                attributes.preferredDisplayModeId = 0
            }
            activity.window.attributes = attributes
        } catch (_: Throwable) {
        }
    }

    fun contentFrameRate(payload: JSONObject, url: String): Float {
        val source = selectedSource(payload, url)
        val explicit = sequenceOf(
            source?.optDouble("fps", 0.0) ?: 0.0,
            payload.optDouble("fps", 0.0)
        ).firstOrNull { it > 0.0 } ?: 0.0

        if (explicit in 20.0..240.0) {
            return explicit.toFloat()
        }

        val text = listOf(
            source?.optString("hintText").orEmpty(),
            source?.optString("label").orEmpty(),
            source?.optString("name").orEmpty(),
            payload.optString("hintText"),
            payload.optString("title")
        ).filter { it.isNotBlank() }.joinToString(" ")

        val patterns = listOf(
            Regex(
                """(?:4320|2160|1440|1080|720)p[ ._-]?(23\.976|24|25|29\.97|30|50|59\.94|60|100|120)""",
                RegexOption.IGNORE_CASE
            ),
            Regex(
                """(?:^|[^0-9])(23\.976|24|25|29\.97|30|50|59\.94|60|100|120)[ ._-]*fps(?:[^a-z0-9]|$)""",
                RegexOption.IGNORE_CASE
            )
        )

        patterns.forEach { regex ->
            regex.find(text)
                ?.groupValues
                ?.getOrNull(1)
                ?.toFloatOrNull()
                ?.takeIf { it in 20f..240f }
                ?.let { return it }
        }

        return 0f
    }

    private fun selectedSource(payload: JSONObject, url: String): JSONObject? {
        val sources = payload.optJSONArray("sources") ?: return null
        val wantedWebIndex = payload.optInt("activeSourceIndex", -1)
        var urlMatch: JSONObject? = null

        for (index in 0 until sources.length()) {
            val item = sources.optJSONObject(index) ?: continue
            if (item.optInt("webIndex", index) == wantedWebIndex) {
                return item
            }
            if (urlMatch == null && item.optString("url").trim() == url.trim()) {
                urlMatch = item
            }
        }

        return urlMatch
    }
}
