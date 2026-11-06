# Building the Android APK

This guide takes you from the current project to a real `.apk` you can install
on your phone. The wrapper is **Capacitor** — it bundles your Vite/React build
into a native Android shell.

> **Why this path:** browsers refuse `navigator.geolocation` on plain `http://`
> when accessed from a phone — that's why your phone showed "Location access
> denied" earlier. Native Android apps don't have that restriction, so once
> you're running the APK, location simply works.

## 0. One-time prerequisites

You need to install these on your laptop. They are **not** in the project zip
because they're hundreds of MB and proprietary.

| Tool | Why | Where to get it |
| --- | --- | --- |
| **Java JDK 17** (or 21) | Android Gradle Plugin needs it | [Adoptium](https://adoptium.net/) — pick "Temurin 17 LTS" |
| **Android Studio** | Android SDK, build-tools, emulator, APK builder | [developer.android.com/studio](https://developer.android.com/studio) |

After installing Android Studio, open it once and let it download the default
Android SDK Platform (API 34 is fine). Then add an environment variable so the
CLI can find it:

- **Windows:** Set `ANDROID_HOME` to `C:\Users\YOUR_USER\AppData\Local\Android\Sdk`.
  Add `%ANDROID_HOME%\platform-tools` to PATH.
- **Mac/Linux:** Set `ANDROID_HOME` to `~/Library/Android/sdk` (Mac) or
  `~/Android/Sdk` (Linux).

Verify in a fresh terminal:
```bash
java -version       # should print 17.x or 21.x
adb --version       # should print a version (means platform-tools on PATH)
```

## 1. Decide where the backend lives

The APK is just the frontend. The Node/Express backend has to be reachable
**from the phone over the internet (or LAN)**. Pick one of these and remember
the URL:

| Option | URL it gives you | Best for |
| --- | --- | --- |
| **Deploy to Render / Railway / Fly.io** (free tiers) | `https://your-app.onrender.com` | Production. Works on cellular data. |
| **ngrok on your laptop** | `https://abcd.ngrok-free.app` | Quick demo to friends. |
| **LAN IP, http** | `http://192.168.x.x:5000` | Same Wi-Fi only. Already supported because `capacitor.config.ts` sets `allowMixedContent: true`. |

## 2. Set the backend URL in the build

Edit `frontend/.env`:
```
VITE_API_URL=https://your-backend-url   # or http://192.168.x.x:5000
```

This URL is **baked into the APK at build time**, so you have to rebuild the
APK if the backend URL changes later.

## 3. Install dependencies

In `frontend/`:
```bash
npm install
```

This pulls in `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`,
`@capacitor/geolocation`, etc. (already added to `package.json`).

## 4. Add the Android platform (one time only)

```bash
npm run cap:add:android
```

This generates a new `frontend/android/` folder — the Android Studio project.
Commit it to git or keep it; you only run this command once per machine.

## 5. Build the web app and sync into Android

Every time you change frontend code:

```bash
npm run build       # produces dist/
npx cap sync        # copies dist/ + plugins into android/
```

Or as one shortcut: `npm run android` (build + sync + open Android Studio).

## 6. Build the APK in Android Studio

When Android Studio opens the `android/` project, wait for it to finish "Gradle
sync" the first time (takes 5–15 minutes — it's downloading build tools).
Then:

- Top menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- A notification at the bottom right says "APK(s) generated successfully" with
  a **locate** link — click it.
- The file is at:
  `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

That's your installable APK. Copy it to your phone (USB, email, Google Drive)
and tap to install. You'll need to enable **Install from unknown sources** for
the file manager / browser the first time.

### Or, build straight to a connected phone

Plug your phone in with USB, enable USB debugging in developer options, then:
```bash
npx cap run android
```
Capacitor compiles, installs, and launches in one step. Useful for rapid
testing.

## 7. Permissions

The first time the APK opens, Android will pop up:
- "Allow Gas Delivery to access your location?" → tap **While using the app**.

That's the native permission prompt — completely separate from the browser's
location prompt, and not subject to http/https rules. After granting once,
location works permanently inside the app.

## 8. Going to release (signed APK / Play Store)

The `app-debug.apk` above is signed with a debug key — fine for sideloading
to your own phones, **not** acceptable to the Play Store. To make a release
APK:

1. In Android Studio: **Build → Generate Signed Bundle / APK** → **APK** →
   **Create new keystore**. Save the `.jks` file somewhere safe (you need it
   for every future update, forever).
2. Build → grab the `.apk` from `app/build/outputs/apk/release/`.

For the Play Store, build an `.aab` (App Bundle) instead of an APK using the
same wizard.

## Common gotchas

- **`SDK location not found`** when Android Studio first opens the project →
  You skipped step 0; install the SDK and set `ANDROID_HOME`.
- **`Cleartext HTTP traffic to 192.168.x.x not permitted`** → Means the build
  didn't pick up `allowMixedContent: true`. Run `npx cap sync` again, then
  rebuild. If it still fails, open
  `android/app/src/main/AndroidManifest.xml` and ensure the `<application>`
  tag has `android:usesCleartextTraffic="true"`.
- **"Network error" / "Failed to fetch"** in the app → The phone can't reach
  your backend URL. Test it from the phone's browser at the same URL — if
  that fails, your `VITE_API_URL` is wrong or the backend is down/firewalled.
- **Location dialog never appears** → Make sure `@capacitor/geolocation` is
  in `node_modules` and you ran `npx cap sync` after adding it. Verify
  `android/app/src/main/AndroidManifest.xml` contains
  `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />`.

## Optional — use the native-aware geolocation helper

I added `frontend/src/lib/nativeGeolocation.ts` which prefers Capacitor's
native plugin on Android and falls back to `navigator.geolocation` on web.
For the existing code you don't strictly need to touch anything — installing
`@capacitor/geolocation` and running `cap sync` is enough for `navigator.
geolocation` to be redirected through native services. But if you want
better control (e.g. to call `requestPermissions()` explicitly with a custom
rationale dialog), refactor places that currently call
`navigator.geolocation.getCurrentPosition` to use:

```ts
import { getCurrentPosition } from '@/lib/nativeGeolocation';

const coords = await getCurrentPosition();
```

That helper hides the platform difference for both `getCurrentPosition` and
`watchPosition`.
