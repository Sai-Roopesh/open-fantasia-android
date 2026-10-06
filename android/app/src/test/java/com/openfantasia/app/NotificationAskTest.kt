package com.openfantasia.app

import org.junit.Assert.*
import org.junit.Test

class NotificationAskTest {
    private var asked = false
    private var requests = 0
    private fun ask(sdk: Int, granted: Boolean = false) =
        NotificationAsk(sdk, { granted }, { asked }, { asked = true }, { requests++ })

    @Test fun `the permission is asked the first time a Move is sent on Android 13 and later`() {
        val notifications = ask(33)
        notifications.moveSent()
        notifications.moveSent()
        ask(36).moveSent()
        assertEquals(1, requests)
    }

    @Test fun `nothing is asked before Android 13 or once it is granted`() {
        ask(32).moveSent()
        ask(36, granted = true).moveSent()
        assertEquals(0, requests)
        assertFalse(asked)
    }
}
