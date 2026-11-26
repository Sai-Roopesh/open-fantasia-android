package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PastSceneNavigationTest {
    @Test fun `Back cancels a pending read and reopening the same Scene keeps its loading state`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val fake = FakeFantasiaLink()
            val answers = listOf(CompletableDeferred<PastScene>(), CompletableDeferred<PastScene>())
            var requests = 0
            var cancellations = 0
            val link = object : FantasiaLink by fake {
                override suspend fun pastScene(storyID: String, number: Long): PastScene {
                    val answer = answers[requests++]
                    try { return answer.await()
                    } catch (e: CancellationException) { cancellations++; throw e }
                }
            }
            val model = FantasiaModel(link)
            model.openStory("story")
            runCurrent()
            val original = model.state.value.scene
            model.writeMove("An unfinished Move")
            model.openPastScene(13)
            runCurrent()
            assertTrue(model.state.value.pastSceneLoading)
            model.closePastScene()
            model.openPastScene(13)
            runCurrent()
            assertEquals(1, cancellations)
            assertTrue("The cancelled read must not finish the new read", model.state.value.pastSceneLoading)
            answers[0].complete(fake.past.copy(title = "An obsolete answer"))
            runCurrent()
            assertNull(model.state.value.pastScene)
            answers[1].complete(fake.past)
            runCurrent()
            assertEquals(fake.past, model.state.value.pastScene)
            assertFalse(model.state.value.pastSceneLoading)
            model.closePastScene()
            assertEquals(original, model.state.value.scene)
            assertEquals("An unfinished Move", model.state.value.draft)
            assertNull(model.state.value.readingScene)
            assertNull(model.state.value.problem)
            model.pause()
        } finally { Dispatchers.resetMain() }
    }
}
