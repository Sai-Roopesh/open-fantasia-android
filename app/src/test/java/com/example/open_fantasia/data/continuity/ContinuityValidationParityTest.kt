package com.example.open_fantasia.data.continuity

import com.example.open_fantasia.domain.model.CastProfile
import com.example.open_fantasia.domain.model.DurableMemorySnapshot
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * Android half of the shared validation contract.
 *
 * The Mac Host validates a Continuity response in JavaScript and this validates the same
 * invariants in Kotlin, written independently. Android is the final authority, so a rule enforced
 * here but not on the host means the host accepts a snapshot the phone will reject — after a full
 * engine run is already spent and the lineage is already blocked. These fixtures are the contract,
 * and `parity.test.mjs` asserts the same verdicts on the host side.
 *
 * Only the verdict is compared. The two implementations phrase their errors differently, and
 * forcing identical strings across two languages would couple them without making continuity safer.
 */
class ContinuityValidationParityTest {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val fixtureDir = File("../tools/continuity-worker/fixtures/validation")

    @Test
    fun fixtureCorpusIsReachable() {
        assertTrue(
            "Shared fixture corpus not found at ${fixtureDir.absolutePath}. " +
                "Regenerate with: node tools/continuity-worker/fixtures/build-fixtures.mjs",
            fixtureDir.isDirectory
        )
        assertTrue("Expected a meaningful corpus", fixtureFiles().size >= 20)
    }

    @Test
    fun androidReachesTheSameVerdictAsTheMacHost() {
        val disagreements = mutableListOf<String>()

        fixtureFiles().forEach { file ->
            val fixture = json.parseToJsonElement(file.readText()) as JsonObject
            val name = fixture["name"]!!.jsonPrimitive.content
            val expectAccept = fixture["expect"]!!.jsonPrimitive.content == "accept"
            val reason = fixture["reason"]!!.jsonPrimitive.content

            val snapshot = json.decodeFromJsonElement(DurableMemorySnapshot.serializer(), fixture["world_state"]!!)
            val seeds = fixture["seeds"]!!.jsonArray.map {
                json.decodeFromJsonElement(CastProfile.serializer(), it)
            }
            val reachable = fixture["reachable_turn_ids"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet()

            val accepted = runCatching {
                ContinuityCheckpointProtocol.validateForParity(
                    snapshot = snapshot,
                    target = fixture["target_turn_id"]!!.jsonPrimitive.content,
                    baselineVersion = fixture["baseline_version"]!!.jsonPrimitive.content.toInt(),
                    seeds = seeds,
                    reachableTurnIds = reachable
                )
            }

            if (accepted.isSuccess != expectAccept) {
                val verdict = if (accepted.isSuccess) "accepted" else "rejected: ${accepted.exceptionOrNull()?.message}"
                val expected = if (expectAccept) "accept" else "reject ($reason)"
                disagreements += "${file.name}: $name — expected $expected, Android $verdict"
            }
        }

        if (disagreements.isNotEmpty()) {
            fail(
                "Android and the Mac Host disagree on ${disagreements.size} validation case(s). " +
                    "A rule has drifted between the two implementations:\n" +
                    disagreements.joinToString("\n") { "  - $it" }
            )
        }
    }

    private fun fixtureFiles(): List<File> =
        fixtureDir.listFiles { f: File -> f.extension == "json" }?.sortedBy { it.name } ?: emptyList()
}
