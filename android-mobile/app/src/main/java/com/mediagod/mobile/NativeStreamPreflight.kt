package com.mediagod.mobile

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Lightweight reachability check for resolved HTTP media URLs.
 *
 * This runs before the native player activity is opened. It intentionally
 * skips only permanent-looking HTTP failures (expired/forbidden/missing/451)
 * and lets timeouts/transient network errors continue to the real player so a
 * slow CDN is not incorrectly discarded.
 */
object NativeStreamPreflight {
    data class Result(
        val ok: Boolean,
        val shouldSkip: Boolean,
        val statusCode: Int = 0,
        val contentType: String = "",
        val elapsedMs: Long = 0L,
        val reason: String = ""
    ) {
        fun toJson(): JSONObject = JSONObject().apply {
            put("ok", ok)
            put("shouldSkip", shouldSkip)
            put("statusCode", statusCode)
            put("contentType", contentType)
            put("elapsedMs", elapsedMs)
            put("reason", reason)
        }
    }

    private const val TIMEOUT_MS = 1800

    fun checkPayload(payload: JSONObject): Result {
        val url = payload.optString("url").trim()
        return check(url, headersFor(payload, url))
    }

    fun headersFor(payload: JSONObject, url: String): Map<String, String> {
        val result = linkedMapOf<String, String>()

        fun collect(json: JSONObject?) {
            if (json == null) return
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = json.optString(key).trim()
                if (key.isNotBlank() && value.isNotBlank()) {
                    result[key] = value
                }
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

    fun check(url: String, headers: Map<String, String>): Result {
        val target = url.trim()
        if (!(target.startsWith("https://") || target.startsWith("http://"))) {
            return Result(
                ok = false,
                shouldSkip = true,
                reason = "invalid_url"
            )
        }

        val startedAt = System.currentTimeMillis()
        var connection: HttpURLConnection? = null

        return try {
            connection = (URL(target).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                requestMethod = "GET"
                setRequestProperty("Range", "bytes=0-1")
                setRequestProperty("Accept", "*/*")

                var hasUserAgent = false
                headers.forEach { (key, value) ->
                    if (key.equals("User-Agent", ignoreCase = true)) {
                        hasUserAgent = true
                    }
                    setRequestProperty(key, value)
                }

                if (!hasUserAgent) {
                    setRequestProperty("User-Agent", "MediaGod/NativePreflight")
                }
            }

            val status = connection.responseCode
            val contentType = connection.contentType.orEmpty()
            val reachable = status in 200..399 || status == 416
            val permanent = status in setOf(400, 401, 403, 404, 410, 451)

            Result(
                ok = reachable,
                shouldSkip = permanent,
                statusCode = status,
                contentType = contentType,
                elapsedMs = System.currentTimeMillis() - startedAt,
                reason = when {
                    reachable -> "reachable"
                    permanent -> "http_$status"
                    else -> "transient_http_$status"
                }
            )
        } catch (_: Throwable) {
            Result(
                ok = false,
                shouldSkip = false,
                elapsedMs = System.currentTimeMillis() - startedAt,
                reason = "network_check_inconclusive"
            )
        } finally {
            try {
                connection?.disconnect()
            } catch (_: Throwable) {
            }
        }
    }
}
