# Hearth Android TV shell

`apps/tv` is a small Kotlin Android TV application around the shared Hearth web
product. It is a launcher, pairing, lifecycle and recovery shell; household
business logic remains in `apps/server`, `apps/web`, `packages/core` and
`packages/shared`.

## Implemented boundary

- `LEANBACK_LAUNCHER` entry, television banner/icon and landscape full-screen activity
- one controlled WebView restricted to the exact paired Hearth origin
- origin-allowlisted AndroidX WebKit message listener with only app identity,
  network status and exit-request messages
- Android Back callback forwarded to the React history/overlay handler
- route restoration after ordinary Google TV app switching and activity recreation
- native connection, pairing, offline, revoked-device and WebView-update surfaces
- a fixed 1920-pixel logical TV viewport across 1080p and 4K Android density
  scaling, without changing ordinary browser or phone viewport behaviour
- one-time pairing whose 256-bit secret is created on the television, hashed by
  the server and encrypted at rest with an Android Keystore AES-256-GCM key
- an `HttpOnly`, `SameSite=Strict` device cookie installed by native code for the
  WebView; browser JavaScript never receives the raw device credential

The bridge does not use `addJavascriptInterface` and cannot launch Android apps,
run arbitrary intents, evaluate supplied JavaScript, access files, call Home
Assistant or expose provider credentials. Jellyfin remains an independent
Google TV app connected directly to the Synology server. Any separately
approved Home Assistant/Music Assistant voice-music flow targets the
television's Google Cast player directly and does not expand this shell bridge.

The APK has no Google Play Services dependency and its minimum Android API is 24, so it is also a
sensible sideload candidate for current Fire TV hardware. Fire TV still exposes a 1920×1080
application UI surface even when the HDMI output and native video decoder are running at 4K. Treat
Fire TV as an alternate launcher/lifecycle host for the same logical Hearth canvas, not as a route
to a native-4K web interface. Physical Fire OS pairing, remote, suspend/resume, WebView compatibility
and revocation remain device acceptance checks before calling that target supported.

## Toolchain

- Android Gradle Plugin 9.3.0
- Gradle 9.5.0 wrapper
- Java 17 bytecode (verified locally with Java 21)
- compile/target SDK 36; minimum SDK 24
- AndroidX Activity 1.13.0 and WebKit 1.16.0

Install Android command-line tools, platform 36 and build-tools 36. Android
Studio can manage these, or on this Homebrew Mac:

```sh
brew install --cask android-commandlinetools
sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools --licenses
sdkmanager --sdk_root=/opt/homebrew/share/android-commandlinetools \
  'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'
```

Copy `local.properties.example` to ignored `local.properties` and set `sdk.dir`
to the installed SDK. The current local build uses
`/opt/homebrew/share/android-commandlinetools`; that machine path is not part of
the source contract.

From `hearth/`:

```sh
pnpm tv:test
pnpm tv:lint
pnpm tv:build
pnpm verify:tv
```

The unsigned minified release output is
`app/build/outputs/apk/release/app-release-unsigned.apk`. A production release
must use the household signing key kept outside the repository. Debug builds
default to `http://10.0.2.2:4320` for the Android emulator; release builds accept
only a user-entered HTTPS origin. Cleartext is restricted to emulator/loopback
hosts in the debug manifest.

## Pair and run

1. Start the Hearth web/server workspace with `pnpm dev`.
2. Install `app/build/outputs/apk/debug/app-debug.apk` on the emulator or TV.
3. Open Hearth. The shell requests and displays a short-lived pairing code.
4. On the phone companion, open **More → Admin → Televisions** and approve that
   code.
5. The TV exchanges its private pairing secret for the approved device session,
   stores it securely and opens the last safe Hearth route.

For a physical debug television without private HTTPS, use an ADB reverse tunnel
and the loopback address rather than permitting arbitrary LAN cleartext:

```sh
adb reverse tcp:4320 tcp:4320
```

Production pairing requires the stable private HTTPS hostname/certificate
selected for the Synology deployment. Revoking the television in Admin causes
the next native session check to clear its credential and return to pairing.

## Remaining Phase 6 proof

The API 36 Google TV emulator passes pairing, D-pad completion/undo, Back/exit,
switching/resume, process recreation, sleep/wake, server recovery and revocation.
See `../../docs/evidence/phase-6/README.md`. Phase 6 is not complete until the
selected TCL television passes the same lifecycle checks, plus a visible
launcher-tile inspection, actual network disconnect and overnight resume.
