package app.hearth.tv

data class PresentationSnapshot(val active: Boolean, val generation: Long) {
    fun toMessage(): String =
        "{\"type\":\"presentation.status\",\"active\":$active,\"generation\":$generation}"
}

/** Main-thread state only. Neither a loaded document nor resume alone grants eligibility. */
class PresentationState {
    private var resumed = false
    private var windowFocused = false
    private var contentReady = false

    var snapshot = PresentationSnapshot(active = false, generation = 0)
        private set

    /** Returns a snapshot only on an eligibility transition, for best-effort push delivery. */
    fun update(
        resumed: Boolean = this.resumed,
        windowFocused: Boolean = this.windowFocused,
        contentReady: Boolean = this.contentReady,
    ): PresentationSnapshot? {
        this.resumed = resumed
        this.windowFocused = windowFocused
        this.contentReady = contentReady
        val active = resumed && windowFocused && contentReady
        if (active == snapshot.active) return null
        snapshot = PresentationSnapshot(active, snapshot.generation + 1)
        return snapshot
    }
}
