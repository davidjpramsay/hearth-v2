package app.hearth.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BridgeProtocolTest {
    @Test
    fun `accepts only the four narrow message types`() {
        assertEquals(NativeRequest.APP_IDENTITY, BridgeProtocol.parse("{\"type\":\"app.identity\"}"))
        assertEquals(
            NativeRequest.NETWORK_STATUS,
            BridgeProtocol.parse("{ \"type\" : \"network.status\" }"),
        )
        assertEquals(NativeRequest.EXIT_REQUEST, BridgeProtocol.parse("{\"type\":\"exit.request\"}"))
        assertEquals(NativeRequest.PRESENTATION_STATUS, BridgeProtocol.parse("{\"type\":\"presentation.status\"}"))
        assertNull(BridgeProtocol.parse("{\"type\":\"intent.launch\"}"))
        assertNull(BridgeProtocol.parse("{\"type\":\"exit.request\",\"package\":\"other.app\"}"))
        assertNull(BridgeProtocol.parse(null))
    }

    @Test
    fun `presentation status is read only and rejects arguments duplicate types and malformed JSON`() {
        for (message in listOf(
            "{\"type\":\"presentation.status\",\"active\":true}",
            "{\"type\":\"presentation.status\",\"generation\":1}",
            "{\"type\":\"presentation.status\",\"url\":\"https://other.invalid\"}",
            "{\"type\":\"presentation.status\",\"type\":\"presentation.status\"}",
            "[\"presentation.status\"]",
            "{\"type\":\"presentation.status\"} trailing",
            "{\"type\":\"presentation.set\"}",
        )) assertNull(BridgeProtocol.parse(message))
    }

    @Test
    fun `rejects oversized messages before parsing`() {
        assertNull(BridgeProtocol.parse("x".repeat(257)))
    }

    @Test
    fun `requires exactly one literal opening and closing brace`() {
        assertEquals(
            NativeRequest.APP_IDENTITY,
            BridgeProtocol.parse("{\n\t\"type\" : \"app.identity\"\r\n}"),
        )
        for (message in listOf(
            "{\"type\":\"app.identity\"",
            "\"type\":\"app.identity\"}",
            "{\"type\":\"app.identity\"}}",
            "{{\"type\":\"app.identity\"}",
            "{\"type\":\"app.identity\"} trailing",
        )) assertNull(BridgeProtocol.parse(message))
    }
}
