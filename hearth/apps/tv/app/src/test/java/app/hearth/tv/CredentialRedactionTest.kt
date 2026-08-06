package app.hearth.tv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CredentialRedactionTest {
    @Test
    fun `credential string representations never expose the pairing secret`() {
        val secret = "private-pairing-secret"
        val credential = TvCredential(
            serverOrigin = "https://hearth.example.test",
            deviceId = "device_1",
            householdId = "household_1",
            pairingSecret = secret,
        )
        val pairing = PairingSession(
            pairingId = "pairing_1",
            code = "123456",
            status = "pending",
            expiresAt = "2026-08-04T01:00:00Z",
            pairingSecret = secret,
        )

        assertFalse(credential.toString().contains(secret))
        assertFalse(pairing.toString().contains(secret))
        assertTrue(credential.toString().contains("[REDACTED]"))
        assertTrue(pairing.toString().contains("[REDACTED]"))
    }
}
