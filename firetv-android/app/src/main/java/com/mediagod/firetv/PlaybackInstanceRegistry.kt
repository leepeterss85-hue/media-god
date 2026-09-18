package com.mediagod.firetv

import java.util.concurrent.atomic.AtomicInteger

object PlaybackInstanceRegistry {
    private val activePlayers = AtomicInteger(0)
    private val maxObservedPlayers = AtomicInteger(0)

    fun onPlayerAttached() {
        val active = activePlayers.incrementAndGet()
        while (true) {
            val previous = maxObservedPlayers.get()
            if (active <= previous || maxObservedPlayers.compareAndSet(previous, active)) break
        }
    }

    fun onPlayerReleased() {
        activePlayers.updateAndGet { current -> if (current > 0) current - 1 else 0 }
    }

    fun activePlayers(): Int = activePlayers.get()
    fun maxObservedPlayers(): Int = maxObservedPlayers.get()

    fun resetForTests() {
        activePlayers.set(0)
        maxObservedPlayers.set(0)
    }
}
