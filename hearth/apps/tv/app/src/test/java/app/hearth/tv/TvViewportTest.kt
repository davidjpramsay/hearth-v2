package app.hearth.tv

import org.junit.Assert.assertEquals
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
}
