# Android Device Testing and Publishing

The Android app is a Capacitor shell for `https://panamia.club`. Its permanent
Google Play package name is `social.pana.app`.

## Test on a physical Android phone

The JDK and Android SDK are the only computer-side prerequisites. Android
Studio is optional because `yarn mobile` discovers both tools and drives Gradle
and `adb` directly.

On the phone:

1. Open **Settings → About phone** and tap **Build number** seven times.
2. Open **Settings → System → Developer options** and enable **USB debugging**.
3. Connect the phone with a data-capable USB cable, unlock it, and approve the
   computer's debugging key when prompted.

Verify the connection in PowerShell:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

The phone must be listed with the state `device`, not `unauthorized`. Then build,
install, and launch the app:

```powershell
yarn mobile
```

The command installs a debug build over an existing debug build, so it is also
the normal update loop. If more than one device or emulator is attached,
disconnect the extras before running it.

For wireless debugging on Android 11+, choose **Pair device with pairing code**
under **Wireless debugging**, then run:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb pair PHONE_IP:PAIRING_PORT
& $adb connect PHONE_IP:DEBUG_PORT
& $adb devices -l
yarn mobile
```

The pairing and debugging ports shown by Android are often different.

To test a local web server rather than production, put the phone and computer
on the same network and use the computer's LAN address:

```powershell
$env:CAPACITOR_SERVER_URL = "http://192.168.1.50:3001"
yarn mobile
Remove-Item Env:CAPACITOR_SERVER_URL
```

## App navigation

The native-only interface opens in **Directory**, followed by **Social**,
**Community**, and **Profile**. Directory can search listings, Events, or Groups;
Events use real venue locations on the map. Community separates **Yours**
(joined groups, pending requests, plans, saved events) from **Discover**.
Profile opens your existing personal profile page.

These are deployed web changes, not a new APK requirement. Apply
`drizzle/0073_event_bookmarks.sql` before deploying the Worker, then reload the
app. Saving an event is a private bookmark, not an RSVP. Normal browsers keep
the existing website navigation.

## Native Google sign-in

The Android Google button uses Credential Manager, not OAuth inside the WebView.
It needs a rebuilt app containing `@capgo/capacitor-social-login`:

```powershell
yarn mobile
```

In the **same Google Cloud project** as the existing Web OAuth client:

1. Keep `GOOGLE_CLIENT_ID` set to the **Web application** client ID and
   `NEXT_PUBLIC_GOOGLE_ENABLED=true` in the Worker runtime. Keep
   `GOOGLE_CLIENT_SECRET` server-side; never include it in native config.
2. Create an **Android** OAuth client with package name `social.pana.app` and
   the **SHA-1** of the certificate signing the installed app. Obtain local
   fingerprints with:

   ```powershell
   Push-Location mobile\android
   .\gradlew.bat signingReport --console=plain
   Pop-Location
   ```

3. Register each signing key separately: debug, locally installed release /
   upload key, and the **Play App Signing** key for Play-distributed installs.
   The Android client IDs stay in Google Cloud; do not substitute one for the
   Web client ID used by `SocialLogin.initialize`.
4. If the OAuth consent screen is in testing mode, add the Google accounts
   used for testing. Use a device or emulator with Google Play services.

No Firebase setup or `google-services.json` is needed for this sign-in flow.
Google returns an ID token with a nonce. The WebView exchanges it with Better
Auth, which verifies it and creates the app's HttpOnly session cookie.
An existing Google account and email sign-in use the same verified-email account.

**SHA-1 for Google sign-in and SHA-256 for App Links are different settings.**
`ANDROID_APP_CERT_FINGERPRINTS` does not register a Google OAuth client.

## Email sign-in inside the app

Request a **fresh** email link from the app. It points to `/signin/mobile` and
does not consume the one-time token in the browser. Verified App Links open the
app directly; otherwise tap **Open Pana Mia app** on the browser landing page.
That action explicitly targets package `social.pana.app` and works without
verified domain association. The app verifies the token in its own WebView,
not Chrome. **Continue in browser instead** intentionally signs in only the
browser.

Reinstall the updated native build to register the auth scheme. Test with the
app already open and with it fully closed. A link already consumed by a browser
cannot transfer that browser session to the app; request a new one instead.

## Story camera

Open **Your story (+) → Open camera** to capture inside the app. Use **Photo**
for a still image, or **Video** to tap to start/stop a recording with sound.
Videos stop automatically after 60 seconds. The camera-switch button changes
between front and rear cameras when available.

Review the capture, **Retake** if needed, or choose **Use photo / Use video** to
upload it through the existing story uploader. Add a caption and tap **Post
story** to publish; capturing or uploading alone does not publish anything.
**Choose from gallery** remains available without camera permissions.
Recorded MP4 and WebM clips use the same H.264/AAC MP4 conversion as gallery
videos, so the posted story remains playable across Android, iOS, and browsers.

Camera access is requested only after opening the camera; microphone access is
requested only when starting a video. If access was denied, enable it under
**Android Settings → Apps → Pana Mia → Permissions** and try again. Back returns
to the story editor before leaving the screen. Closing the camera, reviewing a
capture, or backgrounding the app releases the camera and microphone.
Backgrounding during recording discards that unfinished recording.

The Android manifest declares camera, recording, and audio-settings permissions
for Capacitor's WebView permission handler. No gallery/storage permission is
needed. Camera and microphone hardware are optional, so devices without them
can still install the app and use gallery uploads. Existing installs need a
rebuilt Android app to receive the new manifest permissions.

Live capture needs a **secure context**. For USB testing against a local server,
use `adb reverse tcp:3001 tcp:3001` with
`CAPACITOR_SERVER_URL=http://localhost:3001`, or use a trusted HTTPS dev URL.
An ordinary LAN HTTP address works for gallery uploads, but not live capture.

## Create the Google Play upload key

Google Play App Signing should hold the app-signing key. The repository keeps
only an **upload key**, which Google verifies and then replaces with the
app-signing signature delivered to members.

Generate the upload key once. If `JAVA_HOME` is not set, replace the keytool
path with the one inside your installed JDK (this machine uses
`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot\bin\keytool.exe`):

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
  -keystore mobile\android\release-upload.jks `
  -alias upload `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

Create the ignored file `mobile\android\keystore.properties`:

```properties
storeFile=release-upload.jks
storePassword=REPLACE_WITH_KEYSTORE_PASSWORD
keyAlias=upload
keyPassword=REPLACE_WITH_KEY_PASSWORD
```

Back up the `.jks`, alias, and passwords in the organization's password manager.
They are intentionally ignored by Git. Losing the upload key requires a Play
Console key-reset process; committing it lets anyone impersonate the app.

Build a signed Android App Bundle:

```powershell
yarn mobile:bundle:android --version-code 1 --version-name 1.0.0
```

Every Play upload needs a higher integer `version-code`. The user-visible
`version-name` can follow semantic versioning. The resulting file is:

```text
mobile\android\app\build\outputs\bundle\release\app-release.aab
```

## First Google Play release

1. Create the app in [Google Play Console](https://play.google.com/console/) and
   choose package name `social.pana.app`.
2. Enroll in **Play App Signing** and upload the `.aab` to **Internal testing**.
3. Complete the store listing, content rating, target audience, ads, data
   safety, app access, privacy-policy, and account-deletion declarations.
4. Add testers and install the Play-signed build from its opt-in link.
5. In **Setup → App integrity → App signing**, copy both SHA-256 certificate
   fingerprints: the **app signing key** and the **upload key**.
6. Set `ANDROID_APP_CERT_FINGERPRINTS` to both comma-separated fingerprints in
   the deployed Worker environment, redeploy, and verify that
   `https://panamia.club/.well-known/assetlinks.json` contains both.
7. Test sign-in, deep links, account deletion, offline launch, donations, and
   external links on the Play-installed build before promoting it.

The first Play Console upload is intentionally manual: it establishes the app,
Play App Signing, declarations, and tester group before API publishing is
enabled.

## Automated internal releases

The **Android Release** GitHub Actions workflow builds a signed `.aab` on manual
dispatch. With **Publish to Google Play** disabled, it only uploads the bundle
as a workflow artifact. With publishing enabled, it sends the same bundle to
the selected Play track.

Add these GitHub Actions secrets:

| Secret                             | Value                                       |
| ---------------------------------- | ------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`          | Base64-encoded `release-upload.jks`         |
| `ANDROID_KEYSTORE_PASSWORD`        | Upload keystore password                    |
| `ANDROID_KEY_ALIAS`                | `upload`, unless a different alias was used |
| `ANDROID_KEY_PASSWORD`             | Upload key password                         |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play publishing service-account JSON        |

Create the keystore secret in PowerShell:

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("mobile\android\release-upload.jks")
) | Set-Clipboard
```

For API publishing, create a Google Cloud service account, invite it under
**Play Console → Users and permissions**, and grant only the release permissions
needed for the intended tracks. Store its complete JSON key as
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

Use the `internal` track first. Production promotion should remain a deliberate
Play Console action until internal testing and the store declarations are
complete.
