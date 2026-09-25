package com.mediagod.firetv

import android.media.MediaCodecInfo
import android.media.MediaCodecList
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * Chooses the playback engine before a native player surface is opened.
 *
 * Media3 remains first choice when the device advertises a decoder that can
 * actually handle the hinted codec, resolution and frame rate. The broad
 * LibVLC compatibility engine is selected up front for legacy containers,
 * unsupported codec profiles and 4K/8K streams that exceed the device's
 * advertised MediaCodec capabilities.
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

    private data class VideoHints(
        val width: Int = 0,
        val height: Int = 0,
        val fps: Double = 0.0,
        val profile: String = "",
        val bitDepth: Int = 0,
        val bitrateBps: Double = 0.0,
        val hdrFormat: String = "",
        val text: String = ""
    ) {
        val looks4k: Boolean
            get() = width >= 3000 || height >= 1700 ||
                Regex("""(?:^|[^a-z0-9])(?:4k|2160p)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
                    .containsMatchIn(text)

        val looks8k: Boolean
            get() = width >= 7000 || height >= 4000 ||
                Regex("""(?:^|[^a-z0-9])(?:8k|4320p)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
                    .containsMatchIn(text)

        val tenBit: Boolean
            get() = bitDepth >= 10 ||
                Regex(
                    """(?:10[ -]?bit|main[ ._-]?10|p010|hdr10\+?|dolby[ ._-]?vision|dovi|dvhe|dvh1)""",
                    RegexOption.IGNORE_CASE
                ).containsMatchIn("$profile $hdrFormat $text")

        val dolbyVision: Boolean
            get() = Regex(
                """(?:dolby[ ._-]?vision|dovi|dvhe|dvh1|dvav|dva1)""",
                RegexOption.IGNORE_CASE
            ).containsMatchIn("$profile $hdrFormat $text")

        val dolbyVisionProfile: Int
            get() {
                val value = "$profile $hdrFormat $text"
                Regex("""(?:dvhe|dvh1|dvav|dva1)[._-]?0?(\d{1,2})""", RegexOption.IGNORE_CASE)
                    .find(value)
                    ?.groupValues
                    ?.getOrNull(1)
                    ?.toIntOrNull()
                    ?.let { return it }
                Regex(
                    """(?:dolby[ ._-]?vision|dovi|\bdv\b).{0,16}?(?:profile|p)?[ ._-]*0?(\d{1,2})""",
                    RegexOption.IGNORE_CASE
                ).find(value)
                    ?.groupValues
                    ?.getOrNull(1)
                    ?.toIntOrNull()
                    ?.let { return it }
                return 0
            }

        val combinedDolbyVisionHdr10Plus: Boolean
            get() = dolbyVision &&
                Regex("""hdr10\+""", RegexOption.IGNORE_CASE).containsMatchIn("$hdrFormat $text")
    }

    private val decoderInfos: List<MediaCodecInfo> by lazy {
        try {
            MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos
                .filter { !it.isEncoder }
        } catch (_: Throwable) {
            emptyList()
        }
    }

    private val decoderMimeTypes: Set<String> by lazy {
        val result = linkedSetOf<String>()
        decoderInfos.forEach { codecInfo ->
            codecInfo.supportedTypes.forEach { type ->
                result.add(type.trim().lowercase())
            }
        }
        result
    }

    fun decide(payload: JSONObject): Decision {
        if (payload.optJSONObject("drm") != null) {
            return Decision(false)
        }

        if (payload.optBoolean("forceCompatibility", false)) {
            return Decision(
                true,
                payload.optString("forceCompatibilityReason").trim().ifBlank {
                    "advanced-playback"
                }
            )
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
        val profile = firstNonBlank(
            selected?.optString("videoProfile"),
            payload.optString("videoProfile")
        )
        val hdrFormat = firstNonBlank(
            selected?.optString("hdrFormat"),
            payload.optString("hdrFormat")
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
            profile,
            hdrFormat,
            mimeType,
            url
        ).filter { it.isNotBlank() }.joinToString(" ")

        val sourceIdentity = listOf(
            selected?.optString("label").orEmpty(),
            selected?.optString("sourceName").orEmpty(),
            selected?.optString("hintText").orEmpty(),
            payload.optString("sourceName"),
            payload.optString("hintText")
        ).filter { it.isNotBlank() }.joinToString(" ")

        /*
         * Provider identity is not a decoder failure. Torrentio/Real-Debrid can
         * deliver perfectly normal H.264/HEVC + AAC/AC3 files, so never force
         * every Torrentio row through LibVLC. Route only when the actual
         * container/codec/capability checks below say compatibility is needed.
         * This avoids the one-second LibVLC error -> next-torrent carousel.
         */
        val width = firstPositiveInt(
            jsonNumber(selected, "width"),
            jsonNumber(payload, "width"),
            guessedResolution(hints).first.toDouble()
        )
        val height = firstPositiveInt(
            jsonNumber(selected, "height"),
            jsonNumber(payload, "height"),
            guessedResolution(hints).second.toDouble()
        )
        val fps = firstPositiveDouble(
            jsonNumber(selected, "fps"),
            jsonNumber(payload, "fps"),
            guessedFps(hints)
        )
        val bitDepth = firstPositiveInt(
            jsonNumber(selected, "bitDepth"),
            jsonNumber(payload, "bitDepth")
        )
        val bitrateBps = firstPositiveDouble(
            jsonNumber(selected, "bitrate"),
            jsonNumber(payload, "bitrate")
        )

        val videoHints = VideoHints(
            width = width,
            height = height,
            fps = fps,
            profile = profile,
            bitDepth = bitDepth,
            bitrateBps = bitrateBps,
            hdrFormat = hdrFormat,
            text = hints
        )

        legacyContainerReason(url, mimeType, container, hints)?.let {
            return Decision(true, it)
        }

        if (
            videoHints.combinedDolbyVisionHdr10Plus &&
            Regex("""(?:mkv|matroska)""", RegexOption.IGNORE_CASE)
                .containsMatchIn("$container $mimeType $hints")
        ) {
            // Fire TV 4K devices are known to be unreliable with MKV streams that
            // carry both Dolby Vision and HDR10+ metadata. Let LibVLC choose the
            // base/HDR layer instead of opening a failing MediaCodec surface.
            return Decision(true, "video:firetv-dv-hdr10plus-mkv")
        }

        detectVideoCodec(videoCodec, hints, videoHints)?.let { codec ->
            if (!deviceSupportsVideo(codec, videoHints)) {
                val sizeReason =
                    if (videoHints.width > 0 && videoHints.height > 0)
                        ":${videoHints.width}x${videoHints.height}"
                    else ""
                return Decision(true, "video:${codec.label}$sizeReason")
            }
        }

        detectAudioCodec(audioCodec, hints)?.let { codec ->
            if (
                !payload.optBoolean("live", false) &&
                requiresVodCompatibilityAudio(codec, hints)
            ) {
                return Decision(true, "audio-vod-pcm:${codec.label}")
            }

            if (requiresCompatibilityAudio(codec, hints)) {
                return Decision(true, "audio-software:${codec.label}")
            }

            if (!deviceHasDecoder(codec)) {
                return Decision(true, "audio:${codec.label}")
            }
        }

        return Decision(false)
    }

    private fun requiresVodCompatibilityAudio(
        codec: CodecSpec,
        hints: String
    ): Boolean {
        /*
         * These are the formats that repeatedly reached real Android/Fire TV
         * devices with video but no audible output. Route VOD through LibVLC's
         * explicit PCM/stereo path before Media3/device passthrough can claim a
         * false success. AAC stays on Media3 unless the release is explicitly
         * multichannel.
         */
        if (codec.label in setOf("ac3", "eac3", "ac4")) {
            return true
        }

        return matches(
            hints,
            "5[ ._-]?1|7[ ._-]?1|6[ ._-]?ch|8[ ._-]?ch|multi[ -]?channel"
        )
    }

    private fun requiresCompatibilityAudio(
        codec: CodecSpec,
        hints: String
    ): Boolean {
        if (
            codec.label in setOf(
                "dts",
                "dts-hd",
                "truehd",
                "atmos"
            )
        ) {
            return true
        }

        return matches(
            hints,
            "e[- .]?ac[- .]?3[- .]?joc|eac3[- .]?joc|dolby[ -]?atmos|atmos"
        )
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
            if (
                urlMatch == null &&
                activeUrl.isNotBlank() &&
                item.optString("url").trim() == activeUrl
            ) {
                urlMatch = item
            }
        }

        return urlMatch
    }

    private fun firstNonBlank(vararg values: String?): String =
        values.firstOrNull { !it.isNullOrBlank() }?.trim().orEmpty()

    private fun jsonNumber(json: JSONObject?, key: String): Double {
        if (json == null || !json.has(key)) return 0.0
        val raw = json.opt(key) ?: return 0.0
        return when (raw) {
            is Number -> raw.toDouble()
            else -> Regex("""\d+(?:\.\d+)?""")
                .find(raw.toString())
                ?.value
                ?.toDoubleOrNull()
                ?: 0.0
        }
    }

    private fun firstPositiveInt(vararg values: Double): Int =
        values.firstOrNull { it > 0.0 }?.roundToInt() ?: 0

    private fun firstPositiveDouble(vararg values: Double): Double =
        values.firstOrNull { it > 0.0 } ?: 0.0

    private fun guessedResolution(text: String): Pair<Int, Int> =
        when {
            Regex("""(?:^|[^a-z0-9])(?:8k|4320p)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
                .containsMatchIn(text) -> 7680 to 4320
            Regex("""(?:^|[^a-z0-9])(?:4k|2160p)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
                .containsMatchIn(text) -> 3840 to 2160
            else -> 0 to 0
        }

    private fun guessedFps(text: String): Double {
        Regex(
            """(?:2160|4320|1080|720)p[ ._-]?(120|100|60|59\.94|50|30|29\.97|25|24|23\.976)""",
            RegexOption.IGNORE_CASE
        ).find(text)
            ?.groupValues
            ?.getOrNull(1)
            ?.toDoubleOrNull()
            ?.let { return it }

        Regex(
            """(?:^|[^0-9])(120|100|60|59\.94|50|30|29\.97|25|24|23\.976)[ ._-]*fps(?:[^a-z0-9]|$)""",
            RegexOption.IGNORE_CASE
        ).find(text)
            ?.groupValues
            ?.getOrNull(1)
            ?.toDoubleOrNull()
            ?.let { return it }

        return if (
            Regex("""(?:^|[^a-z0-9])(?:4k|2160p|8k|4320p)(?:[^a-z0-9]|$)""", RegexOption.IGNORE_CASE)
                .containsMatchIn(text)
        ) 30.0 else 0.0
    }

    private fun deviceHasDecoder(codec: CodecSpec): Boolean {
        if (codec.mimeTypes.isEmpty()) return false
        return codec.mimeTypes.any { decoderMimeTypes.contains(it.lowercase()) }
    }

    private fun matchingDecoderTypes(codec: CodecSpec): List<Pair<MediaCodecInfo, String>> {
        if (codec.mimeTypes.isEmpty()) return emptyList()

        val wanted = codec.mimeTypes.map { it.lowercase() }.toSet()
        return decoderInfos.flatMap { info ->
            info.supportedTypes.mapNotNull { rawType ->
                val normalized = rawType.trim().lowercase()
                if (normalized in wanted) info to rawType else null
            }
        }
    }

    private fun deviceSupportsVideo(codec: CodecSpec, hints: VideoHints): Boolean {
        if (codec.mimeTypes.isEmpty()) return false

        if (codec.label == "dolby-vision") {
            if (hints.dolbyVisionProfile == 7) {
                /*
                 * Profile 7 remuxes often contain a perfectly usable HEVC base
                 * layer even when the enhancement layer is unsupported. Prefer
                 * that hardware path first; a real decoder failure still falls
                 * through to LibVLC.
                 */
                val hevc = CodecSpec("hevc", listOf("video/hevc"))
                return matchingDecoderTypes(hevc).any { (info, type) ->
                    codecCapabilitiesAccept(info, type, hevc, hints)
                }
            }

            val nativeDolbyVision = matchingDecoderTypes(codec)
            if (nativeDolbyVision.isNotEmpty()) {
                return nativeDolbyVision.any { (info, type) ->
                    codecCapabilitiesAccept(info, type, codec, hints)
                }
            }

            // Dolby Vision profile 8 carries a backward-compatible HEVC base layer.
            if (hints.dolbyVisionProfile == 8 || hints.dolbyVisionProfile == 0) {
                val hevc = CodecSpec("hevc", listOf("video/hevc"))
                if (matchingDecoderTypes(hevc).any { (info, type) ->
                        codecCapabilitiesAccept(info, type, hevc, hints)
                    }) {
                    return true
                }
            }

            return false
        }

        val matches = matchingDecoderTypes(codec)
        if (matches.isEmpty()) return false

        return matches.any { (info, type) ->
            codecCapabilitiesAccept(info, type, codec, hints)
        }
    }

    private fun codecCapabilitiesAccept(
        info: MediaCodecInfo,
        type: String,
        codec: CodecSpec,
        hints: VideoHints
    ): Boolean {
        return try {
            val capabilities = info.getCapabilitiesForType(type)

            if (hints.tenBit && !supportsTenBitProfile(capabilities, codec)) {
                return false
            }

            val width = hints.width
            val height = hints.height
            if (width <= 0 || height <= 0) {
                return true
            }

            val video = capabilities.videoCapabilities ?: return true

            if (hints.bitrateBps > 0.0) {
                val bitrate = hints.bitrateBps
                    .coerceAtMost(Int.MAX_VALUE.toDouble())
                    .roundToInt()
                if (!video.bitrateRange.contains(bitrate)) {
                    return false
                }
            }

            if (hints.fps > 0.0) {
                video.areSizeAndRateSupported(width, height, hints.fps)
            } else {
                video.isSizeSupported(width, height)
            }
        } catch (_: Throwable) {
            // A buggy vendor capability table should not block normal Media3 fallback.
            true
        }
    }

    private fun supportsTenBitProfile(
        capabilities: MediaCodecInfo.CodecCapabilities,
        codec: CodecSpec
    ): Boolean {
        val profiles = capabilities.profileLevels?.map { it.profile }.orEmpty()
        if (profiles.isEmpty()) {
            return true
        }

        return when (codec.label) {
            "hevc" -> profiles.contains(MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10)
            "h264" -> profiles.contains(MediaCodecInfo.CodecProfileLevel.AVCProfileHigh10)
            else -> true
        }
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

        if (
            extension in setOf(
                "avi", "flv", "wmv", "asf", "rm", "rmvb", "divx", "mxf", "ogm", "f4v"
            )
        ) {
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

    private fun detectVideoCodec(
        explicit: String,
        hints: String,
        videoHints: VideoHints
    ): CodecSpec? {
        val text = "$explicit $hints"

        return when {
            videoHints.dolbyVision -> CodecSpec("dolby-vision", listOf("video/dolby-vision"))
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
            matches(text, "xvid|divx|mp4v|mpeg[- .]?4(?:[ -]?part[ -]?2)?") ->
                CodecSpec("mpeg4-part2", listOf("video/mp4v-es"))
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
            matches(text, "atmos") -> CodecSpec(
                "atmos",
                listOf("audio/eac3-joc", "audio/eac3", "audio/true-hd")
            )
            matches(text, "mpeg[- .]?h|mhm1|mha1") -> CodecSpec("mpeg-h", listOf("audio/mhm1", "audio/mha1"))
            matches(text, "iamf") -> CodecSpec("iamf", listOf("audio/iamf"))
            matches(text, "ac[- .]?4|ac4") -> CodecSpec("ac4", listOf("audio/ac4"))
            matches(text, "e[- .]?ac[- .]?3|eac3|ec3|ddp|dolby[ -]?digital[ -]?plus") ->
                CodecSpec("eac3", listOf("audio/eac3-joc", "audio/eac3"))
            matches(text, "ac[- .]?3|ac3|dolby[ -]?digital") -> CodecSpec("ac3", listOf("audio/ac3"))
            matches(text, "xhe[- .]?aac|he[- .]?aac|aac") -> CodecSpec("aac", listOf("audio/mp4a-latm"))
            matches(text, "alac|apple[ -]?lossless") -> CodecSpec("alac", listOf("audio/alac"))
            matches(text, "flac") -> CodecSpec("flac", listOf("audio/flac"))
            matches(text, "opus") -> CodecSpec("opus", listOf("audio/opus"))
            matches(text, "vorbis") -> CodecSpec("vorbis", listOf("audio/vorbis"))
            matches(text, "wma|wmav") -> CodecSpec("wma", listOf("audio/x-ms-wma"))
            matches(text, "amr[- .]?wb") -> CodecSpec("amr-wb", listOf("audio/amr-wb"))
            matches(text, "amr[- .]?nb") -> CodecSpec("amr-nb", listOf("audio/3gpp"))
            matches(text, "g[ ._-]?711[ ._-]?(?:a|alaw)|pcm[ ._-]?alaw") ->
                CodecSpec("g711-alaw", listOf("audio/g711-alaw"))
            matches(text, "g[ ._-]?711[ ._-]?(?:u|mu|ulaw)|pcm[ ._-]?(?:mulaw|ulaw)") ->
                CodecSpec("g711-mlaw", listOf("audio/g711-mlaw"))
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
