# 3-minute demo video script

**Setup before recording:** Chrome desktop with Gemini Nano available (the green "Private AI on this device" pill showing). The Kinguard extension loaded. A second window (or your phone) open on the Family tab, joined to the circle as the helper. A screen recorder at 1080p. Speak slowly; you can add English subtitles with YouTube's auto-captions.

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | Title card, then the Kinguard home screen | "Older adults lose billions to scams every year, and the messages are full of the private details they're trying to protect. Kinguard is a scam checker that keeps those details on your device." |
| 0:15–0:45 | Click the **"Grandson in jail"** example, then **Check it**. The red verdict appears. | "Here's a classic grandparent scam. Kinguard answers in plain words: almost certainly a scam, here are the warning signs, and here's exactly what to do. Notice it says 'don't call 415-555-0182'. That's the real number, but the cloud never saw it." |
| 0:45–1:20 | Open **How Kinguard checked this**. Point to each badge. | "This is the hybrid pipeline. Using Firebase AI Logic, Gemini Nano runs on this device to find and hide names and numbers, then screens the message using prefer-on-device mode. Because the risk was high, the redacted version (this, exactly) went to Gemini in the cloud for an expert double-check. The answer is re-hydrated on my device." |
| 1:20–1:40 | Switch to the family window: the alert has already appeared. Click **I'll call them**. | "Margaret's family circle got a real-time alert through Firestore. They see the warning, never the message. Firestore security rules enforce that." |
| 1:40–2:05 | Turn Wi-Fi **off**. Paste the **Fake Amazon alert** and check it. Show the "checked privately while offline" notice. Turn Wi-Fi back on: the double-check completes by itself. | "No internet? Gemini Nano still catches it, including the fake 'amaz0n' link, which is checked locally. When I reconnect, the cloud double-check runs automatically." |
| 2:05–2:25 | Paste a screenshot of a scam text. Show "Read your screenshot: on this device" in the ledger. | "Screenshots are read on-device by multimodal Gemini Nano. The image never leaves." |
| 2:25–2:40 | Right-click selected text on a web page → **Check with Kinguard**. Show a phone with the app open in **Secure cloud mode**. | "It's also a Chrome extension, and an installable app on phones, where the same hybrid model falls back to the cloud, still only on redacted text." |
| 2:40–2:55 | Firebase console → Remote Config showing `deep_check_threshold`. | "Routing is tuned live with Remote Config, and App Check protects every call." |
| 2:55–3:00 | Logo plus the URL | "Kinguard: private help for the people we love." |
