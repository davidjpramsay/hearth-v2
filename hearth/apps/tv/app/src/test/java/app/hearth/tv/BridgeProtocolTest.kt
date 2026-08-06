package app.hearth.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BridgeProtocolTest {
    @Test
    fun `accepts only the three narrow message types`() {
        assertEquals(NativeRequest.APP_IDENTITY, BridgeProtocol.parse("{\"type\":\"app.identity\"}"))
        assertEquals(
            NativeRequest.NETWORK_STATUS,
            BridgeProtocol.parse("{ \"type\" : \"network.status\" }"),
        )
        assertEquals(NativeRequest.EXIT_REQUEST, BridgeProtocol.parse("{\"type\":\"exit.request\"}"))
        assertNull(BridgeProtocol.parse("{\"type\":\"intent.launch\"}"))
        assertNull(BridgeProtocol.parse("{\"type\":\"exit.request\",\"package\":\"other.app\"}"))
        assertNull(BridgeProtocol.parse(null))
    }

    @Test
    fun `rejects oversized messages before parsing`() {
        assertNull(BridgeProtocol.parse("x".repeat(257)))
    }
}
