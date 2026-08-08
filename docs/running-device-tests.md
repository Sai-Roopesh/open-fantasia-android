# Running the connected test suite

```bash
./gradlew connectedDeviceTestAndroidTest
```

This installs and runs against the Device Test Sandbox (`com.example.open_fantasia.sandbox`), never the
personal app package. See `CONTEXT.md` for what that isolation guarantees.

## Keep the device awake for the whole run

The suite needs roughly 75–90 seconds of device time. If the screen sleeps partway through, every test
still pending fails with:

```
java.lang.IllegalStateException: No compose hierarchies found in the app.
```

The message points at Compose, but the cause is the screen: a sleeping device cannot resume the activity
that hosts `setContent`. The failures scatter unpredictably across unrelated classes — including tests
that never touch Compose — and change from run to run, which makes this look like test-ordering
flakiness. It is not. Measured on a device with a 30-second screen timeout: 3 of 5 full runs failed with
2–12 failures each, while the same commit passed 62/62 whenever the screen stayed on.

Before a run, keep the screen on while charging:

```bash
adb shell svc power stayon usb
```

Turn it back off afterwards with `adb shell svc power stayon false`. Raising **Settings → Display →
Screen timeout** past two minutes works equally well.

Diagnosing a suspected repeat:

```bash
adb shell settings get system screen_off_timeout
```

A value below the suite's runtime is the first thing to rule out — before reading any test code.
