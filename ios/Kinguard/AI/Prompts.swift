// Single-turn prompts shared by the on-device and cloud models.
import Foundation

enum Prompts {
    static let placeholderNote = """
    Personal details have been replaced with placeholders like [PHONE_1], [PERSON_1] or [ACCOUNT_1]. \
    Keep placeholders exactly as written if you mention them. Do not guess what they stand for.
    """

    static func pii(_ text: String) -> String {
        """
        You find personal information in messages so it can be hidden before anything is sent online.
        List every person's name, street address, date of birth, account or member number and ID number
        that appears in the message below. Copy each one EXACTLY as written. Do not include company names,
        government agency names, brand names, website addresses or money amounts. If there are none, return an empty list.

        MESSAGE:
        \"\"\"
        \(text)
        \"\"\"
        """
    }

    static func triage(_ text: String, linkSignals: [String]) -> String {
        let links = linkSignals.isEmpty ? "" : "\nLINK CHECKS ALREADY DONE ON THIS DEVICE:\n- " + linkSignals.joined(separator: "\n- ") + "\n"
        return """
        You are a careful scam-detection assistant protecting an older adult.
        Decide how likely the message below is a scam, fraud or phishing attempt.
        Common scams: fake government agencies (IRS, Social Security, Medicare), fake bank or Amazon alerts,
        tech-support pop-ups, "grandchild in trouble" emergencies, romance, prizes, fake deliveries, fake jobs,
        crypto investments, and requests for gift cards, wire transfers, crypto or verification codes.
        Ordinary messages from friends, family, appointments and real receipts are usually safe.
        \(placeholderNote)
        \(links)
        MESSAGE:
        \"\"\"
        \(text)
        \"\"\"
        """
    }

    static func deep(_ text: String, triage: Triage, triageWhere: Where, linkSignals: [String]) -> String {
        let links = linkSignals.isEmpty ? "" : "\nAutomated link checks:\n- " + linkSignals.joined(separator: "\n- ") + "\n"
        let firstPass = triageWhere == .device ? "run privately on their phone" : "automated"
        let flags = triage.redFlags.isEmpty ? "no red flags" : triage.redFlags.joined(separator: "; ")
        return """
        You are a fraud-prevention expert helping an older adult decide what to do about a message they received.
        A quick first check (\(firstPass)) scored it \(triage.riskScore)/100 and noted: \(flags).
        Double-check that assessment independently. Be calm and kind. Do not use jargon.
        If it is safe, say so clearly so they are not scared for nothing.
        \(placeholderNote)
        \(links)
        MESSAGE:
        \"\"\"
        \(text)
        \"\"\"
        """
    }
}
