package app.hearth.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReachabilityMessageTest {
    @Test
    fun `technical reachability errors use the family fallback`() {
        assertNull(familyReachabilityMessage("timeout"))
        assertNull(familyReachabilityMessage("net::ERR_CONNECTION_REFUSED"))
    }

    @Test
    fun `family readable server messages are retained`() {
        assertEquals(
            "Hearth is restarting. Try again shortly.",
            familyReachabilityMessage("Hearth is restarting. Try again shortly."),
        )
    }
}
