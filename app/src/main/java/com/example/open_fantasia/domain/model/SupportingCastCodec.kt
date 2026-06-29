package com.example.open_fantasia.domain.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * JSON codec for the per-thread supporting cast (stored as a TEXT column). Uses the runtime JSON
 * element API rather than a @Serializable type + generated serializer, so the kotlinx.serialization
 * compiler plugin (which mis-binds companion constructors under kapt) never touches CastMember.
 */

/** Parse the JSON-encoded supporting_cast column into cast members; tolerant of empty/garbage. */
fun parseSupportingCast(raw: String): List<CastMember> {
    if (raw.isBlank()) return emptyList()
    return runCatching {
        Json.parseToJsonElement(raw).jsonArray.map { element ->
            val obj = element.jsonObject
            CastMember(
                name = obj["name"]?.jsonPrimitive?.content ?: "",
                description = obj["description"]?.jsonPrimitive?.content ?: ""
            )
        }
    }.getOrDefault(emptyList())
}

/** Serialize cast members back to the JSON stored in the supporting_cast column, dropping blanks. */
fun List<CastMember>.toSupportingCastJson(): String {
    val array = buildJsonArray {
        this@toSupportingCastJson.forEach { member ->
            val name = member.name.trim()
            val description = member.description.trim()
            if (name.isNotEmpty() || description.isNotEmpty()) {
                add(buildJsonObject {
                    put("name", name)
                    put("description", description)
                })
            }
        }
    }
    return if (array.isEmpty()) "" else array.toString()
}
