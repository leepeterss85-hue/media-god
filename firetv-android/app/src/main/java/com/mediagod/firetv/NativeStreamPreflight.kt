package com.mediagod.firetv

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.max

/** Reachability plus a conservative UHD throughput sample before native playback. */
object NativeStreamPreflight {
    data class Result(
        val ok: Boolean,
        val shouldSkip: Boolean,
        val statusCode: Int = 0,
        val contentType: String = "",
        val elapsedMs: Long = 0L,
        val reason: String = "",
        val sampleBytes: Long = 0L,
        val estimatedMbps: Double = 0.0,
        val requiredMbps: Double = 0.0,
        val networkRisk: Boolean = false
    ) {
        fun toJson(): JSONObject = JSONObject().apply {
            put("ok", ok)
            put("shouldSkip", shouldSkip)
            put("statusCode", statusCode)
            put("contentType", contentType)
            put("elapsedMs", elapsedMs)
            put("reason", reason)
            put("sampleBytes", sampleBytes)
            put("estimatedMbps", estimatedMbps)
            put("requiredMbps", requiredMbps)
            put("networkRisk", networkRisk)
        }
    }

    private const val TIMEOUT_MS = 2600
    private const val UHD_SAMPLE_BYTES = 256 * 1024

    fun checkPayload(payload: JSONObject): Result {
        val url = payload.optString("url").trim()
        val bitrate = firstNumber(payload, "bitrate")
        val probeUhd = payload.optBoolean("networkAware4K", true) && looksUhd(payload, url) && bitrate > 0.0
        return check(
            url,
            headersFor(payload, url),
            probeBytes = if (probeUhd) UHD_SAMPLE_BYTES else 2,
            bitrateBps = bitrate
        )
    }

    fun headersFor(payload: JSONObject, url: String): Map<String, String> {
        val result = linkedMapOf<String, String>()
        fun collect(json: JSONObject?) {
            if (json == null) return
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = json.optString(key).trim()
                if (key.isNotBlank() && value.isNotBlank()) result[key] = value
            }
        }
        collect(payload.optJSONObject("headers"))
        val sources = payload.optJSONArray("sources")
        if (sources != null) {
            for (index in 0 until sources.length()) {
                val item = sources.optJSONObject(index) ?: continue
                if (item.optString("url").trim() == url) {
                    collect(item.optJSONObject("headers"))
                    break
                }
            }
        }
        return result
    }

    fun check(url: String, headers: Map<String, String>): Result =
        check(url, headers, probeBytes = 2, bitrateBps = 0.0)

    fun check(
        url: String,
        headers: Map<String, String>,
        probeBytes: Int,
        bitrateBps: Double
    ): Result {
        val target = url.trim()
        if (!(target.startsWith("https://") || target.startsWith("http://"))) {
            return Result(ok = false, shouldSkip = true, reason = "invalid_url")
        }

        val startedAt = System.currentTimeMillis()
        var connection: HttpURLConnection? = null

        return try {
            val wanted = probeBytes.coerceIn(2, UHD_SAMPLE_BYTES)
            connection = (URL(target).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                requestMethod = "GET"
                setRequestProperty("Range", "bytes=0-${wanted - 1}")
                setRequestProperty("Accept", "*/*")
                var hasUserAgent = false
                headers.forEach { (key, value) ->
                    if (key.equals("User-Agent", ignoreCase = true)) hasUserAgent = true
                    setRequestProperty(key, value)
                }
                if (!hasUserAgent) setRequestProperty("User-Agent", "MediaGod/NativePreflight")
            }

            val status = connection.responseCode
            val contentType = connection.contentType.orEmpty()
            val reachable = status in 200..399 || status == 416
            val permanent = status in setOf(400, 401, 403, 404, 410, 451)
            var bytesRead = 0L

            if (reachable && status != 416 && wanted > 2) {
                try {
                    connection.inputStream.use { input ->
                        val buffer = ByteArray(16 * 1024)
                        while (bytesRead < wanted) {
                            val remaining = (wanted - bytesRead).coerceAtMost(buffer.size.toLong()).toInt()
                            val read = input.read(buffer, 0, remaining)
                            if (read <= 0) break
                            bytesRead += read
                        }
                    }
                } catch (_: Throwable) {
                    // A range body is optional; reachability still counts.
                }
            }

            val elapsed = max(1L, System.currentTimeMillis() - startedAt)
            val estimatedMbps = if (bytesRead >= 64 * 1024) {
                (bytesRead.toDouble() * 8.0) / (elapsed.toDouble() / 1000.0) / 1_000_000.0
            } else 0.0
            val requiredMbps = if (bitrateBps > 0.0) bitrateBps / 1_000_000.0 * 1.15 else 0.0
            val networkRisk =
                estimatedMbps > 0.0 && requiredMbps > 0.0 && estimatedMbps < requiredMbps * 0.72

            Result(
                ok = reachable,
                shouldSkip = permanent,
                statusCode = status,
                contentType = contentType,
                elapsedMs = elapsed,
                reason = when {
                    reachable && networkRisk -> "reachable_network_constrained"
                    reachable -> "reachable"
                    permanent -> "http_$status"
                    else -> "transient_http_$status"
                },
                sampleBytes = bytesRead,
                estimatedMbps = estimatedMbps,
                requiredMbps = requiredMbps,
                networkRisk = networkRisk
            )
        } catch (_: Throwable) {
            Result(
                ok = false,
                shouldSkip = false,
                elapsedMs = System.currentTimeMillis() - startedAt,
                reason = "network_check_inconclusive"
            )
        } finally {
            try { connection?.disconnect() } catch (_: Throwable) {}
        }
    }

    private fun firstNumber(payload: JSONObject, key: String): Double {
        val raw = payload.opt(key) ?: return 0.0
        return when (raw) {
            is Number -> raw.toDouble()
            else -> Regex("""\d+(?:\.\d+)?""").find(raw.toString())?.value?.toDoubleOrNull() ?: 0.0
        }
    }

    private fun looksUhd(payload: JSONObject, url: String): Boolean {
        if (payload.optInt("width", 0) >= 3000 || payload.optInt("height", 0) >= 1700) return true
        val text = "${payload.optString("quality")} ${payload.optString("hintText")} ${payload.optString("title")} $url"
        return Regex("""(?:^|[^a-z0-9])(?:4k|2160p|uhd)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
            .containsMatchIn(text)
    }
}
