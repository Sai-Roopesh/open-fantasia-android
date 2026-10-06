package com.openfantasia.app

/**
 * The notification permission is asked once, the first time a Move is sent, on Android 13 and later (openspec
 * presence). Without it nothing is shown; the Mac's work is unaffected.
 */
class NotificationAsk(
    private val sdk: Int,
    private val granted: () -> Boolean,
    private val wasAsked: () -> Boolean,
    private val markAsked: () -> Unit,
    private val request: () -> Unit
) {
    fun moveSent() {
        if (sdk < 33 || granted() || wasAsked()) return
        markAsked()
        request()
    }
}
