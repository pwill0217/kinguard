// Prompts are written as single-turn user messages so they work identically on
// Gemini Nano (on-device) and Gemini in the cloud.

const PLACEHOLDER_NOTE =
  'Personal details have been replaced with placeholders like [PHONE_1], [PERSON_1] or [ACCOUNT_1]. ' +
  'Keep placeholders exactly as written if you mention them. Do not guess what they stand for.';

export function piiPrompt(text: string): string {
  return `You find personal information in messages so it can be hidden before anything is sent online.
List every person's name, street address, date of birth, account/member/policy number and ID number
that appears in the message below. Copy each one EXACTLY as it is written. Do not include company names,
government agency names, brand names, website addresses, or money amounts. If there are none, return an empty list.

MESSAGE:
"""
${text}
"""`;
}

export function screenshotPrompt(): string {
  return `This is a screenshot someone received (a text message, email, social media message, web page or letter).
Transcribe ALL readable text exactly, top to bottom, including sender names, phone numbers, links and buttons.
Then say what kind of message it is.`;
}

export function triagePrompt(text: string, linkSignals: string[]): string {
  const links = linkSignals.length ? `\nLINK CHECKS ALREADY DONE ON THIS DEVICE:\n- ${linkSignals.join('\n- ')}\n` : '';
  return `You are a careful scam-detection assistant protecting an older adult.
Decide how likely the message below is a scam, fraud or phishing attempt.
Common scams: fake government agencies (IRS, Social Security, Medicare), fake bank or Amazon alerts,
tech-support pop-ups, "grandchild in trouble" emergencies, romance, prizes, fake deliveries, fake jobs,
crypto investments, and requests for gift cards, wire transfers, crypto or verification codes.
Ordinary messages from friends, family, appointments and real receipts are usually safe.
${PLACEHOLDER_NOTE}
${links}
MESSAGE:
"""
${text}
"""

Give a riskScore from 0 to 100, a verdict, the category, your confidence, up to 5 short red flags
in plain words (empty if safe), and a one-sentence summary written for an older adult.`;
}

export function deepPrompt(text: string, triage: { riskScore: number; redFlags: string[]; where: string }, linkSignals: string[]): string {
  const links = linkSignals.length ? `\nAutomated link checks:\n- ${linkSignals.join('\n- ')}\n` : '';
  return `You are a fraud-prevention expert helping an older adult decide what to do about a message they received.
A quick first check (${triage.where === 'device' ? 'run privately on their device' : 'automated'}) scored it ${triage.riskScore}/100
and noted: ${triage.redFlags.length ? triage.redFlags.join('; ') : 'no red flags'}.
Double-check that assessment independently. Be calm and kind. Do not use jargon.
If it is safe, say so clearly so they are not scared for nothing.
${PLACEHOLDER_NOTE}
${links}
MESSAGE:
"""
${text}
"""

Return: riskScore 0-100, verdict, category, a short headline (max 10 words), a 2-3 sentence explanation
at a 6th-grade reading level, each red flag with why it matters, 3-5 concrete next steps
(e.g. "Do not click the link", "Hang up and call the number on the back of your card"),
and how to verify independently WITHOUT using any phone number, link or email from the message.`;
}
