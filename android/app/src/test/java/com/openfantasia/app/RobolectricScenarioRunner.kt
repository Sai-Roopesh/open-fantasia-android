package com.openfantasia.app

import org.junit.runners.model.FrameworkMethod
import org.robolectric.RobolectricTestRunner

class RobolectricScenarioRunner(type: Class<*>) : RobolectricTestRunner(type) {
    override fun testName(method: FrameworkMethod): String =
        method.getAnnotation(Scenario::class.java)?.name ?: super.testName(method)
}
