package app.hearth.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PresentationStateTest {
    @Test
    fun `starts inactive and requires all three foreground conditions`() {
        for (resumed in listOf(false, true)) {
            for (focused in listOf(false, true)) {
                for (ready in listOf(false, true)) {
                    val state = PresentationState()
                    assertEquals(PresentationSnapshot(false, 0), state.snapshot)
                    state.update(resumed = resumed, windowFocused = focused, contentReady = ready)
                    assertEquals(resumed && focused && ready, state.snapshot.active)
                    assertEquals(if (resumed && focused && ready) 1L else 0L, state.snapshot.generation)
                }
            }
        }
    }

    @Test
    fun `late bootstrap while paused cannot mark active even with retained focus`() {
        val state = PresentationState()
        state.update(resumed = true, windowFocused = true)
        state.update(resumed = false)
        assertNull(state.update(contentReady = true))
        assertEquals(PresentationSnapshot(false, 0), state.snapshot)
        assertEquals(PresentationSnapshot(true, 1), state.update(resumed = true))
    }

    @Test
    fun `pause and focus loss immediately invalidate previous active generations`() {
        val state = PresentationState()
        state.update(resumed = true, windowFocused = true, contentReady = true)
        assertEquals(PresentationSnapshot(false, 2), state.update(resumed = false))
        assertNull(state.update(windowFocused = false))
        assertNull(state.update(resumed = true))
        assertEquals(PresentationSnapshot(true, 3), state.update(windowFocused = true))
        assertEquals(PresentationSnapshot(false, 4), state.update(windowFocused = false))
        assertEquals(PresentationSnapshot(true, 5), state.update(windowFocused = true))
    }

    @Test
    fun `recovery reload and replaced content remain ineligible until ready again`() {
        val state = PresentationState()
        state.update(resumed = true, windowFocused = true, contentReady = true)
        assertTrue(state.snapshot.active)
        assertEquals(PresentationSnapshot(false, 2), state.update(contentReady = false))
        assertFalse(state.snapshot.active)
        assertNull(state.update(resumed = true, windowFocused = true))
        assertEquals(PresentationSnapshot(true, 3), state.update(contentReady = true))
        assertEquals(PresentationSnapshot(false, 4), state.update(resumed = false, contentReady = false))
        assertNull(state.update(contentReady = true))
    }

    @Test
    fun `unchanged eligibility does not churn generations or emit snapshots`() {
        val state = PresentationState()
        assertNull(state.update())
        assertNull(state.update(resumed = true))
        state.update(windowFocused = true, contentReady = true)
        repeat(10) {
            assertNull(state.update(resumed = true, windowFocused = true, contentReady = true))
        }
        assertEquals(1L, state.snapshot.generation)
    }

    @Test
    fun `wire snapshot contains only the fixed status type and eligibility fields`() {
        assertEquals(
            "{\"type\":\"presentation.status\",\"active\":false,\"generation\":0}",
            PresentationState().snapshot.toMessage(),
        )
        val state = PresentationState()
        state.update(resumed = true, windowFocused = true, contentReady = true)
        assertEquals(
            "{\"type\":\"presentation.status\",\"active\":true,\"generation\":1}",
            state.snapshot.toMessage(),
        )
    }
}
