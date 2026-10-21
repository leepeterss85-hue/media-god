package com.mediagod.mobile

/** Episode-only decisions shared by Media3 and the compatibility player. */
internal object NativeEpisodePolicy {
    fun isEpisode(live: Boolean, mediaType: String, season: Int, episode: Int): Boolean =
        !live && (mediaType.lowercase() in setOf("tv", "series") || (season > 0 && episode > 0))

    fun sameEpisode(tmdbId: Long, season: Int, episode: Int,
        otherTmdbId: Long, otherSeason: Int, otherEpisode: Int): Boolean =
        tmdbId > 0L && season > 0 && episode > 0 && tmdbId == otherTmdbId &&
            season == otherSeason && episode == otherEpisode

    fun hasConfirmedNext(available: Boolean?, nextSeason: Int, nextEpisode: Int): Boolean =
        available ?: (nextSeason > 0 && nextEpisode > 0)

    fun shouldReportDuration(durationMs: Long, previousDurationMs: Long, elapsedSinceReportMs: Long): Boolean =
        durationMs > 0L && (previousDurationMs <= 0L || elapsedSinceReportMs >= 30_000L ||
            (kotlin.math.abs(durationMs - previousDurationMs) >= 5_000L && elapsedSinceReportMs >= 10_000L))

    fun requiresEnglish(tvEpisode: Boolean, requested: Boolean, manualAudioChoice: Boolean): Boolean =
        tvEpisode && requested && !manualAudioChoice

    fun segmentWindow(positionMs: Long, durationMs: Long, startMs: Long, endMs: Long): Boolean =
        startMs >= 0L && endMs > startMs && durationMs > 0L && endMs <= durationMs &&
            positionMs >= startMs && positionMs < endMs

    fun creditsWindow(positionMs: Long, durationMs: Long, creditsStartMs: Long): Boolean =
        durationMs > 0L && creditsStartMs > 0L && creditsStartMs < durationMs &&
            positionMs >= creditsStartMs && positionMs < durationMs - 500L

    fun countdownEligible(tvEpisode: Boolean, autoNext: Boolean, nextEpisodeConfirmed: Boolean,
        positionMs: Long, durationMs: Long, creditsStartMs: Long): Boolean =
        tvEpisode && autoNext && nextEpisodeConfirmed &&
            creditsWindow(positionMs, durationMs, creditsStartMs)
}
