package com.example.open_fantasia.data.continuity

import javax.crypto.AEADBadTagException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContinuityHostPreferencesTest {

    @Test
    fun corruptRestoredCredentialStoreIsClearedAndRecreated() {
        var attempts = 0
        var cleared = false

        val result = recoverEncryptedCredentialStore(
            open = {
                attempts++
                if (attempts == 1) throw AEADBadTagException("old Android Keystore key")
                "fresh-store"
            },
            clearCorruptStore = {
                cleared = true
                true
            }
        )

        assertEquals("fresh-store", result)
        assertEquals(2, attempts)
        assertTrue(cleared)
    }

    @Test(expected = IllegalStateException::class)
    fun unrelatedInitializationFailureIsNotHidden() {
        recoverEncryptedCredentialStore(
            open = { throw IllegalStateException("programming error") },
            clearCorruptStore = { true }
        )
    }
}
