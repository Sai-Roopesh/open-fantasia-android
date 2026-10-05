# Open Fantasia for Android

The phone pairs with the Mac, lists its Stories, displays its Scene views and applies its live changes. The Mac owns every Story and Path.

## Build

Run from this directory with the Android SDK available through `ANDROID_HOME`:

```sh
export GRADLE_USER_HOME="$PWD/.gradle-user"
./gradlew assembleDebug testDebugUnitTest assembleDebugAndroidTest
```

The Java 17 toolchain is provisioned through Gradle's toolchain resolver. The wrapper uses Gradle 9.1.0; the version catalog pins AGP 9.0.1, Kotlin 2.3.20 and Compose BOM 2026.03.01. AGP provides [built-in Kotlin support](https://developer.android.com/build/migrate-to-built-in-kotlin). Debug signing creates an ignored keystore in `.local/`, so building needs no writes to the home directory.

The APKs are `app/build/outputs/apk/debug/app-debug.apk` and `app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`. Device tests are built but are not run by that command.

The screen Compose checks run locally with Robolectric through `DesignUiJvmTest`, `WriterUiJvmTest` and `PastSceneUiJvmTest`, and on a device through the screen test classes and `WriterScreenTest`. They share assertions and fixtures in `app/src/sharedTest/`, at the approved 390 × 844 dp size locally. The local runner uses
API 35 with native graphics and keeps its downloaded Android runtime in `.gradle-user/robolectric`. The keyboard
check dispatches Android IME insets and measures the full Reply's end against the passage area and composer.

Scene changes that touch more than one part of the Scene (a Scene opened or closed, a Redo, Focus, Linger) read the
Scene view again; the stream resumes from the view's `last_event_id`, so words already shown are never repeated.

## Link and pairing

Google's code scanner reads a `PairingInvite`. Pairing exchanges its code for the device token, with the invite's certificate fingerprint already pinned. Pairing details are kept in private SharedPreferences, with Android backup disabled.

Discovery resolves `_openfantasia._tcp` services and compares TXT `id` with the stored Mac id. A discovery failure falls back to the last address that succeeded. Requests try the address that worked last and search with Bonjour only when it stops answering; a Move is never resent automatically after an interrupted command.

Portraits use Coil with the same pinned certificate and authenticated HTTPS requests. Contract 4 supplies earlier Scenes' one-line summaries; tapping one reads its full Scene through `GET /stories/{id}/scenes/{number}`. The read-only screen uses the Scene's prose and Move bubbles, and Back restores the current Scene's scroll position and draft.

The dark theme follows `docs/design/README.md`. Literata and Manrope load through the Compose Google Fonts provider with system serif and sans fallbacks. For optional local layout renders, run `./gradlew testDebugUnitTest -PfantasiaPreviews`; PNGs are written to `.local/previews/`. These renders use system fonts when Play services is unavailable and do not replace a phone comparison.

A debug build can be paired over adb without a camera: run `fantasia pair --adb` on the Mac and run the command it prints.
