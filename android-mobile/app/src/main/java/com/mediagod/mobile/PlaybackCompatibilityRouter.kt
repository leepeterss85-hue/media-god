package com.mediagod.mobile

import android.media.MediaCodecList
import org.json.JSONObject

/**
 * Chooses the playback engine before a native player surface is opened.
 *
 * Media3 remains first choice whenever the device advertises a decoder for the
 * hinted codecs and the container is one of the normal Android/Media3 formats.
 * LibVLC is selected up front for legacy containers and for codecs the current
 * phone/tablet does not advertise, avoiding a visible failed Media3 attempt.
 */
object PlaybackCompatibilityRouter {
    data class Decision(
        val useCompatibility: Boolean,
        val reason: String = ""
    )

    private data class CodecSpec(
        val label: String,
        val mimeTypes: List<String>
    )

    private val decoderMimeTypes: Set<String> by lazy {
        val result = linkedSetOf<String>()
        try {
            MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos
                .filter { !it.isEncoder }
                .forEach { codecInfo ->
                    codecInfo.supportedTypes.forEach { type ->
                        result.add(type.trim().lowercase())
                    }
                }
        } catch (_: Throwable) {
            // Vendor codec lists can be incomplete on some Android devices.
        }
        result
    }

    fun decide(payload: JSONObject): Decision {
        if (payload.optJSONObject("drm") != null) {
            return Decision(false)
        }

        val selected = selectedSource(payload)
        val url = payload.optString("url").trim()
        val mimeType = firstNonBlank(
            selected?.optString("mimeType"),
            payload.optString("mimeType")
        )
        val videoCodec = firstNonBlank(
            selected?.optString("videoCodec"),
            payload.optString("videoCodec")
        )
        val audioCodec = firstNonBlank(
            selected?.optString("audioCodec"),
            payload.optString("audioCodec")
        )
        val container = firstNonBlank(
            selected?.optString("container"),
            payload.optString("container")
        )
        val hints = listOf(
            selected?.optString("hintText").orEmpty(),
            selected?.optString("label").orEmpty(),
            selected?.optString("sourceName").orEmpty(),
            payload.optString("hintText"),
            payload.optString("title"),
            videoCodec,
            audioCodec,
            container,
            mimeType,
            url
        ).filter { it.isNotBlank() }.joinToString(" ")

        legacyContainerReason(url, mimeType, container, hints)?.let {
            return Decision(true, it)
        }

        detectVideoCodec(videoCodec, hints)?.let { codec ->
            if (!deviceHasDecoder(codec)) {
                return Decision(true, "video:${codec.label}")
            }
        }

        detectAudioCodec(audioCodec, hints)?.let { codec ->
            if (!deviceHasDecoder(codec)) {
                return Decision(true, "audio:${codec.label}")
            }
        }

        return Decision(false)
    }

    private fun selectedSource(payload: JSONObject): JSONObject? {
        val sources = payload.optJSONArray("sources") ?: return null
        val activeWebIndex = payload.optInt("activeSourceIndex", -1)
        val activeUrl = payload.optString("url").trim()
        var urlMatch: JSONObject? = null

        for (index in 0 until sources.length()) {
            val item = sources.optJSONObject(index) ?: continue
            if (item.optInt("webIndex", index) == activeWebIndex) {
                return item
            }
            if (urlMatch == null && activeUrl.isNotBlank() && item.optString("url").trim() == activeUrl) {
                urlMatch = item
            }
        }

        return urlMatch
    }

    private fun firstNonBlank(vararg values: String?): String =
        values.firstOrNull { !it.isNullOrBlank() }?.trim().orEmpty()

    private fun deviceHasDecoder(codec: CodecSpec): Boolean {
        if (codec.mimeTypes.isEmpty()) {
            return false
        }
        return codec.mimeTypes.any { decoderMimeTypes.contains(it.lowercase()) }
    }

    private fun legacyContainerReason(
        url: String,
        mimeType: String,
        container: String,
        hints: String
    ): String? {
        val extension = url
            .substringBefore('?')
            .substringBefore('#')
            .substringAfterLast('/')
            .substringAfterLast('.', "")
            .lowercase()

        if (extension in setOf("avi", "flv", "wmv", "asf", "rm", "rmvb", "divx", "mxf", "ogm", "f4v")) {
            return "container:$extension"
        }

        val text = "$mimeType $container $hints".lowercase()
        val legacyMarkers = listOf(
            "video/x-msvideo",
            "video/x-flv",
            "video/x-ms-wmv",
            "application/vnd.rn-realmedia",
            " realmedia ",
            " rmvb ",
            " asf ",
            " mxf ",
            " divx ",
            " xvid "
        )

        return if (legacyMarkers.any { text.contains(it) }) "container:legacy" else null
    }

    private fun detectVideoCodec(explicit: String, hints: String): CodecSpec? {
        val text = "$explicit $hints"

        return when {
            matches(text, "prores") -> CodecSpec("prores", emptyList())
            matches(text, "dnx(?:hd|hr)") -> CodecSpec("dnx", emptyList())
            matches(text, "cineform") -> CodecSpec("cineform", emptyList())
            matches(text, "realvideo|rv(?:30|40)") -> CodecSpec("realvideo", emptyList())
            matches(text, "theora") -> CodecSpec("theora", listOf("video/x-theora"))
            matches(text, "vc[- .]?1|wvc1|wmv3") -> CodecSpec("vc1", listOf("video/wvc1", "video/vc1"))
            matches(text, "av1|av01") -> CodecSpec("av1", listOf("video/av01"))
            matches(text, "hevc|h[ ._-]?265|x265|hev1|hvc1") -> CodecSpec("hevc", listOf("video/hevc"))
            matches(text, "vp9|vp09") -> CodecSpec("vp9", listOf("video/x-vnd.on2.vp9"))
            matches(text, "vp8|vp08") -> CodecSpec("vp8", listOf("video/x-vnd.on2.vp8"))
            matches(text, "mpeg[- .]?2|h[ ._-]?262|mpeg2video") -> CodecSpec("mpeg2", listOf("video/mpeg2"))
            matches(text, "mpeg[- .]?1|mpeg1video") -> CodecSpec("mpeg1", listOf("video/mpeg"))
            matches(text, "xvid|divx|mp4v|mpeg[- .]?4(?:[ -]?part[ -]?2)?") -> CodecSpec("mpeg4-part2", listOf("video/mp4v-es"))
            matches(text, "h[ ._-]?264|x264|avc1|avc") -> CodecSpec("h264", listOf("video/avc"))
            matches(text, "h[ ._-]?263") -> CodecSpec("h263", listOf("video/3gpp"))
            else -> null
        }
    }

    private fun detectAudioCodec(explicit: String, hints: String): CodecSpec? {
        val text = "$explicit $hints"

        return when {
            matches(text, "dts[- .]?(?:hd|ma)|dts:x") -> CodecSpec("dts-hd", listOf("audio/vnd.dts.hd"))
            matches(text, "true[- .]?hd|mlp") -> CodecSpec("truehd", listOf("audio/true-hd", "audio/vnd.dolby.mlp"))
            matches(text, "dts|dca") -> CodecSpec("dts", listOf("audio/vnd.dts"))
            matches(text, "mpeg[- .]?h|mhm1|mha1") -> CodecSpec("mpeg-h", listOf("audio/mhm1", "audio/mha1"))
            matches(text, "iamf") -> CodecSpec("iamf", listOf("audio/iamf"))
            matches(text, "ac[- .]?4|ac4") -> CodecSpec("ac4", listOf("audio/ac4"))
            matches(text, "e[- .]?ac[- .]?3|eac3|ec3|ddp|dolby[ -]?digital[ -]?plus") -> CodecSpec("eac3", listOf("audio/eac3-joc", "audio/eac3"))
            matches(text, "ac[- .]?3|ac3|dolby[ -]?digital") -> CodecSpec("ac3", listOf("audio/ac3"))
            matches(text, "xhe[- .]?aac|he[- .]?aac|aac") -> CodecSpec("aac", listOf("audio/mp4a-latm"))
            matches(text, "alac|apple[ -]?lossless") -> CodecSpec("alac", listOf("audio/alac"))
            matches(text, "flac") -> CodecSpec("flac", listOf("audio/flac"))
            matches(text, "opus") -> CodecSpec("opus", listOf("audio/opus"))
            matches(text, "vorbis") -> CodecSpec("vorbis", listOf("audio/vorbis"))
            matches(text, "wma|wmav") -> CodecSpec("wma", listOf("audio/x-ms-wma"))
            matches(text, "amr[- .]?wb") -> CodecSpec("amr-wb", listOf("audio/amr-wb"))
            matches(text, "amr[- .]?nb") -> CodecSpec("amr-nb", listOf("audio/3gpp"))
            matches(text, "g[ ._-]?711[ ._-]?(?:a|alaw)|pcm[ ._-]?alaw") -> CodecSpec("g711-alaw", listOf("audio/g711-alaw"))
            matches(text, "g[ ._-]?711[ ._-]?(?:u|mu|ulaw)|pcm[ ._-]?(?:mulaw|ulaw)") -> CodecSpec("g711-mlaw", listOf("audio/g711-mlaw"))
            matches(text, "pcm|lpcm") -> CodecSpec("pcm", listOf("audio/raw"))
            matches(text, "mp3|mpeg[ -]?layer[ -]?3") -> CodecSpec("mp3", listOf("audio/mpeg"))
            matches(text, "mp2|mpeg[ -]?layer[ -]?2") -> CodecSpec("mp2", listOf("audio/mpeg"))
            matches(text, "mp1|mpeg[ -]?layer[ -]?1") -> CodecSpec("mp1", listOf("audio/mpeg"))
            else -> null
        }
    }

    private fun matches(text: String, pattern: String): Boolean =
        Regex(
            "(?:^|[^a-z0-9])(?:$pattern)(?:[^a-z0-9]|$)",
            RegexOption.IGNORE_CASE
        ).containsMatchIn(text)
}
