# Hearth Android TV shell

This small Kotlin launcher hosts the shared Hearth web product on Google/Android TV. Household
logic remains in the server, web and shared packages.

## Security boundary

- exact-origin WebView allowlist
- short-lived adult-approved pairing
- Android Keystore-protected device credential
- `HttpOnly`, `SameSite=Strict` device session
- native offline, revoked and recovery states
- Back/D-pad forwarding and route restoration
- no arbitrary intents, JavaScript bridge, files, provider credentials or media control

Jellyfin and other media apps remain independent. The shell targets API 24+ and a fixed 1920-pixel
logical canvas across 1080p and 4K output.

## Build

Install Java 17+, Android SDK/platform/build-tools 36, then set `sdk.dir` in ignored
`local.properties`.

```sh
pnpm tv:test
pnpm tv:lint
pnpm tv:build
pnpm verify:tv
```

The debug APK is `app/build/outputs/apk/debug/app-debug.apk`. Release builds require the household
signing key outside this repository.

## Pair

1. Start Hearth with `pnpm dev`.
2. Install and open the debug APK.
3. In the phone web app, open **More → Televisions** and approve the displayed code.

For a physical debug TV without private HTTPS, use `adb reverse tcp:4320 tcp:4320`. Production
requires the stable private Synology HTTPS origin. Current evidence and remaining physical-TV gates
are in [`../../docs/evidence/phase-6/README.md`](../../docs/evidence/phase-6/README.md).
