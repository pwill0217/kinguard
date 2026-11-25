# Devpost submission text

**Project name:** Kinguard

**Tagline:** A private scam checker for older adults and their families: Gemini Nano on-device first, the cloud only for what it can't do, and never your personal details.

**Platform:** Web (Chrome), as a web app plus a Chrome extension, with an installable Android PWA using the cloud path.

---

## Inspiration

Scammers target older adults more than any other group, using texts, emails and calls that feel personal and urgent: a "grandson" in jail, an "Amazon" lockout, a "USPS" fee. The usual advice, "ask an AI", has a cruel catch. The messages are full of the very things a scam victim must protect: names, phone numbers, account numbers and one-time codes. We wanted a tool a grandparent could trust with those messages.

## What it does

Paste a message, add a screenshot, share from your phone, or right-click in Chrome. Kinguard answers in plain words: **"This is almost certainly a scam"**, with the warning signs, numbered steps ("Do not call 415-555-0182"), and how to check for yourself. It can read the answer aloud. If the risk is high, it quietly alerts a trusted family member, who sees the warning but never the message.

## How we used Firebase AI Logic (hybrid inference)

Kinguard uses four Firebase AI Logic models, each with a deliberate inference mode:

1. **`ONLY_ON_DEVICE` screenshot reader:** multimodal Gemini Nano transcribes screenshots locally. With no on-device model, the user is asked before the image goes to the cloud.
2. **`ONLY_ON_DEVICE` PII finder:** Gemini Nano finds names and addresses in the raw text, combined with on-device regex for phones, emails, Luhn-validated cards, SSNs, account numbers and URL query strings. Everything is replaced with placeholders like `[PHONE_1]`. This step can never fall back to the cloud, because it is the only step that sees raw text.
3. **`PREFER_ON_DEVICE` first-pass screen:** instant, free and offline-capable on Chrome desktop. On phones it falls back to `gemini-3.5-flash-lite` automatically, and it only ever receives redacted text.
4. **`ONLY_IN_CLOUD` expert double-check:** when the first pass crosses a risk threshold tuned live in **Remote Config**, `gemini-3.8-flash` reviews the **redacted** text and writes clear next steps. Its answer is re-hydrated on-device, so advice is personal without the cloud ever learning the details.

Every model uses structured output, with one `Schema` serving as both `responseSchema` (cloud) and `responseConstraint` (Nano), so both paths return the same JSON. We read each response's `inferenceSource` and show it in a **privacy ledger**: the user can open "How Kinguard checked this" and see which steps ran on their device and the exact text that was sent to the cloud.

The hybrid split is the product, not a fallback: the device does the private, high-volume, offline work, and the cloud does the hard reasoning on data it can't misuse.

Also used: **App Check** (reCAPTCHA Enterprise, plus a debug provider for development), **Remote Config** (routing thresholds and model choice), **Anonymous Auth** and **Cloud Firestore** (family circle with offline persistence and security rules that only allow redacted verdicts).

## Value proposition

- **For older adults:** a calm, large-print second opinion in seconds that never asks them to give up private details.
- **For families:** peace of mind and a real-time heads-up at the moment it matters, without reading their parent's messages.
- **For the app's operator:** most checks cost nothing because they run on-device. The cloud is used only for the risky minority.

## How we built it

React + TypeScript + Vite, the Firebase JS SDK (`firebase/ai` with `InferenceMode`), a service worker for offline use and an Android share target, a Manifest V3 Chrome extension, and 21 unit tests. The tests include privacy guarantees, for example "no raw phone number or name ever reaches a non-device model".

## Challenges

- Gemini Nano is single-turn with a token cap, so every prompt is a single self-contained message, and long inputs are capped by a Remote Config value.
- Small models sometimes disagree with themselves (for example "safe" with a risk of 90), so outputs are normalized for consistency.
- Designing redaction that removes personal data but keeps scam signals: brands, amounts and link domains stay; query strings, codes and names go.

## What's next

Gmail and Messages integrations, more languages (the on-device model supports more), and a caregiver weekly digest.

## Built during the submission period

All code was written during the #BuildHybridAI 2026 submission period.
