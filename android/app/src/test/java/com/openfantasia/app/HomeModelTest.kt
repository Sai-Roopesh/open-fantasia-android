package com.openfantasia.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HomeModelTest {
    // Home shows where every Story stands (openspec stories): coming back to the app on Home reads the list again, so a
    // change made on the Mac meanwhile, such as Claude moving a Story to another Path, shows without opening the Story.
    @Test fun `coming back to the app on Home reads every Story again`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val link = FakeFantasiaLink()
            val model = FantasiaModel(link)
            model.home()
            advanceUntilIdle()
            val read = link.storyRequests
            model.pause()
            model.resume()
            advanceUntilIdle()
            assertEquals(read + 1, link.storyRequests)
            assertNull(model.state.value.scene)
        } finally { Dispatchers.resetMain() }
    }
}
