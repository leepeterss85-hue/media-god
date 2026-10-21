package com.mediagod.mobile

import com.mediagod.firetv.NativeEpisodePolicy as FireTvEpisodePolicy

// Compile with both production NativeEpisodePolicy.kt files and run this main.
// Uses the real phone and Fire TV policies without Android dependencies.
fun main() {
    check(NativeEpisodePolicy.isEpisode(false, "tv", 0, 0))
    check(NativeEpisodePolicy.isEpisode(false, "SERIES", 0, 0))
    check(NativeEpisodePolicy.isEpisode(false, "", 2, 3))
    check(!NativeEpisodePolicy.isEpisode(false, "movie", 0, 0))
    check(!NativeEpisodePolicy.isEpisode(true, "tv", 2, 3))
    check(!NativeEpisodePolicy.isEpisode(false, "", 0, 3))

    for (episode in listOf(false, true)) for (requested in listOf(false, true)) {
        check(NativeEpisodePolicy.requiresEnglish(episode, requested, false) == (episode && requested))
        check(!NativeEpisodePolicy.requiresEnglish(episode, requested, true)) {
            "An explicit Audio choice must override the episode English gate"
        }
        check(FireTvEpisodePolicy.requiresEnglish(episode, requested, false) == (episode && requested))
        check(!FireTvEpisodePolicy.requiresEnglish(episode, requested, true))
    }

    data class DurationReportCase(val duration: Long, val previous: Long, val elapsed: Long, val expected: Boolean)
    for (case in listOf(
        DurationReportCase(0L, 0L, 0L, false), DurationReportCase(2_400_000L, 0L, 0L, true),
        DurationReportCase(2_400_000L, 2_400_000L, 29_999L, false),
        DurationReportCase(2_400_000L, 2_400_000L, 30_000L, true),
        DurationReportCase(2_404_999L, 2_400_000L, 20_000L, false),
        DurationReportCase(2_405_000L, 2_400_000L, 9_999L, false),
        DurationReportCase(2_405_000L, 2_400_000L, 10_000L, true),
        DurationReportCase(2_395_000L, 2_400_000L, 10_000L, true)
    )) {
        check(NativeEpisodePolicy.shouldReportDuration(case.duration, case.previous, case.elapsed) == case.expected)
        check(FireTvEpisodePolicy.shouldReportDuration(case.duration, case.previous, case.elapsed) == case.expected)
    }

    val duration = 2_400_000L
    for (position in listOf(0L, 14_999L, 15_000L, 70_999L, 71_000L, duration)) {
        val expected = position >= 15_000L && position < 71_000L
        check(NativeEpisodePolicy.segmentWindow(position, duration, 15_000L, 71_000L) == expected)
        check(FireTvEpisodePolicy.segmentWindow(position, duration, 15_000L, 71_000L) == expected)
    }
    for ((start, end) in listOf(-1L to 71_000L, 0L to -1L, 50L to 50L, 80L to 70L, 0L to duration + 1L)) {
        check(!NativeEpisodePolicy.segmentWindow(15_000L, duration, start, end))
        check(!FireTvEpisodePolicy.segmentWindow(15_000L, duration, start, end))
    }
    check(!NativeEpisodePolicy.segmentWindow(1L, 0L, 0L, 2L))

    val creditsStart = 2_300_000L
    for (position in listOf(0L, creditsStart - 1L, creditsStart, duration - 501L, duration - 500L, duration)) {
        val insideCredits = position >= creditsStart && position < duration - 500L
        check(NativeEpisodePolicy.creditsWindow(position, duration, creditsStart) == insideCredits)
        check(FireTvEpisodePolicy.creditsWindow(position, duration, creditsStart) == insideCredits)
        for (episode in listOf(false, true)) for (autoNext in listOf(false, true)) for (knownNext in listOf(false, true)) {
            val expected = episode && autoNext && knownNext && insideCredits
            check(NativeEpisodePolicy.countdownEligible(episode, autoNext, knownNext, position, duration, creditsStart) == expected)
            check(FireTvEpisodePolicy.countdownEligible(episode, autoNext, knownNext, position, duration, creditsStart) == expected)
        }
    }
    for (missing in listOf(-1L, 0L, duration, duration + 1L)) {
        check(!NativeEpisodePolicy.countdownEligible(true, true, true, duration - 1_000L, duration, missing)) {
            "Missing or invalid credits must never become a guessed last-seconds countdown"
        }
        check(!FireTvEpisodePolicy.countdownEligible(true, true, true, duration - 1_000L, duration, missing))
    }

    check(!NativeEpisodePolicy.hasConfirmedNext(null, 0, 0))
    check(NativeEpisodePolicy.hasConfirmedNext(null, 2, 1))
    check(!NativeEpisodePolicy.hasConfirmedNext(false, 2, 1)) { "Last-episode confirmation must override stale next identity" }
    check(NativeEpisodePolicy.hasConfirmedNext(true, 0, 0))
    check(!FireTvEpisodePolicy.hasConfirmedNext(false, 2, 1))
    check(FireTvEpisodePolicy.hasConfirmedNext(null, 2, 1))

    check(NativeEpisodePolicy.sameEpisode(123L, 1, 2, 123L, 1, 2))
    check(FireTvEpisodePolicy.sameEpisode(123L, 1, 2, 123L, 1, 2))
    for ((id, season, episode) in listOf(Triple(124L, 1, 2), Triple(123L, 2, 2), Triple(123L, 1, 3), Triple(0L, 0, 0))) {
        check(!NativeEpisodePolicy.sameEpisode(123L, 1, 2, id, season, episode))
        check(!FireTvEpisodePolicy.sameEpisode(123L, 1, 2, id, season, episode))
    }
    check(!NativeEpisodePolicy.sameEpisode(0L, 1, 2, 0L, 1, 2))
    check(!NativeEpisodePolicy.sameEpisode(123L, 0, 2, 123L, 0, 2))
    println("PASS native episode policies: English/manual choice, exact markers, verified next countdown, scoped identity")
}
