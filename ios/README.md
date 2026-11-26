# Kinguard for iPhone

SwiftUI app sharing the web app's Firebase project, family circles and Firestore rules.

**Hybrid AI on iOS 27:** Firebase AI Logic's `GeminiLanguageModel` and Apple's on-device `SystemLanguageModel`
both plug into Foundation Models' `LanguageModelSession`, so every step uses the same code and the same
`@Generable` output types. Only the model changes:

| Step | Model | Why |
|---|---|---|
| Read screenshot | Apple Vision (on-device) | The image never leaves the phone |
| Find names/addresses | Apple on-device model **only** | Sees raw text, must never reach the cloud |
| First-pass screen | Apple on-device, **falls back to Gemini** | Redacted text only |
| Expert double-check | Gemini via Firebase AI Logic | Redacted text, only above the Remote Config threshold |

## Requirements
Xcode 27+, iOS 27 Simulator or device with Apple Intelligence (the Simulator uses the Mac's Apple Intelligence; Mac and Simulator versions should match).

## Setup
1. Firebase console → Project settings → Add app → iOS, bundle ID `com.kinguard.app`. Download `GoogleService-Info.plist`.
2. Xcode → New Project → iOS App, name `Kinguard`, org `com.kinguard`, SwiftUI. Delete the generated `ContentView.swift` and `KinguardApp.swift`, then copy this folder's `Kinguard/` contents into the app folder.
3. Add packages: `firebase-ios-sdk` ≥ 13.2.0 (FirebaseAILogic, FirebaseAppCheck, FirebaseAuth, FirebaseFirestore, FirebaseRemoteConfig) and `GoogleSignIn-iOS` (GoogleSignIn, GoogleSignInSwift).
4. Target → General → Minimum Deployments: iOS 27.0. Build Settings → **Default Actor Isolation: nonisolated**.
5. Target → Info → URL Types → add the `REVERSED_CLIENT_ID` from `GoogleService-Info.plist` as a URL scheme.
6. Run on an iPhone Simulator. Copy the App Check debug token printed in the console into Firebase console → App Check → Apps → Manage debug tokens.
