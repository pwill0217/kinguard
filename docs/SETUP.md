# Firebase setup

About 15 minutes. Everything here works on the free Spark plan with the default models.

## 1. Create the project and web app

1. Go to the [Firebase console](https://console.firebase.google.com) and create a project (Google Analytics is optional).
2. **Project settings → Your apps → Web (`</>`)**: register an app named `Kinguard`. Copy the config values into `web/.env` (see `web/.env.example`).

## 2. Firebase AI Logic

1. **AI Services → AI Logic → Get started**, then choose the **Gemini Developer API**.
2. The default models are `gemini-3.5-flash-lite` (hybrid fallback) and `gemini-3.8-flash` (deep check). Neither needs billing.

## 3. App Check (required by AI Logic)

1. **Security → App Check → Apps → your web app → reCAPTCHA Enterprise**. Create a site key for your hosting domains (`<project>.web.app`, `<project>.firebaseapp.com`) and put it in `VITE_RECAPTCHA_ENTERPRISE_KEY`.
2. For local development, set `VITE_APPCHECK_DEBUG_TOKEN=true`, run `npm run dev`, and copy the debug token printed in the browser console. Add it under **App Check → Apps → ⋮ → Manage debug tokens**, then paste it into `VITE_APPCHECK_DEBUG_TOKEN` in place of `true`.
3. **App Check → APIs → Firebase AI Logic → Enforce.**

> Never add `localhost` to the reCAPTCHA domains. Keep `.env` out of git (it's already ignored).

## 4. Authentication

**Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**

## 5. Cloud Firestore

**Build → Firestore Database → Create database** (production mode, any region). Rules are deployed from `firestore.rules` in step 7.

## 6. Remote Config (optional)

The app ships with sensible defaults. To tune routing live, deploy `remoteconfig.template.json` (step 7) or create these parameters by hand:

| Key | Default | Meaning |
|---|---|---|
| `deep_check_threshold` | 35 | First-pass risk score that escalates to the cloud deep check |
| `family_alert_threshold` | 70 | Risk score that alerts the family circle |
| `hybrid_cloud_model` | gemini-3.5-flash-lite | Cloud fallback model for the hybrid first pass |
| `deep_check_model` | gemini-3.8-flash | Cloud model for the deep check |
| `escalate_low_confidence` | true | Escalate low-confidence on-device verdicts |
| `max_input_chars` | 6000 | Characters analysed per check |

## 7. Deploy

```bash
npm install -g firebase-tools
firebase login
firebase use --add                      # pick your project
cd web && npm run build && cd ..
firebase deploy --only hosting,firestore,remoteconfig
```

Then open the extension's options and set the app URL to `https://<project>.web.app/`.

## 8. Turn on Gemini Nano (Chrome desktop)

Chrome 139+ → `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → restart. In Kinguard, click **Turn on private AI** (a one-time download of a few minutes). To check: run `await LanguageModel.availability()` in DevTools; it should return `available`.
