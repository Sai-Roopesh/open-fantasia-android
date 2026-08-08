package com.example.open_fantasia.domain.model

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoleplayOutputValidatorAndroidTest {

    @Test
    fun acceptsNormalProseOnAndroidRegexEngine() {
        val prose = "The rain drummed against the balcony glass."
        assertEquals(prose, RoleplayOutputValidator.validate(prose))
    }
}
