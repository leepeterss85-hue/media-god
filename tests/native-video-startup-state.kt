package com.mediagod.mobile

// Compile alongside the production VideoStartupReadiness.kt and run this main.
// No Android runtime or test-framework dependencies are needed.
fun main() {
    val vod = VideoStartupReadiness(requireVideoOutput = true)

    check(!vod.onPlaying()) { "Audio-only Playing must keep the video timeout armed" }
    check(!vod.onPlaying()) { "Repeated Playing cannot stand in for video output" }
    check(!vod.onVideoOutput(0)) { "Zero video outputs must not confirm VOD" }
    check(vod.onVideoOutput(1)) { "Playing followed by video output must confirm VOD" }
    check(!vod.onVideoOutput(0)) { "Losing the video output must revoke readiness" }
    check(!vod.onVideoOutput(-1)) { "An invalid video output count must not confirm VOD" }

    vod.reset()
    check(!vod.onVideoOutput(1)) { "Video output before Playing must wait for playback" }
    check(vod.onPlaying()) { "Video output followed by Playing must confirm VOD" }

    vod.reset()
    check(!vod.onPlaying()) { "Decoder restart must not inherit the previous video output" }
    check(vod.onVideoOutput(2)) { "A restarted decoder must confirm its own video output" }

    vod.reset()
    check(!vod.onVideoOutput(1)) { "Decoder restart must not inherit previous Playing" }
    check(vod.onPlaying()) { "Restarted playback confirms only after both fresh signals" }

    val live = VideoStartupReadiness(requireVideoOutput = false)
    check(!live.onVideoOutput(1)) { "Video output alone must not confirm live playback" }
    check(live.onPlaying()) { "Existing Live TV Playing behavior must be preserved" }
    check(live.onVideoOutput(0)) { "Live TV must not acquire the VOD video-output requirement" }
    live.reset()
    check(live.onPlaying()) { "Live TV must preserve Playing readiness after reset" }

    println("PASS native startup state: audio-only, both event orders, output loss, decoder reset, Live TV")
}
