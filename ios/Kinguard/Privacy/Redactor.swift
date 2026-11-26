// On-device PII redaction + re-hydration (Swift port of web/src/local/redact.ts).
// Anything that leaves the device passes through here first.
import Foundation

enum PiiKind: String, Codable, CaseIterable {
    case EMAIL, PHONE, CARD, SSN, ACCOUNT, PERSON, ADDRESS, ID, DOB, OTHER

    var label: String {
        switch self {
        case .EMAIL: "email address"
        case .PHONE: "phone number"
        case .CARD: "card number"
        case .SSN: "Social Security number"
        case .ACCOUNT: "account or code number"
        case .PERSON: "name"
        case .ADDRESS: "address"
        case .ID: "ID number"
        case .DOB: "date of birth"
        case .OTHER: "personal detail"
        }
    }
}

struct Redaction {
    let text: String
    /// placeholder ("[PHONE_1]") -> original value. Never leaves the device.
    let map: [String: String]
    let counts: [PiiKind: Int]
}

private func regex(_ pattern: String, _ options: NSRegularExpression.Options = []) -> NSRegularExpression {
    // Patterns are compile-time constants; a failure here is a programming error.
    try! NSRegularExpression(pattern: pattern, options: options)
}

private enum Patterns {
    nonisolated(unsafe) static let email = regex(#"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"#, [.caseInsensitive])
    nonisolated(unsafe) static let ssn = regex(#"\b\d{3}-\d{2}-\d{4}\b"#)
    nonisolated(unsafe) static let card = regex(#"\b(?:\d[ -]?){12,18}\d\b"#)
    nonisolated(unsafe) static let phone = regex(#"(?<![\w$])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{3,4}(?!\w)"#)
    nonisolated(unsafe) static let account = regex(#"(?<![$\d.,])\b\d{6,}\b(?![.,]\d)"#)
    nonisolated(unsafe) static let urlQuery = regex(#"(https?://[^\s?#]+)\?[^\s#]+"#, [.caseInsensitive])
    nonisolated(unsafe) static let placeholder = regex(#"\[([A-Z]+_\d+)\]"#)
}

/// Brands and common words a small model sometimes flags; they are scam signals and must stay readable.
private let commonWords: Set<String> = [
    "irs", "social security", "medicare", "amazon", "apple", "microsoft", "paypal", "bank", "police",
    "fbi", "usps", "fedex", "ups", "dhl", "walmart", "google", "netflix", "grandma", "grandpa", "mom", "dad",
    "customer", "sir", "madam", "dear",
]

private func luhnValid(_ digits: String) -> Bool {
    var sum = 0
    var double = false
    for ch in digits.reversed() {
        guard var d = ch.wholeNumberValue else { return false }
        if double {
            d *= 2
            if d > 9 { d -= 9 }
        }
        sum += d
        double.toggle()
    }
    return sum % 10 == 0
}

/// Replace every match of `re` in `text` using `transform` (return nil to keep the match).
private func replaceMatches(_ re: NSRegularExpression, in text: String, _ transform: (String, NSTextCheckingResult) -> String?) -> String {
    let ns = text as NSString
    var result = ""
    var last = 0
    for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
        result += ns.substring(with: NSRange(location: last, length: m.range.location - last))
        let matched = ns.substring(with: m.range)
        result += transform(matched, m) ?? matched
        last = m.range.location + m.range.length
    }
    result += ns.substring(from: last)
    return result
}

final class Redactor {
    private(set) var map: [String: String] = [:]
    private var reverse: [String: String] = [:]
    private(set) var counts: [PiiKind: Int] = [:]

    func placeholder(_ kind: PiiKind, _ value: String) -> String {
        let key = "\(kind.rawValue):\(value.lowercased())"
        if let existing = reverse[key] { return existing }
        let n = (counts[kind] ?? 0) + 1
        counts[kind] = n
        let ph = "[\(kind.rawValue)_\(n)]"
        map[ph] = value
        reverse[key] = ph
        return ph
    }

    /// Regex pass: URL query strings, emails, SSNs, Luhn-valid cards, phones, long numbers.
    func redactPatterns(_ input: String) -> String {
        var text = replaceMatches(Patterns.urlQuery, in: input) { _, m in
            let base = (input as NSString).substring(with: m.range(at: 1))
            return "\(base)?[link details removed]"
        }
        text = replaceMatches(Patterns.email, in: text) { s, _ in self.placeholder(.EMAIL, s) }
        text = replaceMatches(Patterns.ssn, in: text) { s, _ in self.placeholder(.SSN, s) }
        text = replaceMatches(Patterns.card, in: text) { s, _ in
            let digits = s.filter(\.isNumber)
            return digits.count >= 13 && luhnValid(digits) ? self.placeholder(.CARD, s) : nil
        }
        text = replaceMatches(Patterns.phone, in: text) { s, _ in
            let digits = s.filter(\.isNumber).count
            return (7...15).contains(digits) ? self.placeholder(.PHONE, s.trimmingCharacters(in: .whitespaces)) : nil
        }
        text = replaceMatches(Patterns.account, in: text) { s, _ in self.placeholder(.ACCOUNT, s) }
        return text
    }

    /// Apply spans found by the on-device model. Spans the model invented (not in the text) are ignored.
    func redactSpans(_ text: String, _ spans: [(text: String, kind: PiiKind)]) -> String {
        let usable = spans
            .map { (text: $0.text.trimmingCharacters(in: .whitespacesAndNewlines), kind: $0.kind) }
            .filter { $0.text.count >= 3 && text.contains($0.text) && !commonWords.contains($0.text.lowercased()) && !$0.text.hasPrefix("[") }
            .sorted { $0.text.count > $1.text.count } // longest first
        var out = text
        for span in usable {
            let ph = placeholder(span.kind, span.text)
            out = out.replacingOccurrences(of: span.text, with: ph)
        }
        return out
    }

    func result(_ text: String) -> Redaction {
        Redaction(text: text, map: map, counts: counts)
    }
}

enum Rehydrate {
    /// Put the user's real details back into cloud output, on the device, for display only.
    static func text(_ s: String, _ map: [String: String]) -> String {
        replaceMatches(Patterns.placeholder, in: s) { matched, _ in map[matched] }
    }
}

func describeCounts(_ counts: [PiiKind: Int]) -> String {
    let parts = PiiKind.allCases.compactMap { kind -> String? in
        guard let n = counts[kind], n > 0 else { return nil }
        return "\(n) \(kind.label)\(n > 1 ? "s" : "")"
    }
    return parts.isEmpty ? "nothing personal found" : parts.joined(separator: ", ")
}
