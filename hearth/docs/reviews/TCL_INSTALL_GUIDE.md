# Install Hearth on the TCL Google TV for household testing

## Do I need an app store?

No. Hearth is currently a private development app and can be installed directly
with Android Debug Bridge (ADB). Google Play is unnecessary for one household
and would add store listing, review and distribution work that does not improve
the current test.

ADB installation is the development/testing route. A later household release
will use a consistently signed release APK and the private Synology/Tailscale
HTTPS address. It can still be installed directly; public Play Store publication
is only worth considering if Hearth is distributed beyond the household.

## Before starting

- The Mac and TCL must be on a network that lets them reach each other.
- Keep Hearth running on the Mac with `pnpm dev`.
- Have the TCL remote available.
- Do not enter real credentials during this test.
- This guide uses the debug APK and an ADB reverse tunnel. The tunnel is temporary
  and normally needs to be recreated after the TV or debugging connection restarts.

## 1. Build the debug APK

On the Mac:

```sh
cd "/Users/djpramsay@acc.edu.au/Documents/Code/hearth calendar v2/hearth"
pnpm tv:build
```

The debug APK is:

```text
apps/tv/app/build/outputs/apk/debug/app-debug.apk
```

## 2. Enable developer mode on the TCL

Google TV menu wording varies slightly by TCL firmware.

1. Open **Settings → System → About**.
2. Select **Android TV OS build** or **Build** repeatedly until the TV says you
   are a developer.
3. Return to **Settings → System → Developer options**.
4. Enable **USB debugging** and, if present, **Wireless debugging**.
5. Accept the warning only on your private home network.

If Wireless debugging is absent, stop here and use the USB/legacy network ADB
method appropriate to that TCL firmware. Do not install a random “APK installer”
app as a workaround.

## 3. Pair ADB over Wi-Fi

On the TV, open **Wireless debugging → Pair device with pairing code**. It shows
an IP address, pairing port and six-digit code.

On the Mac:

```sh
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$PATH"
adb pair TCL_IP:PAIRING_PORT
```

Enter the six-digit code when prompted.

Return to the main Wireless debugging screen. Note its connection IP and port;
this is commonly different from the pairing port.

```sh
adb connect TCL_IP:CONNECTION_PORT
adb devices -l
```

The device list may also contain `emulator-5554`. Record the TCL’s exact serial,
which normally looks like `TCL_IP:CONNECTION_PORT`.

## 4. Create the temporary tunnel and install Hearth

Replace `TCL_SERIAL` below with the exact serial from `adb devices -l`:

```sh
HEARTH_TCL_SERIAL='TCL_SERIAL'
adb -s "$HEARTH_TCL_SERIAL" reverse tcp:4320 tcp:4320
adb -s "$HEARTH_TCL_SERIAL" install -r \
  apps/tv/app/build/outputs/apk/debug/app-debug.apk
```

The reverse tunnel makes the Mac’s Hearth web app available to this TV as
`http://127.0.0.1:4320`. It does not publicly expose Hearth.

## 5. Open and pair Hearth

1. Open **Apps → Hearth** on the TCL.
2. If the address screen shows the emulator address `http://10.0.2.2:4320`,
   choose **Change address** and enter:

   ```text
   http://127.0.0.1:4320
   ```

3. Hearth displays a short pairing code.
4. On the Mac, open [Admin → Televisions](http://127.0.0.1:4320/admin/televisions).
5. Enter/approve the code as the fictional demo adult.
6. The TV should exchange its separate private credential and open Today.

## 6. Physical acceptance checks

- [ ] Hearth has a visible launcher tile and opens like a normal Google TV app.
- [ ] Text is readable from the normal couch position.
- [ ] No content is clipped by overscan or panel edges.
- [ ] Today → Week → Chores works using only the TCL remote.
- [ ] Chore complete and Undo preserve focus.
- [ ] Back unwinds routes and exits from Today.
- [ ] Home, Jellyfin and the intended music app still launch independently.
- [ ] The TCL exposes a separate Google Cast player that can be named `Hearth TV` in Home Assistant/Music Assistant.
- [ ] A Music Assistant Cast session can take over the screen, show available track metadata and play through the intended TV/eARC audio path without automating the Jellyfin UI.
- [ ] Switching away and back restores a sensible Hearth route/focus.
- [ ] TV sleep/wake restores a usable screen.
- [ ] An overnight standby test restores a usable screen the following morning.
- [ ] Temporarily disconnecting the TV network shows recovery UI, not a blank page.
- [ ] Restoring the network and choosing Try again recovers.
- [ ] Stopping/restarting Hearth on the Mac shows and recovers from server outage.
- [ ] Revoking the TV in Admin clears the TV credential and offers re-pairing.
- [ ] No media app is launched or controlled by Hearth.

The two Music Assistant checks are part of the separately approved live
Home Assistant/media workstream. Mark them **not run**, not failed, until Music
Assistant, Jellyfin access and the custom voice intents have been installed.
The Hearth shell checks can be completed independently.

## Reconnect after a reboot

If the app reports that Hearth is out of reach after the TV or Mac restarts:

```sh
adb connect TCL_IP:CONNECTION_PORT
HEARTH_TCL_SERIAL='TCL_IP:CONNECTION_PORT'
adb -s "$HEARTH_TCL_SERIAL" reverse tcp:4320 tcp:4320
```

Then choose **Try again** in Hearth.

## Longer-term household installation

The debug tunnel is not the production arrangement. The household release will:

- use a stable private HTTPS hostname for Hearth on the Synology/Tailscale network;
- use a release APK signed by a household key stored outside this repository;
- keep the same Android package/signing identity for updates;
- install updates directly or through a private distribution mechanism;
- not require a public Play Store listing.

Android’s developer-verification rollout is changing during 2026–2027. ADB
development installs remain supported. Before wider or non-ADB distribution,
register the package/signing key through the appropriate Android developer path
or use the limited household/hobbyist option available at that time.

## Official Android references

- [Create and run an Android TV app](https://developer.android.com/training/tv/get-started/create)
- [Connect a hardware device over Wi-Fi](https://developer.android.com/studio/run/device.html)
- [Install an APK with ADB](https://developer.android.com/tools/adb)
- [Android developer-verification FAQ](https://developer.android.com/developer-verification/guides/faq)
