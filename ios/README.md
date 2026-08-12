# Mynah for iOS

The iOS build of the same app as `../android`, talking to the same server. One
product, two clients: the screens, the copy and the design are the Android app's,
and where this one differs it is because the platform left no choice — those
places are listed at the bottom and each is commented where it happens in the
code.

## Building

Xcode 16.2 or newer, iOS 17 deployment target, no third-party dependencies.

```bash
ios/build.sh
```

The script exists because Xcode is installed but `xcode-select` points at the
command line tools; it sets `DEVELOPER_DIR` itself rather than requiring
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. Opening
`Mynah.xcodeproj` in Xcode works without it.

To run it on a simulator:

```bash
xcrun simctl install "iPhone 16" /tmp/mynah-dd/Build/Products/Debug-iphonesimulator/Mynah.app
```

The server is baked in at `Build.serverURL` in `Mynah/App/MynahApp.swift`, the
counterpart of the Android build's `voicecall.serverUrl` property. Debug builds
accept a plain-HTTP address so the app can be pointed at a dev server;
release builds refuse one.

## Layout

```
Mynah/
  App/MynahApp.swift          entry point, server address, version
  Data/                       models, API client, settings, dictation, call watch
  UI/Theme/                   colours, type scale, the design's icons
  UI/                         shared components, navigation, the coach marks
  UI/Screens/                 one file per screen, named as on Android
  Resources/                  fonts, app icon, en + zh-Hans strings
```

`Mynah.xcodeproj` uses a file-system synchronized group, so a new file in
`Mynah/` is in the build the moment it is saved — there is no project file to
edit and nothing to keep in step.

## Strings

Both languages are generated from the Android resources, so the copy is
translated once and lives in one place:

```bash
python3 ios/tools/strings_from_android.py
```

Re-run it after changing `android/app/src/main/res/values*/strings.xml`. Strings
are read through `t("key")`, where the key is the Android resource name.

## Where this differs from Android, and why

* **Google sign-in without Google's SDK.** Android uses Credential Manager; here
  it is the OAuth flow Google publishes for native apps — `ASWebAuthenticationSession`
  plus PKCE, in `Data/GoogleSignIn.swift`. No dependency for one button, and the
  session intercepts its own callback, so the redirect scheme never has to be
  registered in Info.plist and the client id can arrive from the server at
  runtime the way Android's already does.

  It needs an **iOS OAuth client** in the same Google Cloud project (bundle id
  `com.voicecall.mynah`), set as `GOOGLE_IOS_CLIENT_ID` in the server's `.env`.
  Google issues an ID token to whichever client asked for it, so the two apps
  cannot share one id — the server now accepts either audience. Blank hides the
  button here and leaves Android untouched.
* **One payment route.** Android sells packs through Play Billing and through
  Stripe's in-app sheet. Here the top-up page is the whole shop: an in-app sheet
  needs Stripe's SDK, and a StoreKit purchase needs a server endpoint that checks
  the receipt with Apple, which does not exist yet. The page also takes WeChat
  Pay and Alipay, and is the only route that lets somebody else pay.
* **The call watch is not a service.** Android follows a live call from a
  foreground service. iOS has no such thing: holding a socket open from the
  background needs a VoIP push entitlement and a server that sends one. `CallWatch`
  follows the call for as long as the app is alive and posts a local notification
  when the assistant hands over or the call ends; anything longer needs push.
* **The session token is in the keychain**, not in the preferences store. It is
  the one thing here worth stealing, and the keychain is the only store on this
  platform that is not simply a file in the app's container.
* **Dictation** is `SFSpeechRecognizer` rather than Android's `SpeechRecognizer`,
  with the same press-and-hold contract.

Everything else — the screens, the flow, the copy, the colours, the type scale,
the icons (drawn from the same path data) — is the same app.
