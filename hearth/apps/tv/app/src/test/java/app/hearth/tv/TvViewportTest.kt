package app.hearth.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TvViewportTest {
    @Test
    fun `maps a density two 1080p Fire TV to the 1920 logical canvas`() {
        assertEquals(50, tvInitialScalePercent(1920, 1080, 2f))
    }

    @Test
    fun `maps a density two 4K television to the same logical canvas`() {
        assertEquals(100, tvInitialScalePercent(3840, 2160, 2f))
    }

    @Test
    fun `uses the limiting dimension and falls back safely for invalid metrics`() {
        assertEquals(67, tvInitialScalePercent(1920, 1080, 1.5f))
        assertEquals(100, tvInitialScalePercent(0, 1080, 2f))
    }

    @Test
    fun `native bootstrap enforces the logical TV canvas with density aware scaling`() {
        val script = tvViewportScript(tvInitialScalePercent(1920, 1080, 2f))
        assertTrue(script.contains("width=1920, height=1080, initial-scale=0.5"))
        assertTrue(script.contains("minimum-scale=0.5, maximum-scale=0.5"))
        assertTrue(script.contains("root.dataset.hearthTv = 'true'"))
        assertTrue(script.contains("window !== window.top"))
    }

    @Test
    fun `bootstrap waits for the head and removes its observer after parsing`() {
        val script = tvViewportScript(100)
        assertTrue(script.contains("if (!document.head) return"))
        assertTrue(script.contains("DOMContentLoaded"))
        assertTrue(script.contains("observer.disconnect()"))
        assertFalse(script.contains("localStorage"))
        assertFalse(script.contains("fetch("))
        assertFalse(script.contains("cookie"))
    }

    @Test
    fun `bootstrap clamps invalid scale input`() {
        assertTrue(tvViewportScript(0).contains("initial-scale=0.25"))
        assertTrue(tvViewportScript(200).contains("initial-scale=1.0"))
    }
}
