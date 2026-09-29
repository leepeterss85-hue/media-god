package com.mediagod.firetv

import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.Tracks

/*
 * Picks the audio track most likely to actually produce sound.
 *
 * Media3 reports DTS/TrueHD/Atmos as "supported" whenever HDMI passthrough is
 * advertised, but many TVs/soundbars silently drop those streams. When a file
 * also carries AAC/AC-3, prefer it. Returns null when the current selection is
 * already as safe as anything available (or no candidate exists).
 */
object AudioTrackSafety {
    fun codecSafety(format: Format): Int {
        val mime = format.sampleMimeType.orEmpty().lowercase()
        var score = when {
            mime.contains("mp4a") || mime.contains("aac") -> 300
            mime == "audio/ac3" -> 220
            mime == "audio/eac3" -> 180
            mime.contains("opus") || mime.contains("vorbis") ||
                mime.contains("flac") || mime == "audio/mpeg" ||
                mime == "audio/raw" -> 150
            mime.contains("joc") || mime.contains("ac4") -> 40
            mime.contains("dts") || mime.contains("true-hd") ||
                mime.contains("mlp") -> -400
            else -> 0
        }
        if (format.channelCount > 6) score -= 30
        return score
    }

    fun pickSaferTrack(
        tracks: Tracks,
        isEnglish: (Format) -> Boolean,
        isCommentary: (Format) -> Boolean
    ): Pair<Tracks.Group, Int>? {
        val audioGroups = tracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO }
        // Untagged files: every track is a candidate (usually the original mix).
        val anyLanguageTagged = audioGroups.any { group ->
            (0 until group.length).any { i ->
                val lang = group.getTrackFormat(i).language.orEmpty().lowercase()
                lang.isNotBlank() && lang != "und"
            }
        }

        var selectedScore = Int.MIN_VALUE
        var best: Pair<Tracks.Group, Int>? = null
        var bestScore = Int.MIN_VALUE

        audioGroups.forEach { group ->
            for (index in 0 until group.length) {
                if (!group.isTrackSupported(index)) continue
                val format = group.getTrackFormat(index)
                if (!isEnglish(format) && anyLanguageTagged) continue
                if (isCommentary(format)) continue

                var score = codecSafety(format)
                if ((format.roleFlags and C.ROLE_FLAG_MAIN) != 0) score += 10
                if (group.isTrackSelected(index)) {
                    score += 5
                    selectedScore = score
                }
                if (score > bestScore) {
                    bestScore = score
                    best = group to index
                }
            }
        }

        val pick = best ?: return null
        if (pick.first.isTrackSelected(pick.second) || selectedScore >= bestScore - 50) {
            return null
        }
        return pick
    }
}