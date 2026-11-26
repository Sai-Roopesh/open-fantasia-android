package com.openfantasia.app

import org.junit.runners.BlockJUnit4ClassRunner
import org.junit.runners.model.FrameworkMethod

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Scenario(val name: String)

// DEX cannot encode › in method names; JUnit descriptions preserve the spec's exact name.
class ScenarioRunner(type: Class<*>) : BlockJUnit4ClassRunner(type) {
    override fun testName(method: FrameworkMethod): String =
        method.getAnnotation(Scenario::class.java)?.name ?: super.testName(method)
}
