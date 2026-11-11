# iOS Device Testing and Publishing

The first App Store release targets iPhone and uses the same Directory, Social, Community, Profile,
story camera, and detail screens as Android. There is no separate iOS website.
The permanent bundle identifier is **`social.pana.app`**.
Panamia's organization Team ID is **`RT9836SANW`**. The App Store Connect app
record is **`6830254519`**; the separate Personal Team used for sideloading
must not sign App Store builds.

Both Debug and Release target iPhone device family `1`. Apple may still offer
the iPhone app in compatibility mode on iPad; this is not a native iPad release.
iPad-specific App Store screenshots are not required for this device scope.
The responsive website, tablet layout, and WebKit coverage remain unchanged.
Native iPad support can be added later with an intentional target change and
the corresponding iPad screenshots.

## What is prepared

- The directory uses the compact 52px app header, a 58px rounded tab dock,
  and a 54px results row with listing and In map counts. Pin and ZIP-bubble
  selection scrolls the complete list to a highlighted, measured two-profile
  preview while the map stays fixed. Status-bar and home-indicator safe areas
  remain protected; very short landscape views show one profile when needed.
- Location sits inside search, above compact Category, Visit, Certified, and
  Events dropdowns. Visit uses declared online-only status, not missing
  coordinates: Both includes all, In person excludes online-only listings,
  and Online includes them. Unlocated results remain under Without location.
  Menus include Clear all and Done, remain above the dock, and preserve the
  map camera while refining results. Clear all keeps search text and location.
  Very short landscape views place the filters alongside search so pins remain
  reachable without hiding the filter controls.
- The header contains its 44px controls with vertical breathing room. The tab
  dock floats over Social, Community, and Profile as well as the map, with
  scroll space to keep final content reachable. Keyboard and conversation
  screens do not retain an empty dock-sized footer when the dock is hidden.
- The status-area surface and native headers share solid Pana cream (`#fff7ec`).
  Website masthead colors do not override the native app or results-sheet headers.
- ZIP markers use compact 24px ZIP-and-count labels with 44px tap targets.
  Portrait and landscape listing images stay cropped inside circular photo pins.
- The native frame respects the notch, landscape insets, home indicator, and
  visible keyboard viewport. Tabs hide while the keyboard covers the screen,
  form text avoids WebKit's focus zoom, and story captions stay above the keyboard.
- The iOS WebView enables back/forward history gestures. Its scene delegate
  forwards cold and warm Universal Links and email-auth scheme links to Capacitor.
- Camera, microphone, and foreground-location usage descriptions are included.
  **Your story (+)** opens the shared live camera directly, with gallery access
  still available if permission is denied or a camera is unavailable. Camera
  access is requested on that action, not at launch; the microphone is requested
  only when recording video. Captures are reviewed before upload and posting.
- Story preview, captured photos, and recorded video use the same vertical
  9:16 center crop, even when WebKit supplies a landscape camera stream.
  The images icon opens the native photo/video library (PHPicker), not the
  browser's Photo Library / Take Photo / Choose Files menu. A selection is
  reviewed before upload; canceling stays in the camera. The plugin converts
  HEIC selections to JPEG when needed without requesting broad library access.
  Sync and rebuild the iOS app to include the new FilePicker plugin. Older
  app versions show an update notice and retain the system picker. Mobile
  Safari still controls its own source menu; the site cannot suppress it.
- The compact header centers the Pana Mia Club wordmark, with messages on the
  left and notifications/account on the right. Detail pages retain Back and
  event-save controls. Account menus offer bug and safety reporting above
  About Pana, including for signed-out visitors.
- Social uses a newspaper icon, while Messages uses overlapping chat bubbles.
  Their navigation icons match the website without changing control sizes.
- Messages hides its own header shortcut throughout the inbox, requests and
  conversation flow, leaving Back as the leading control. The personal Profile
  tab and Account landing omit Back; nested settings and other profiles retain it.
- Open conversations hide the bottom tabs and header message shortcut. The
  header Back control returns to the message list without losing its draft;
  standalone group chats retain Back to group. Native messaging omits the
  composer helper text and legal footer while preserving composer safe areas.
- The main Messages inbox combines individual and group conversations without
  extra heading, search or compose controls. Requests stays separate; new text
  chats start from Message on another pana's profile, with the target preserved
  through sign-in. The same compact inbox is used on the website.
- Chat keeps Pana colours with a compact one-row composer that grows as you type.
  Phone Return adds a newline; Send submits. The photo control uses the standard
  file picker directly, not a new native plugin or intermediary menu. Conversation
  details explain the existing shareable-media link model. Photos are re-encoded
  without camera metadata before uploading; photo/GIF drafts, failed uploads and
  retry remain scoped to their conversation.
- While the iOS keyboard is open, the chat composer uses balanced 8px padding
  rather than reserving the home-indicator inset above the keyboard. Dismissing
  the keyboard restores the normal safe area; attachment and send controls
  remain aligned with the growing input.
  Detection handles both visual-viewport-only changes and a whole-WebView resize
  by retaining the available height while a text field is editable and focused.
  Hardware-keyboard focus without a height reduction keeps the normal safe area,
  and unfocused resizes or width/orientation changes refresh that height.
  Focus transfers also refresh keyboard state so returning to an inbox restores
  app navigation without needing a further viewport resize.
- iOS offers email-link sign-in. Android's Google SDK is deliberately excluded
  from the iOS native package. Do not enable Google on iOS without implementing
  the corresponding Apple-compliant login options and configuring their credentials.
- In-app donations are disabled on iOS until nonprofit fundraising approval,
  disclosures, and receipt behavior are complete. This applies to `/support-pana`
  and the legacy `/donate` redirect. Web and Android behavior is unchanged.
- Settings -> Data and Privacy Settings link to the existing account-deletion
  wizard, so members can start deletion inside the app rather than contacting support.
- Mobile Build verifies both the simulator and an unsigned device Release archive.
  iOS Release creates a signed App Store IPA, optionally uploading it to App Store Connect.

Browser-based iOS tests cover WebKit rendering and mocked bridge behavior. They
do not replace an Xcode build, simulator run, or real-device permission/link tests.

## Native age assurance

The terms require an age of at least 18. The iPhone launch controller checks
Apple's regional age-assurance eligibility before it creates the Capacitor
WebView. On iOS 26.4 and newer it also reads the required regulatory features;
on iOS 26.2-26.3 it uses eligibility directly. Users for whom Apple does not
require an age check continue to the existing app. Older supported iOS versions
do not have the regional APIs and retain the existing terms-based eligibility.
This is not a claim that an App Store 18+ rating verifies everyone's age.

When Apple requires a range, only a lower bound of at least 18 allows the app
to load. A minor/ambiguous range, declined sharing, unknown response or service
failure cannot silently open the WebView. The native screen offers retry and
external Terms/Privacy links in English and Spanish, with Dynamic Type and
VoiceOver support. No range, birth date, verification method or identity
document is passed to JavaScript, the website, persistent app storage or
analytics. Rejecting a device age range does not delete a Pana Mia account.

The app masks its existing WebView when it backgrounds and checks again before
allowing interaction on foreground. It discards stale asynchronous results and
removes the WebView when a new decision no longer permits access. Capacitor's
launch-URL cache preserves an email link received before the WebView exists.
Browser and Android behavior is unchanged.

Build with the iOS 26.5 SDK or newer. Enable **Declared Age Range** for App ID
`social.pana.app`, regenerate its App Store distribution profile, and update the
protected `ios-release` profile secret without changing the existing certificate.
Signed archives and exported IPAs must include
`com.apple.developer.declared-age-range = true`. The framework is weak-linked so
the iOS 15 minimum deployment target remains valid. Personal Team signing does
not grant this capability; testing age-assurance behavior requires an entitled
organization build rather than assuming the free-team sideload is equivalent.

Mobile Build runs native simulator tests for adult/minor/unknown/declined/error
decisions, retry, first-load protection, foreground revocation and stale result
handling, as well as an unsigned device archive. Before submission, also use
[Apple's age-assurance Sandbox guidance](https://developer.apple.com/documentation/storekit/testing-age-assurance-in-sandbox)
to exercise actual regional/age responses and verify the newly signed build on
an iPhone. Mocked decisions and a successful archive are not Sandbox proof.
Future significant changes require a separate PermissionKit/adult-notification
assessment; the initial-release gate is not a blanket legal-compliance audit.
See [Apple's framework FAQ](https://developer.apple.com/support/age-assurance/)
and [Texas update](https://developer.apple.com/news/?id=sg176nne), and obtain
appropriate guidance on applicable legal obligations.

## Apple account and website setup

1. Enroll the nonprofit in the standard Apple Developer Program as an organization.
   Request a nonprofit fee waiver if eligible. Use the organization's account,
   not a contractor's personal publishing account.
2. Register an explicit App ID for `social.pana.app` and enable **Associated Domains**
   and **Declared Age Range**.
   Create an iOS app record with this identifier in App Store Connect.
3. Find the Apple Team ID in Membership details. Set **`APPLE_APP_TEAM_ID`** to
   that value in the website's deployment environment, then deploy the website.
   The build environment uses **`APPLE_TEAM_ID`** for the same value.
4. Confirm `https://panamia.club/.well-known/apple-app-site-association` returns
   HTTP 200 JSON without redirects and authorizes `RT9836SANW.social.pana.app`.
   The first release claims only this active host; Directory and Social use
   `/d` and `/s` on it while the separate social subdomain is disabled.
   The release command checks every host in `IOS_UNIVERSAL_LINK_HOSTS` before
   archiving, and regression coverage keeps that list aligned with native
   entitlements. Add the social hostname only after it is healthy and subdomain
   navigation is intentionally enabled.

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
overrides and verifies `UIDeviceFamily` is exactly `[1]` in both the archive
and exported IPA. Output is under
`mobile/ios/App/build/release/VERSION-BUILD/`, including the archive and debug
symbols. Use `--provisioning-profile UUID` for manual distribution signing.

## Releasing from Windows with GitHub Actions

Create a GitHub Actions environment named **`ios-release`**. Restrict its allowed
branches and require approval for releases as appropriate. Add these secrets:

| Secret                                    | Value                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `APPLE_TEAM_ID`                           | Organization's 10-character Team ID                                                                                            |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`   | Base64-encoded Apple Distribution `.p12`, including its private key                                                            |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password protecting that `.p12`                                                                                                |
| `APPLE_PROVISIONING_PROFILE_BASE64`       | Base64-encoded App Store Connect distribution profile for `social.pana.app`, authorizing the app's declared Associated Domains |
| `APP_STORE_CONNECT_API_KEY_ID`            | App Store Connect API key ID; required only for upload                                                                         |
| `APP_STORE_CONNECT_ISSUER_ID`             | API key issuer ID; required only for upload                                                                                    |
| `APP_STORE_CONNECT_API_KEY_BASE64`        | Base64-encoded private `.p8` key; required only for upload                                                                     |

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

## App Review sign-in

Ordinary iOS members continue to use email links. Authorized reviewers can open
**App reviewer sign-in** from the sign-in page, or visit `/signin/reviewer`
inside the app, and use the dedicated `play-review@panamia.club` account.
The legacy address is shared with Google Play review; no Google sign-in,
mailbox access, MFA, or App Store Connect team membership is required.

Provisioning and password rotation use the existing **Play Review Account**
workflow on trusted `main`; see [reviewer access](./SIGNIN.md#app-store-and-google-play-reviewer-access).
Verify repeated login and a non-admin session before submitting the app.
Keep **Sign-in required** selected in App Store Connect, put the credential in
its App Review username/password fields, and describe the navigation steps in
review notes without copying the password there. Do not substitute an expiring
email link or a founder/admin account.

The account has no staff permissions and is not published as a resident or
business listing. Rotation revokes its sessions; update both stores' review
credentials after a confirmed rotation.

## Device and review checklist

- On a notched iPhone, test portrait/landscape, all four tabs,
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
- Complete privacy disclosures, age rating, support/privacy URLs, iPhone
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
