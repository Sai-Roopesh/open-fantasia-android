package com.openfantasia.app

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PrivatePreviouslyStoreTest {
    @Test fun dismissalsSurviveStoreInstancesStayPerStoryAndLeaveThePairingAlone() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val paired = PairedMac(hostID = "mac", hostName = "Mac", fingerprint = "fingerprint",
            deviceToken = "token", lastAddress = MacAddress(host = "localhost", port = 7443))
        PrivatePairingStore(context).write(paired)
        val since = "2026-10-03T18:00:00Z"
        val store = PrivatePreviouslyStore(context)
        assertNull(store.read("story"))
        store.write("story", since)
        store.write("other", "2026-10-02T18:00:00Z")
        val restarted = PrivatePreviouslyStore(context)
        assertEquals(since, restarted.read("story"))
        assertEquals("2026-10-02T18:00:00Z", restarted.read("other"))
        assertNull(restarted.read("unplayed"))
        restarted.write("story", "2026-10-04T18:00:00Z")
        assertEquals("2026-10-04T18:00:00Z", PrivatePreviouslyStore(context).read("story"))
        assertEquals("2026-10-02T18:00:00Z", PrivatePreviouslyStore(context).read("other"))
        assertEquals(paired, PrivatePairingStore(context).read())
    }
}
