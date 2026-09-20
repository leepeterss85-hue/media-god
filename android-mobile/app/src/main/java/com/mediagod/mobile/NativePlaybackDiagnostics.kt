package com.mediagod.mobile

import android.content.Context
import android.net.Uri
import org.json.JSONObject

/** Safe compact playback snapshot; signed media URLs are never persisted. */
object NativePlaybackDiagnostics {
    fun snapshot(
        payload: JSONObject,
        url: String,
        engine: String,
        event: String,
        message: String = "",
        extra: JSONObject? = null,
        context: Context? = null
    ): JSONObject {
        val source = selectedSource(payload, url)
        val result = JSONObject().apply {
            put("at", System.currentTimeMillis())
            put("engine", engine)
            put("event", event)
            put("message", message.take(240))
            put("host", safeHost(url))
            put("sourceName", first(source, payload, "sourceName"))
            put("label", first(source, payload, "label"))
            put("quality", first(source, payload, "quality"))
            put("mimeType", first(source, payload, "mimeType"))
            put("container", first(source, payload, "container"))
            put("videoCodec", first(source, payload, "videoCodec"))
            put("audioCodec", first(source, payload, "audioCodec"))
            put("videoProfile", first(source, payload, "videoProfile"))
            put("hdrFormat", first(source, payload, "hdrFormat"))
            put("bitDepth", firstNumber(source, payload, "bitDepth"))
            put("width", firstNumber(source, payload, "width"))
            put("height", firstNumber(source, payload, "height"))
            put("fps", firstNumber(source, payload, "fps"))
            put("bitrate", firstNumber(source, payload, "bitrate"))
            put("compatibilityReason", payload.optString("compatibilityReason"))
            put(
                "compatibilityAudioRecovery",
                payload.optBoolean("compatibilityAudioRecovery", false)
            )
            put("compatibilityErrorCode", payload.optInt("compatibilityErrorCode", 0))
            put("compatibilityError", payload.optString("compatibilityError").take(240))
            put("forceCompatibilityReason", payload.optString("forceCompatibilityReason"))
            put("audioOutputMode", payload.optString("audioOutputMode", "auto"))
            put("lipSyncMs", payload.optInt("lipSyncMs", 0))
            put("dialogueBoost", payload.optString("dialogueBoost", "off"))
            put("volumeNormalization", payload.optBoolean("volumeNormalization", false))
            put("networkDownlinkMbps", payload.optDouble("networkDownlinkMbps", 0.0))
            put("preflight", payload.optJSONObject("streamPreflight"))
            if (context != null) put("devicePerformance", DevicePerformanceGuard.snapshot(context))
        }

        if (extra != null) {
            val keys = extra.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                result.put(key, extra.opt(key))
            }
        }
        return result
    }

    private fun selectedSource(payload: JSONObject, url: String): JSONObject? {
        val sources = payload.optJSONArray("sources") ?: return null
        val wantedWebIndex = payload.optInt("activeSourceIndex", -1)
        var urlMatch: JSONObject? = null
        for (index in 0 until sources.length()) {
            val item = sources.optJSONObject(index) ?: continue
            if (item.optInt("webIndex", index) == wantedWebIndex) return item
            if (urlMatch == null && item.optString("url").trim() == url.trim()) urlMatch = item
        }
        return urlMatch
    }

    private fun first(source: JSONObject?, payload: JSONObject, key: String): String =
        source?.optString(key)?.trim().orEmpty().ifBlank { payload.optString(key).trim() }

    private fun firstNumber(source: JSONObject?, payload: JSONObject, key: String): Double {
        fun number(json: JSONObject?): Double {
            if (json == null || !json.has(key)) return 0.0
            val raw = json.opt(key) ?: return 0.0
            return when (raw) {
                is Number -> raw.toDouble()
                else -> Regex("""\d+(?:\.\d+)?""").find(raw.toString())?.value?.toDoubleOrNull() ?: 0.0
            }
        }
        return number(source).takeIf { it > 0.0 } ?: number(payload)
    }

    private fun safeHost(url: String): String =
        try { Uri.parse(url).host.orEmpty() } catch (_: Throwable) { "" }
}
