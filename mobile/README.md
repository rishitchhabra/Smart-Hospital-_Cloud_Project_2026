# Thinkora Android app (WebView)

A minimal Android WebView shell that loads **https://thinkora.tech**.

- Package: `tech.thinkora.app` · Label: **Thinkora**
- JavaScript + DOM storage enabled
- Links to `thinkora.tech` stay in-app; other domains / `mailto:` / `tel:` open in the system browser
- Hardware back button navigates web history
- Top loading progress bar and a friendly offline page

## Build

No Gradle required — uses the Android SDK build-tools directly (`aapt2`, `d8`,
`zipalign`, `apksigner`).

```bash
cd mobile
./build.sh
# -> output/thinkora.apk
```

Requirements: a JDK, and the Android SDK (`platforms/android-34`,
`build-tools/35.0.0`). The script auto-detects the SDK at
`$ANDROID_HOME` / `$ANDROID_SDK_ROOT` / `~/Library/Android/sdk`.

## Install on a phone

```bash
# via USB (enable Developer options → USB debugging first)
~/Library/Android/sdk/platform-tools/adb install -r output/thinkora.apk
```

Or copy `output/thinkora.apk` to the phone and open it (allow "Install unknown
apps" for your file manager/browser).

## Change the URL

Edit `HOME_URL` in `src/tech/thinkora/app/MainActivity.java` and re-run
`./build.sh`.

## Notes

- The app is signed with a local debug keystore (`debug.keystore`, generated on
  first build). For Play Store distribution, replace it with your release
  keystore and build an AAB/APK signed with it.
- Cleartext HTTP is disabled (`usesCleartextTraffic="false"`). To point at a
  local dev server over `http://` (e.g. `http://10.0.2.2:5173` on an emulator),
  set `android:usesCleartextTraffic="true"` in `AndroidManifest.xml`.
