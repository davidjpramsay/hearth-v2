# Phase 6 Android TV evidence

Date: 2026-08-04

Host: Apple Silicon macOS, Java 21.0.11

## Implemented slice

- Kotlin Google TV launcher with Leanback manifest/banner and no touch requirement
- controlled exact-origin WebView and three-message allowlisted native bridge
- AndroidX Back callback forwarded to the shared React navigation handler
- television-generated one-time pairing secret, server-side hash and revocation
- AES-256-GCM credential encryption under Android Keystore
- native setup, pairing, offline, revoked and WebView-recovery surfaces
- last safe route restoration across activity recreation/app switching
- a television-only 1920 CSS-pixel logical viewport so Android's 2x display
  density does not select a compact browser layout
- command IDs that retain cryptographic randomness on the emulator's permitted
  cleartext origin, where `crypto.randomUUID()` is unavailable

The native shell contains no Jellyfin/Music Assistant connection or launch
command and no Home Assistant/voice API. Those ownership boundaries remain as
recorded in D-019 and D-020.

## Automated results

| Command                                               | Result                                                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./gradlew --version`                                 | Passed: Gradle 9.5.0, Kotlin 2.3.20, Java 21.0.11                                                                                                                                                        |
| `./gradlew testDebugUnitTest lintDebug assembleDebug` | Passed: eight JVM tests, 0 lint errors, debug APK assembled                                                                                                                                              |
| `./gradlew lintRelease assembleRelease`               | Passed: 0 lint errors, minified unsigned release APK assembled                                                                                                                                           |
| `apkanalyzer manifest permissions app-debug.apk`      | Passed: only `INTERNET`, `ACCESS_NETWORK_STATE` and AndroidX's app-scoped protected receiver permission                                                                                                  |
| release manifest readback                             | Passed: `app.hearth.tv`, min 24/target 36, Leanback required, touch optional, backup/cleartext disabled, launcher and Leanback launcher present                                                          |
| release APK string scan                               | Passed for configured secrets/private origins: field/protocol labels exist as expected, but no credential value, configured server URL, Jellyfin, Music Assistant or Home Assistant endpoint is embedded |
| `pnpm verify:tv`                                      | Passed: native unit, debug/release lint, debug APK and minified release APK gates                                                                                                                        |
| `pnpm verify`                                         | Passed after the final emulator fixes: formatting, ESLint, strict TypeScript, 49 unit, 39 integration, 7 migration, production builds and 83 Playwright tests                                            |

APK observations:

- debug: approximately 3.8 MB, signed with the disposable debug key
- release: approximately 157 KB, minified and intentionally unsigned
- debug default origin: `http://10.0.2.2:4320`
- release default origin: empty; adult setup must enter the private HTTPS origin

Lint retains informational warnings for the deliberately pinned API 36/Gradle
9.5 toolchain, fixed TV landscape orientation and optional KTX conveniences.
There are no lint errors.

## API 36 Google TV emulator results

AVD `hearth_tv_api36` used the ARM64 Google TV API 36 image at 1920×1080 and
density 320. The emulator's Google TV onboarding obscures its launcher grid, but
Android package resolution found Hearth's `LEANBACK_LAUNCHER` activity and a
cold explicit launch completed in 508–642 ms. The selected TCL check must still
confirm the visible launcher tile.

| Scenario            | Result                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pairing             | Passed through the actual phone Admin approval contract. The TV generated the separate 256-bit secret, exchanged it after short-code approval and loaded Hearth.                                                                             |
| Credential handling | Passed. App preferences contained only an IV and AES-GCM ciphertext, server SQLite contained only `sha256:<digest>`, `document.cookie` was empty and the authenticated device-session route returned 200.                                    |
| Native viewport     | Passed. WebView reported `innerWidth=1920` at device pixel ratio 2; Today, Week and Chores render without the compact-layout clipping discovered on the first run.                                                                           |
| D-pad flow          | Passed using Android key events only: Today → Week → Chores, complete, undo; focus remained on the changed chore.                                                                                                                            |
| Back and exit       | Passed. Back unwound Chores → Week → Today, then returned to Google TV from Today.                                                                                                                                                           |
| App switching       | Passed. Home then reopen restored `/week`, its first meaningful event and an 89 ms hot resume.                                                                                                                                               |
| Process recreation  | Passed. Force-stop/cold reopen restored the last safe route and a usable focus target.                                                                                                                                                       |
| Standby/resume      | Passed for an emulator sleep/wake cycle: wakefulness changed Awake → Asleep → Awake and `/week` plus event focus were retained. An actual overnight interval remains part of the TCL check.                                                  |
| Server outage       | Passed. With only the Vite process paused, cold reopen showed the branded, family-readable native recovery screen; restoring the process and pressing Try again returned to the retained route.                                              |
| Revocation          | Passed. Adult Admin revocation was detected on resume, the encrypted preference map was cleared and the native disconnected screen offered re-pairing.                                                                                       |
| Full network loss   | Browser cached-content behaviour is covered in Playwright. Disconnecting the actual television network remains part of the selected-TCL run because the production Google TV emulator image does not permit changing its Ethernet interface. |

Retained screenshots:

- `screenshots/native-pairing-latest.png`
- `screenshots/emulator-today.png`
- `screenshots/emulator-week.png`
- `screenshots/emulator-chores.png`
- `screenshots/emulator-chore-done.png`
- `screenshots/emulator-chore-undone.png`
- `screenshots/emulator-back-week.png`
- `screenshots/emulator-back-today.png`
- `screenshots/emulator-resume-week.png`
- `screenshots/emulator-native-offline.png`
- `screenshots/emulator-offline-recovered.png`
- `screenshots/emulator-native-revoked.png`

## Remaining Phase 6 evidence

Phase 6 is not complete until the same launcher, remote navigation, ordinary app
switching, overnight standby/resume, server/network recovery and native-app
coexistence checks pass on the selected TCL television. The physical test also
closes the emulator's two limitations: a visually inspected launcher tile and
an actual television network disconnect.

## Security inspection notes

The release APK necessarily contains protocol field names such as
`pairingSecret`, `credential-exchanges` and `Bearer`; these are executable
contract labels, not secret values. Native credential and pairing-session
`toString()` implementations redact the secret, server logging redacts
authorization/cookies, and server SQLite stores only the prefixed SHA-256 hash.
The release keystore and private Hearth hostname/certificate are intentionally
absent from the workspace.
