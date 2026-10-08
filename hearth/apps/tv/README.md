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

The native shell sets that viewport at document start for the exact paired origin, with a
post-parser fallback on older WebViews. Reloads therefore retain TV layout independently of the
server startup script. The wide and square launcher assets retain the original Hearth fern to
the left of the Nunito Sans wordmark, with outline attribution in `design/OFL.txt`. Only the
launcher composition tints the existing transparent mark cream; the original brand file is unchanged.

Bounded native layer lists compose the original mark and vector lettering. Matching xhdpi PNG
renditions keep bitmap-oriented launchers compatible without stretching a square icon into the
wide banner. From `hearth/`, regenerate with `node apps/tv/design/render-launcher.mjs` or verify
their pixels against the native source resources with the same command plus `--check`.

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

Update an existing signed installation with `adb install -r`; do not uninstall or clear pairing.

## Pair

1. Start Hearth with `pnpm dev`.
2. Install and open the debug APK.
3. In the phone web app, open **More → Televisions** and approve the displayed code.

For a physical debug TV without private HTTPS, use `adb reverse tcp:4320 tcp:4320`. Production
requires the stable private Synology HTTPS origin. Current evidence and remaining physical-TV gates
are in [`../../docs/evidence/phase-6/README.md`](../../docs/evidence/phase-6/README.md).
