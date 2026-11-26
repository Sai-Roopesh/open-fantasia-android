plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}
android {
    namespace = "com.openfantasia.app"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.openfantasia"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
    sourceSets {
        getByName("test").kotlin.directories.add("src/sharedTest/java")
        getByName("androidTest").kotlin.directories.add("src/sharedTest/java")
    }
    buildFeatures { compose = true; buildConfig = true }
    signingConfigs.getByName("debug") { storeFile = rootProject.file(".local/debug.keystore") }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
kotlin { jvmToolchain(17) }

val debugKeystore = rootProject.layout.projectDirectory.file(".local/debug.keystore")
val createDebugKeystore = tasks.register<Exec>("createDebugKeystore") {
    outputs.file(debugKeystore)
    onlyIf { !debugKeystore.asFile.exists() }
    doFirst { debugKeystore.asFile.parentFile.mkdirs() }
    executable = "${System.getProperty("java.home")}/bin/keytool"
    args("-genkeypair", "-keystore", debugKeystore.asFile.absolutePath, "-alias", "AndroidDebugKey",
        "-storepass", "android", "-keypass", "android", "-dname", "CN=Android Debug,O=Android,C=US",
        "-keyalg", "RSA", "-validity", "10000")
}
tasks.matching { it.name == "validateSigningDebug" || it.name == "validateSigningDebugAndroidTest" }
    .configureEach { dependsOn(createDebugKeystore) }

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.google.fonts)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.compose)
    implementation(libs.lifecycle.viewmodel)
    implementation(libs.coroutines.android)
    implementation(libs.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.okhttp.sse)
    implementation(libs.coil.compose)
    implementation(libs.coil.okhttp)
    implementation(libs.scanner)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.test)
    testImplementation("org.robolectric:robolectric:4.16.1")
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.mockwebserver)
    testImplementation(libs.okhttp.tls)
    testImplementation(libs.espresso)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.test)
    androidTestImplementation(libs.android.junit)
    androidTestImplementation(libs.runner)
    androidTestImplementation(libs.espresso)
    debugImplementation(libs.compose.tooling)
    debugImplementation(libs.compose.test.manifest)
}

// Keep downloaded Android runtime jars inside the Android workspace.
tasks.withType<Test>().configureEach {
    systemProperty("robolectric.dependency.dir", rootProject.file(".gradle-user/robolectric").absolutePath)
    if (providers.gradleProperty("fantasiaPreviews").isPresent) {
        systemProperty("fantasia.previews", rootProject.file(".local/previews").absolutePath)
    }
}

val robolectricRuntime by configurations.creating
dependencies { robolectricRuntime("org.robolectric:android-all-instrumented:15-robolectric-13954326-i7") }
val prepareRobolectric by tasks.registering(Sync::class) {
    from(robolectricRuntime)
    into(rootProject.file(".gradle-user/robolectric"))
}
tasks.withType<Test>().configureEach { dependsOn(prepareRobolectric) }
