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

## Link and pairing

Google's code scanner reads a `PairingInvite`. Pairing exchanges its code for the device token, with the invite's certificate fingerprint already pinned. Pairing details are kept in private SharedPreferences, with Android backup disabled.

Discovery resolves `_openfantasia._tcp` services and compares TXT `id` with the stored Mac id. A discovery failure falls back to the last address that succeeded. Requests try the address that worked last and search with Bonjour only when it stops answering; a Move is never resent automatically after an interrupted command.

Portraits use Coil with the same pinned certificate and authenticated HTTPS requests. Earlier Scenes expand to the summary supplied by the Mac.

A debug build can be paired over adb without a camera: run `fantasia pair --adb` on the Mac and run the command it prints.

