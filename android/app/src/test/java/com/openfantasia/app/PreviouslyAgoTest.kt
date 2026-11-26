package com.openfantasia.app

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class PreviouslyAgoTest {
    @Test fun wholeHoursUnderTwoDaysThenWholeDays() {
        val since = "2026-10-01T18:00:00Z"
        val start = Instant.parse(since)
        assertEquals("30 HOURS AGO", previouslyAgo(since, start.plusSeconds(30 * 3600 + 3599)))
        assertEquals("47 HOURS AGO", previouslyAgo(since, start.plusSeconds(48 * 3600 - 1)))
        assertEquals("2 DAYS AGO", previouslyAgo(since, start.plusSeconds(48 * 3600)))
        assertEquals("3 DAYS AGO", previouslyAgo(since, start.plusSeconds(3 * 86400 + 86399)))
        assertEquals("3 HOURS AGO", previouslyAgo(since, start.plusSeconds(3 * 3600)))
    }
}
