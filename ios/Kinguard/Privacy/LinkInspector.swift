// On-device link inspection (Swift port of web/src/local/links.ts).
import Foundation

struct LinkFinding: Codable, Hashable {
    let host: String
    let signals: [String]
}

enum LinkInspector {
    private static let urlish = try! NSRegularExpression(
        pattern: #"\b((?:https?://)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:/[^\s<>"')\]]*)?)"#,
        options: [.caseInsensitive]
    )
    private static let shorteners: Set<String> = [
        "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "rb.gy",
        "shorturl.at", "t.ly", "tiny.cc",
    ]
    private static let riskyTLDs: Set<String> = [
        "top", "xyz", "click", "zip", "mov", "loan", "work", "support", "live", "rest", "cam", "icu", "buzz",
        "monster", "gq", "tk", "ml", "cf", "ga", "cfd", "sbs", "info",
    ]
    private static let brands: [String: [String]] = [
        "amazon": ["amazon.com", "amazon.co.uk", "amazon.ca"], "paypal": ["paypal.com"],
        "apple": ["apple.com", "icloud.com"], "microsoft": ["microsoft.com", "live.com", "outlook.com"],
        "netflix": ["netflix.com"], "usps": ["usps.com"], "fedex": ["fedex.com"], "ups": ["ups.com"],
        "irs": ["irs.gov"], "ssa": ["ssa.gov"], "medicare": ["medicare.gov"], "chase": ["chase.com"],
        "wellsfargo": ["wellsfargo.com"], "bankofamerica": ["bankofamerica.com"], "google": ["google.com"],
        "facebook": ["facebook.com"], "walmart": ["walmart.com"], "coinbase": ["coinbase.com"],
    ]
    private static let leet: [Character: Character] = ["0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a"]

    static func registrable(_ host: String) -> String {
        let parts = host.split(separator: ".").map(String.init)
        guard parts.count >= 2 else { return host }
        let lastTwo = parts.suffix(2).joined(separator: ".")
        let twoLevel = lastTwo.range(of: #"^(co|com|org|gov|ac|net)\.[a-z]{2}$"#, options: .regularExpression) != nil
        return parts.suffix(twoLevel ? 3 : 2).joined(separator: ".")
    }

    static func inspect(_ text: String) -> [LinkFinding] {
        let ns = text as NSString
        var seen = Set<String>()
        var out: [LinkFinding] = []
        for m in urlish.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            var raw = ns.substring(with: m.range(at: 1))
            while let last = raw.last, ".,;:!?".contains(last) { raw.removeLast() }
            // Skip email domains.
            if m.range.location > 0, ns.substring(with: NSRange(location: m.range.location - 1, length: 1)) == "@" { continue }
            let withScheme = raw.lowercased().hasPrefix("http") ? raw : "https://\(raw)"
            guard let host = URL(string: withScheme)?.host?.lowercased(),
                  host.range(of: #"\.[a-z]{2,}$"#, options: .regularExpression) != nil,
                  !seen.contains(host) else { continue }
            seen.insert(host)
            out.append(LinkFinding(host: host, signals: signals(raw: raw, host: host)))
        }
        return out
    }

    static func signals(raw: String, host: String) -> [String] {
        var s: [String] = []
        let reg = registrable(host)
        let tld = host.split(separator: ".").last.map(String.init) ?? ""
        if raw.lowercased().hasPrefix("http://") { s.append("Not a secure (https) link") }
        if host.range(of: #"^\d+\.\d+\.\d+\.\d+$"#, options: .regularExpression) != nil {
            s.append("Link goes to a bare number address instead of a company website")
        }
        if host.contains("xn--") { s.append("Link uses look-alike foreign letters (punycode)") }
        if shorteners.contains(reg) { s.append("Shortened link hides where it really goes") }
        if riskyTLDs.contains(tld) { s.append("Website ending \".\(tld)\" is commonly used by scam sites") }
        if raw.contains("@") { s.append("Link contains an \"@\" that can hide the real destination") }
        if host.filter({ $0 == "-" }).count >= 2 { s.append("Website name has many hyphens, common in fake sites") }
        if host.split(separator: ".").count >= 5 { s.append("Unusually long chain of sub-domains") }

        let normalized = String(reg.map { leet[$0] ?? $0 }).replacingOccurrences(of: "-", with: "")
        let hostNoHyphen = host.replacingOccurrences(of: "-", with: "")
        for (brand, real) in brands.sorted(by: { $0.key < $1.key }) {
            if real.contains(reg) { return s } // genuine brand domain
            if hostNoHyphen.contains(brand) || normalized.contains(brand) {
                s.append("Mentions \"\(brand)\" but is not \(brand)'s real website (\(real[0]))")
                break
            }
        }
        return s
    }
}
