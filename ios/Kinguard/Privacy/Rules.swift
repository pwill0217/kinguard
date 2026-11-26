// Last-resort, rules-only screening (Swift port of web/src/local/rules.ts).
// Used when neither the on-device model nor the cloud is reachable.
import Foundation

enum Verdict: String, Codable, CaseIterable {
    case safe, suspicious, likely_scam

    static func from(score: Int) -> Verdict {
        score >= 60 ? .likely_scam : score >= 30 ? .suspicious : .safe
    }

    var headline: String {
        switch self {
        case .likely_scam: "This looks like a scam"
        case .suspicious: "Be careful with this one"
        case .safe: "This looks safe"
        }
    }
}

enum Category: String, Codable, CaseIterable {
    case none, impersonation_government, impersonation_bank, tech_support, family_emergency, romance,
         prize_lottery, delivery, job_offer, investment_crypto, phishing_link, invoice_payment, other

    var label: String {
        switch self {
        case .none: "No scam pattern"
        case .impersonation_government: "Fake government agency"
        case .impersonation_bank: "Fake bank or company alert"
        case .tech_support: "Fake tech support"
        case .family_emergency: "Family emergency scam"
        case .romance: "Romance scam"
        case .prize_lottery: "Fake prize or lottery"
        case .delivery: "Fake delivery notice"
        case .job_offer: "Fake job offer"
        case .investment_crypto: "Investment or crypto scam"
        case .phishing_link: "Phishing link"
        case .invoice_payment: "Fake bill or payment demand"
        case .other: "Other warning signs"
        }
    }
}

enum Rules {
    private struct Rule {
        let pattern: String
        let weight: Int
        let flag: String
        let category: Category?
    }

    private static let rules: [Rule] = [
        Rule(pattern: #"gift ?cards?|itunes card|google play card|steam card"#, weight: 35, flag: "Asks for payment with gift cards", category: .invoice_payment),
        Rule(pattern: #"bitcoin|crypto|usdt|btc atm|wallet address"#, weight: 25, flag: "Mentions cryptocurrency payments", category: .investment_crypto),
        Rule(pattern: #"wire transfer|western union|moneygram|zelle|cash app|venmo"#, weight: 15, flag: "Asks for hard-to-reverse money transfers", category: nil),
        Rule(pattern: #"\b(urgent|immediately|right away|within (24|48) hours|act now|final notice|last chance)\b"#, weight: 15, flag: "Creates urgency or a deadline", category: nil),
        Rule(pattern: #"don'?t tell|keep (this|it) (a )?secret|between us|don'?t call"#, weight: 30, flag: "Asks you to keep it secret", category: .family_emergency),
        Rule(pattern: #"\b(jail|bail|arrested)\b"#, weight: 30, flag: "Family-emergency story (jail, bail, accident)", category: .family_emergency),
        Rule(pattern: #"\b(irs|social security|ssa|medicare|tax(es)? owed|warrant)\b"#, weight: 20, flag: "Claims to be a government agency", category: .impersonation_government),
        Rule(pattern: #"(account|card) (has been |was )?(locked|suspended|compromised|frozen)|unusual (sign-?in|activity)"#, weight: 20, flag: "Says your account is locked or compromised", category: .impersonation_bank),
        Rule(pattern: #"virus|infected|microsoft support|tech(nical)? support|remote access|anydesk|teamviewer"#, weight: 25, flag: "Tech-support or remote-access request", category: .tech_support),
        Rule(pattern: #"you('ve| have)? won|lottery|sweepstakes|prize|claim your reward"#, weight: 25, flag: "Unexpected prize or winnings", category: .prize_lottery),
        Rule(pattern: #"package|parcel|delivery|redeliver|shipping fee|customs fee"#, weight: 10, flag: "Delivery or shipping problem", category: .delivery),
        Rule(pattern: #"verification code|one[- ]time (pass)?code|otp|read (me|back) the code"#, weight: 25, flag: "Asks for a verification code", category: .phishing_link),
        Rule(pattern: #"(verify|confirm|update) your (account|identity|information|payment)"#, weight: 20, flag: "Asks you to verify personal or payment details", category: .phishing_link),
        Rule(pattern: #"guaranteed (returns?|profit)|double your money|investment opportunity"#, weight: 25, flag: "Promises guaranteed returns", category: .investment_crypto),
        Rule(pattern: #"work from home|easy money"#, weight: 15, flag: "Too-good-to-be-true job offer", category: .job_offer),
        Rule(pattern: #"my (love|darling|dear)|soul ?mate|stuck overseas|military deployment"#, weight: 15, flag: "Romance or overseas-stranger story", category: .romance),
    ]

    static func screen(_ text: String, linkSignals: [String]) -> Triage {
        var score = 0
        var flags: [String] = []
        var catScore: [Category: Int] = [:]
        for r in rules where text.range(of: r.pattern, options: [.regularExpression, .caseInsensitive]) != nil {
            score += r.weight
            flags.append(r.flag)
            if let c = r.category { catScore[c, default: 0] += r.weight }
        }
        if !linkSignals.isEmpty {
            score += min(30, linkSignals.count * 12)
            flags.append(contentsOf: linkSignals.prefix(2))
            catScore[.phishing_link, default: 0] += 15
        }
        score = min(100, score)
        let category = catScore.max(by: { $0.value < $1.value })?.key ?? (score > 0 ? .other : .none)
        return Triage(
            riskScore: score,
            verdict: Verdict.from(score: score),
            category: category,
            confidence: "low",
            redFlags: Array(flags.prefix(6)),
            summary: flags.isEmpty ? "No common scam warning signs found." : "Found \(flags.count) common scam warning sign(s)."
        )
    }
}

/// First-pass screen result, from Apple's on-device model, Gemini, or the rules.
struct Triage: Codable, Hashable {
    var riskScore: Int
    var verdict: Verdict
    var category: Category
    var confidence: String
    var redFlags: [String]
    var summary: String
}
