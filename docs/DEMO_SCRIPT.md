# 3-minute demo video script

**Before recording:**
- Chrome desktop with the green **On-device AI** pill showing.
- Signed in as you (the circle owner), with a second account (incognito or your phone) already joined as a **protected** member. Name it "Mom" or "Grandma" if you can.
- Kokoro voice already downloaded: press "Play a sample" in Settings once beforehand.
- iPhone running Kinguard (signed in as Mom or as you), in the same circle. Mirror it with QuickTime (File → New Movie Recording → choose the iPhone as camera) or record its screen separately.
- Chrome extension loaded. Record at 1080p.
- Slow, calm narration. YouTube auto-captions cover the English subtitle requirement; review them before publishing.

| Time | Show | Say |
|---|---|---|
| 0:00–0:12 | The family page: avatars, "Everyone's safe" | "Scammers target the people we love most, and the messages they send are full of private details. This is Kinguard: scam protection for families that keeps those details on your device." |
| 0:12–0:40 | Switch to Mom's window. Paste the **"Grandson in jail"** example and click **Check it**. Show the stage list running, then the red verdict. | "Mom gets a text from her 'grandson', who needs bail money in gift cards. She pastes it in. Kinguard says, plainly: almost certainly a scam, and exactly what to do. It even names the number not to call." |
| 0:40–0:55 | Click **Read this to me** and let Kokoro speak for about 5 seconds. | "And it can read it to her, in a natural voice that runs on her device. Kokoro, in the browser." |
| 0:55–1:30 | Open **How Kinguard checked this**. Point at the green **On this device** badges, then at "Exactly what the cloud saw" with [PERSON_1] and [PHONE_1]. | "Here's the hybrid AI, all through Firebase AI Logic. Gemini Nano runs on-device to read screenshots and hide names and numbers. Then it screens the message in prefer-on-device mode. Because the risk was high, only this redacted version went to Gemini in the cloud for an expert double-check. The answer is re-personalised on the device. The cloud never saw her details." |
| 1:30–1:55 | Switch to your window: the red **"1 warning needs attention"** card, Mom's avatar with a red ring. Click **I'll call**. | "Meanwhile I get a real-time alert on our family page, through Firestore. I see the warning, never her message, and I let everyone know I'm calling her." |
| 1:55–2:15 | Turn Wi-Fi **off**. Check the **Fake Amazon alert**. Show "Checked privately while offline". Turn Wi-Fi on: the double-check completes. | "No internet? Gemini Nano still catches it, including the fake 'amaz0n' link checked locally. Back online, the cloud double-check finishes by itself." |
| 2:15–2:45 | **iPhone:** check a sample scam. Show the green on-device chip and "Where it ran". Tap **Tell my family**; the red banner pops up in the browser. | "And it's a native iPhone app. Here Apple's on-device model does the private work, and Firebase AI Logic brings in Gemini only for the hard cases, on the same redacted text. Same family, across iPhone and web." |
| 2:45–2:52 | Quick cut: right-click → **Check with Kinguard**; then the Invite sheet showing "4/8". | "Plus a Chrome extension, and family circles with expiring invites and roles, enforced by Firestore rules." |
| 2:52–3:00 | Logo and URL | "Kinguard. Private AI that looks out for the people you love." |
