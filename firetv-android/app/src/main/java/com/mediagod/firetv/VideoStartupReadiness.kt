package com.mediagod.firetv

/** A decoder's Playing event can indicate audio without a video output. */
internal class VideoStartupReadiness(private val requireVideoOutput: Boolean) {
    private var playing = false
    private var videoOutputCount = 0

    fun onPlaying(): Boolean {
        playing = true
        return isReady()
    }

    fun onVideoOutput(count: Int): Boolean {
        videoOutputCount = count.coerceAtLeast(0)
        return isReady()
    }

    fun isReady(): Boolean = playing && (!requireVideoOutput || videoOutputCount > 0)

    fun reset() {
        playing = false
        videoOutputCount = 0
    }
}
