package app.hearth.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TrustedOriginTest {
    @Test
    fun `normalizes a private HTTPS origin without a trailing slash`() {
        assertEquals(
            "https://hearth.example.test:8443",
            TrustedOrigin.normalize(" https://hearth.example.test:8443/ ", allowDebugHttp = false),
        )
    }

    @Test
    fun `allows only the emulator and loopback hosts over debug HTTP`() {
        assertEquals(
            "http://10.0.2.2:4320",
            TrustedOrigin.normalize("http://10.0.2.2:4320", allowDebugHttp = true),
        )
        assertThrows(IllegalArgumentException::class.java) {
            TrustedOrigin.normalize("http://192.168.1.20:4320", allowDebugHttp = true)
        }
        assertThrows(IllegalArgumentException::class.java) {
            TrustedOrigin.normalize("http://10.0.2.2:4320", allowDebugHttp = false)
        }
    }

    @Test
    fun `rejects credentials paths and foreign origins`() {
        assertThrows(IllegalArgumentException::class.java) {
            TrustedOrigin.normalize("https://user:secret@hearth.example.test", false)
        }
        assertThrows(IllegalArgumentException::class.java) {
            TrustedOrigin.normalize("https://hearth.example.test/today", false)
        }
        assertTrue(
            TrustedOrigin.matches(
                "https://hearth.example.test",
                "https://hearth.example.test/today",
            ),
        )
        assertFalse(
            TrustedOrigin.matches(
                "https://hearth.example.test",
                "https://not-hearth.example.test/today",
            ),
        )
    }
}
