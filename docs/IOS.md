# iOS Device Testing and Publishing

The iPhone and iPad app uses the same Directory, Social, Community, Profile,
story camera, and detail screens as Android. There is no separate iOS website.
The permanent bundle identifier is **`social.pana.app`**.

## What is prepared

- The native frame respects the notch, landscape insets, home indicator, and
  visible keyboard viewport. Tabs hide while the keyboard covers the screen,
  form text avoids WebKit's focus zoom, and story captions stay above the keyboard.
- The iOS WebView enables back/forward history gestures. Its scene delegate
  forwards cold and warm Universal Links and email-auth scheme links to Capacitor.
- Camera, microphone, and foreground-location usage descriptions are included.
  Camera and microphone access is requested by the existing story UI, not at launch.
- iOS offers email-link sign-in. Android's Google SDK is deliberately excluded
  from the iOS native package. Do not enable Google on iOS without implementing
  the corresponding Apple-compliant login options and configuring their credentials.
- In-app donations are disabled on iOS until nonprofit fundraising approval,
  disclosures, and receipt behavior are complete. Web and Android behavior is unchanged.
- Settings -> Data and Privacy Settings link to the existing account-deletion
  wizard, so members can start deletion inside the app rather than contacting support.
- Mobile Build verifies both the simulator and an unsigned device Release archive.
  iOS Release creates a signed App Store IPA, optionally uploading it to App Store Connect.

Browser-based iOS tests cover WebKit rendering and mocked bridge behavior. They
do not replace an Xcode build, simulator run, or real-device permission/link tests.

## Apple account and website setup

1. Enroll the nonprofit in the standard Apple Developer Program as an organization.
   Request a nonprofit fee waiver if eligible. Use the organization's account,
   not a contractor's personal publishing account.
2. Register an explicit App ID for `social.pana.app` and enable **Associated Domains**.
   Create an iOS app record with this identifier in App Store Connect.
3. Find the Apple Team ID in Membership details. Set **`APPLE_APP_TEAM_ID`** to
   that value in the website's deployment environment, then deploy the website.
   The build environment uses **`APPLE_TEAM_ID`** for the same value.
4. Confirm both hosts return HTTP 200 JSON, without redirects, from
   `https://panamia.club/.well-known/apple-app-site-association` and
   `https://social.panamia.club/.well-known/apple-app-site-association`.
   Their `applinks.details` must authorize `TEAMID.social.pana.app`.
   The release command checks this before archiving; broken associations must not ship.

## Local Mac

Install dependencies and use a current App Store-supported Xcode and SDK.
The minimum supported device OS remains iOS 15.

### Sideload before organization enrollment is approved

A free Apple Account can provision a development build on your own iPhone.
Sign into **Xcode -> Settings -> Accounts** with an Apple Account that offers a
**Personal Team**. This can be your personal-email or Panamia-email account;
your iPhone's iCloud account does not need to change.

1. Install full Xcode and finish its first-launch setup. Select its command-line
   tools under **Xcode -> Settings -> Locations**. Install Node.js LTS and enable Corepack.
2. Copy or check out this version of the repository on the Mac, then run
   `yarn install --immutable`. A checkout of an older branch will not contain this command.
3. Connect and unlock the iPhone over USB, approve **Trust This Computer**, and
   pair it in **Xcode -> Window -> Devices and Simulators**. Enable **Settings ->
   Privacy & Security -> Developer Mode** on the iPhone when prompted, including
   the required restart.
4. Obtain your 10-character **Personal Team ID** from the development certificate.
   In Xcode's account settings, choose your Personal Team and **Manage Certificates**;
   create an **Apple Development** certificate if none exists. In **Keychain Access ->
   login -> My Certificates**, open that certificate's **Details** and copy
   **Subject Name -> Organizational Unit (OU)**, not the Issuer's OU or the
   identifier in parentheses in the certificate name. Do not select a Personal
   Team against this app's production bundle ID just to find the team identifier.
   This is not Panamia's pending organization Team ID.
5. Run the commands below, replacing the team and device placeholders:

```bash
yarn mobile:sideload:ios --list-devices
yarn mobile:sideload:ios --team-id YOUR_PERSONAL_TEAM_ID --device YOUR_IPHONE_UDID
```

Use the hardware UDID from the device list or the **Identifier** in Xcode's
Devices and Simulators window, not a simulator or CoreDevice UUID.

The command syncs Capacitor, builds and signs Debug, verifies the app identity,
signature, and signed entitlements, and installs/launches it using Capacitor's existing `native-run`
tooling. It sets a separate bundle ID,
`social.pana.app.personal.<lowercase-personal-team-id>`, and selects the empty
`App/Personal.entitlements` file **only in that build command**. A blank
`CODE_SIGN_ENTITLEMENTS=` setting is not sufficient for Xcode's automatic
provisioning checks. It does not edit the production bundle ID or release entitlements,
and does not require the organization's website Team ID or distribution certificate.

If Xcode reports **missing Xcode-Token** or invalid saved credentials, reauthenticate
the Apple Account that owns the selected Personal Team in **Xcode -> Settings ->
Accounts**. Do not delete the keychain or production profiles to resolve this.
If you use a different account, obtain that account's Personal Team ID instead.

Free personal provisioning expires after **seven days**; rebuild/reinstall to
renew it. Universal Links are unavailable in this personal build, so app-requested
email links open the handoff page in Safari; tap **Open Pana Mia app** to complete
sign-in in the app. Remove this development copy before installing TestFlight or
the production app: both copies register the same email-auth URL scheme.

The native shell loads **the deployed `https://panamia.club` website**. Sideloading
does not deploy unpublished web UI changes or start a local website server.
Use a deployed HTTPS preview through `CAPACITOR_SERVER_URL` if you need to test
unpublished web changes. Build output stays under `mobile/ios/App/build/personal/`.

### Organization-signed device and App Store builds

```bash
yarn install --immutable
yarn mobile:sync
yarn mobile:open:ios
```

In Xcode, select the **App** target and your organization under **Signing &
Capabilities**. Keep the bundle ID and Associated Domains entitlements unchanged.
Use automatic signing for local device testing, then choose a connected iPhone
or an iOS simulator and run the app.

To create a signed App Store package from an authenticated local Xcode installation:

```bash
yarn mobile:bundle:ios --version-name 1.0.0 --build-number 1 --team-id ABCDE12345
```

The version must have three numeric components, without a prerelease suffix.
The build number is an increasing integer from 1 to 9999 for that version.
An existing output directory is not overwritten; move a failed attempt's output
before retrying the same version/build.

The command always syncs iOS, archives **Release** for a physical-device
destination, and exports an `app-store-connect` IPA. It rejects preview/server
overrides. Output is under
`mobile/ios/App/build/release/VERSION-BUILD/`, including the archive and debug
symbols. Use `--provisioning-profile UUID` for manual distribution signing.

## Releasing from Windows with GitHub Actions

Create a GitHub Actions environment named **`ios-release`**. Restrict its allowed
branches and require approval for releases as appropriate. Add these secrets:

| Secret                                    | Value                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `APPLE_TEAM_ID`                           | Organization's 10-character Team ID                                                                          |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`   | Base64-encoded Apple Distribution `.p12`, including its private key                                          |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password protecting that `.p12`                                                                              |
| `APPLE_PROVISIONING_PROFILE_BASE64`       | Base64-encoded App Store Connect distribution profile for `social.pana.app`, with Associated Domains enabled |
| `APP_STORE_CONNECT_API_KEY_ID`            | App Store Connect API key ID; required only for upload                                                       |
| `APP_STORE_CONNECT_ISSUER_ID`             | API key issuer ID; required only for upload                                                                  |
| `APP_STORE_CONNECT_API_KEY_BASE64`        | Base64-encoded private `.p8` key; required only for upload                                                   |

The distribution certificate must include its private key: a downloaded `.cer`
alone cannot sign an app. Use a valid, unexpired App Store Connect profile,
not a development, ad-hoc, or enterprise profile. For uploads, create an App Store
Connect team API key with permission to upload builds, such as the Developer role.

Open **Actions -> iOS Release -> Run workflow**, select the intended release ref,
and supply the version/build. **Upload to TestFlight defaults to off**. The job
imports credentials into a temporary keychain, checks the profile's app/team,
expiration, distribution type, and domains, then produces the signed IPA and debug
symbols artifact. Credentials are removed even if a later step fails.

Enabling upload sends the IPA to App Store Connect; it does not publish to the
public App Store. Wait for Apple processing, complete export-compliance questions,
and assign internal TestFlight testers. External testing may require Beta App Review.
Never commit signing files, API keys, or their Base64 contents.

## Device and review checklist

- On a notched iPhone and an iPad, test portrait/landscape, all four tabs,
  detail-page Back, history gestures, long result lists, and map-sheet dragging.
- Open Directory search, Community search, messages, and a story caption with the
  keyboard visible. Confirm the focused control and submit/close controls remain reachable.
- Grant and deny location, camera, and microphone access. Test camera switching,
  photo capture, MP4 video, gallery selection, upload, backgrounding, and permission recovery.
- Request a fresh sign-in email inside the app. Open it with the app fully closed
  and already running; verify one sign-in in the app's cookie store, not Safari's.
  Also test the explicit **Open Pana Mia app** fallback when Universal Links are disabled.
- Verify offline launch, reconnect, sign-out, account deletion, reporting, and blocking
  from the signed-in native UI. Do not assume a simulator validates camera hardware.
- Keep iOS fundraising disabled until Apple's nonprofit approval and the required
  fund-use disclosures and tax-receipt behavior are documented. Do not bypass the
  donation gate with a Stripe link or an embedded browser.
- Complete privacy disclosures, age rating, support/privacy URLs, iPhone/iPad
  screenshots, and reviewer-access instructions in App Store Connect. Provide a
  usable review account/login path despite passwordless authentication.
- Review the archive's SDK privacy report and the app's actual cryptography before
  answering Apple's export-compliance questionnaire. Do not blindly declare that
  all app encryption is TLS-only or set `ITSAppUsesNonExemptEncryption` to false.
- Explain the app's directory/map UI, camera, community features, and device
  integration in review notes. Apple's minimum-functionality review still applies
  to a web-backed app; a successful build does not guarantee App Review approval.

Enrollment, signing credentials, the website Team ID deployment, a successful
macOS archive, and signed real-device/TestFlight testing remain release prerequisites.
