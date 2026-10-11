package com.openfantasia.app

import com.openfantasia.protocol.*
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.Assert.*
import org.junit.Test

class ModelsLinkTest {
    private val view = """{"stories":[],"jobs":[],"providers":[],"actor_backup":{"choice":{"provider":"claude","model":"claude-sonnet-5-5","effort":null},"label":"Sonnet 5.5"},"trace_id":"models"}"""

    @Test fun `the Models screen is read, a job's model and a Story's Actor are put, and Redo and Retry carry a model`() = runBlocking {
        MacServer().use { mac ->
            mac.enqueue(MockResponse().setBody(view))
            assertEquals("models", mac.client.models().traceID)
            mac.server.takeRequest().let { assertEquals("GET", it.method); assertEquals("/models", it.path) }

            mac.enqueue(MockResponse().setBody(view))
            mac.client.setJobModel(ModelJob.Weaver, SetJobModelRequest(model = ModelChoice(provider = ModelProvider.Codex, model = "gpt-6.1-sol", effort = "high")))
            mac.server.takeRequest().let {
                assertEquals("PUT", it.method)
                assertEquals("/models/jobs/weaver", it.path)
                assertEquals("""{"model":{"effort":"high","model":"gpt-6.1-sol","provider":"codex"}}""", it.body.readUtf8())
            }

            // A second model: the Weaver's, and the Actor's for every Story.
            for (job in listOf(ModelJob.Weaver, ModelJob.Actor)) {
                mac.enqueue(MockResponse().setBody(view))
                assertEquals("Sonnet 5.5", mac.client.setJobModel(job, SetJobModelRequest(model = ModelChoice(provider = ModelProvider.Claude, model = "claude-sonnet-5-5"), backup = true)).actorBackup.label)
                mac.server.takeRequest().let {
                    assertEquals("PUT", it.method)
                    assertEquals("/models/jobs/${job.value}", it.path)
                    assertEquals("""{"backup":true,"model":{"model":"claude-sonnet-5-5","provider":"claude"}}""", it.body.readUtf8())
                }
            }

            mac.enqueue(MockResponse().setBody(view))
            mac.client.setActor("story", SetActorRequest(model = null))
            mac.server.takeRequest().let {
                assertEquals("PUT", it.method)
                assertEquals("/stories/story/actor", it.path)
                assertEquals("""{"model":null}""", it.body.readUtf8())
            }

            mac.enqueue(MockResponse().setBody("""{"move_entry_id":"move","trace_id":"retry"}"""))
            mac.client.retry("story", RetryRequest(model = ModelChoice(provider = ModelProvider.Claude, model = "claude-sonnet-5-5")))
            assertEquals("""{"model":{"effort":null,"model":"claude-sonnet-5-5","provider":"claude"}}""", mac.server.takeRequest().body.readUtf8())

            mac.enqueue(MockResponse().setBody("""{"move_entry_id":"move","trace_id":"redo"}"""))
            mac.client.redo("story", RedoRequest(after = "reply", direction = null, remember = false, model = ModelChoice(provider = ModelProvider.Codex, model = "gpt-6.1-sol", effort = "low")))
            assertEquals("""{"after":"reply","direction":null,"model":{"effort":"low","model":"gpt-6.1-sol","provider":"codex"},"remember":false}""", mac.server.takeRequest().body.readUtf8())
        }
    }
}
