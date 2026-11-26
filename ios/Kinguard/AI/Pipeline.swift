// The hybrid pipeline (same design as the web app):
// read (device) -> redact (device) -> first pass (device, cloud fallback) -> route by Remote Config
// -> deep check (cloud, redacted only) -> re-hydrate (device).
import Foundation
import UIKit

struct LedgerEntry: Codable, Hashable, Identifiable {
    var id = UUID()
    var step: String
    var place: Where
    /// Exactly what was sent to the cloud, if anything.
    var sent: String?
    var note: String?
    var seconds: Double?
}

struct FinalVerdict: Codable, Hashable {
    var riskScore: Int
    var verdict: Verdict
    var category: Category
    var headline: String
    var explanation: String
    var redFlags: [FlagLine]
    var whatToDo: [String]
    var howToVerify: String
}

/// The redacted verdict: the only form ever shared with the family circle.
struct Shareable: Codable, Hashable {
    var verdict: Verdict
    var riskScore: Int
    var category: Category
    var headline: String
    var explanation: String
}

enum DeepPending: String, Codable {
    case offline, belowThreshold, error
}

struct CheckResult: Codable, Hashable, Identifiable {
    var id = UUID()
    var createdAt = Date()
    var original: String
    var redacted: String
    var piiMap: [String: String]
    var piiSummary: String
    var hadImage: Bool
    var links: [LinkFinding]
    var triage: Triage
    var triageWhere: Where
    var deep: DeepCheck?
    var final: FinalVerdict
    var shareable: Shareable
    var deepPending: DeepPending?
    var ledger: [LedgerEntry]
}

enum Stage: String {
    case reading = "Reading your screenshot on this phone"
    case redacting = "Hiding your personal details"
    case screening = "Looking for scam warning signs"
    case deep = "Getting an expert double-check"
}

@MainActor
enum Pipeline {
    struct Input {
        var text: String
        var image: UIImage?
        var forceDeep = false
    }

    static func run(_ input: Input, engine: AIEngine, online: Bool, onStage: (Stage) -> Void) async throws -> CheckResult {
        var ledger: [LedgerEntry] = []
        let policy = engine.policy
        var text = input.text.trimmingCharacters(in: .whitespacesAndNewlines)

        // 1. Screenshots: Apple Vision, on-device. Always private, even without Apple Intelligence.
        if let image = input.image {
            onStage(.reading)
            let t0 = Date()
            let read = try await OCR.text(from: image)
            ledger.append(LedgerEntry(step: "Read your screenshot", place: .device, note: "Apple Vision text recognition. The image never left this phone.", seconds: Date().timeIntervalSince(t0)))
            text = [text, read].filter { !$0.isEmpty }.joined(separator: "\n\n")
        }
        guard !text.isEmpty else { throw PipelineError.nothingToCheck }
        let truncated = text.count > policy.maxInputChars
        if truncated { text = String(text.prefix(policy.maxInputChars)) }

        // 2. Hide personal details before anything can reach the cloud.
        onStage(.redacting)
        let t1 = Date()
        let redactor = Redactor()
        var redacted = redactor.redactPatterns(text)
        var piiNote = "Pattern check (phone numbers, emails, card and account numbers)."
        if engine.deviceAI == .available {
            do {
                let spans = try await engine.findPII(rawText: text)
                redacted = redactor.redactSpans(redacted, spans)
                piiNote = "Pattern check plus Apple's on-device model scanning for names and addresses."
            } catch {
                piiNote += " On-device name scan was unavailable this time."
            }
        }
        let redaction = redactor.result(redacted)
        let piiSummary = describeCounts(redaction.counts)
        ledger.append(LedgerEntry(step: "Hid personal details: \(piiSummary)", place: .device, note: piiNote, seconds: Date().timeIntervalSince(t1)))

        let links = LinkInspector.inspect(text)
        let linkSignals = links.flatMap { l in l.signals.map { "\(l.host): \($0)" } }
        if !links.isEmpty {
            ledger.append(LedgerEntry(step: "Checked \(links.count) link\(links.count > 1 ? "s" : "")", place: .device,
                                      note: linkSignals.isEmpty ? "No link warning signs." : "\(linkSignals.count) warning sign(s) found."))
        }

        // 3. First pass: Apple on-device, Gemini fallback, rules as a last resort.
        onStage(.screening)
        let t2 = Date()
        var triage: Triage
        var triageWhere: Where
        if engine.deviceAI == .available || online {
            do {
                let (t, place, reason) = try await engine.triage(redacted: redaction.text, linkSignals: linkSignals)
                triage = t
                triageWhere = place
                ledger.append(LedgerEntry(
                    step: "First-pass scam screen",
                    place: place,
                    sent: place == .cloud ? redaction.text : nil,
                    note: place == .device ? "Apple's on-device model. Free, private, works offline." : reason,
                    seconds: Date().timeIntervalSince(t2)
                ))
            } catch {
                triage = Rules.screen(text, linkSignals: links.flatMap(\.signals))
                triageWhere = .rules
                ledger.append(LedgerEntry(step: "First-pass scam screen", place: .rules, note: "AI unavailable (\(AIEngine.short(error))). Used built-in rules."))
            }
        } else {
            triage = Rules.screen(text, linkSignals: links.flatMap(\.signals))
            triageWhere = .rules
            ledger.append(LedgerEntry(step: "First-pass scam screen", place: .rules, note: "Offline with no on-device AI: used built-in rules."))
        }

        // 4. Route by policy (Remote Config).
        let wantsDeep = input.forceDeep
            || triage.riskScore >= policy.deepCheckThreshold
            || (policy.escalateLowConfidence && triage.confidence == "low" && triage.riskScore >= 15)
            || triageWhere == .rules
        var deep: DeepCheck?
        var pending: DeepPending?
        if wantsDeep && online {
            onStage(.deep)
            let t3 = Date()
            do {
                deep = try await engine.deepCheck(redacted: redaction.text, triage: triage, triageWhere: triageWhere, linkSignals: linkSignals)
                ledger.append(LedgerEntry(step: "Expert double-check", place: .cloud, sent: redaction.text,
                                          note: "Gemini via Firebase AI Logic. Escalated: first-pass risk \(triage.riskScore)/100 (threshold \(policy.deepCheckThreshold)).",
                                          seconds: Date().timeIntervalSince(t3)))
            } catch {
                pending = .error
                ledger.append(LedgerEntry(step: "Expert double-check", place: .cloud, note: "Couldn't reach the cloud (\(AIEngine.short(error)))."))
            }
        } else if wantsDeep {
            pending = .offline
            ledger.append(LedgerEntry(step: "Expert double-check", place: .cloud, note: "You're offline. You can run it when you reconnect."))
        } else {
            pending = .belowThreshold
        }

        return assemble(original: text, redaction: redaction, piiSummary: piiSummary, hadImage: input.image != nil,
                        links: links, triage: triage, triageWhere: triageWhere, deep: deep, pending: pending,
                        ledger: ledger, truncated: truncated)
    }

    /// Run a postponed or requested deep check on an existing result.
    static func completeDeep(_ prev: CheckResult, engine: AIEngine) async throws -> CheckResult {
        let linkSignals = prev.links.flatMap { l in l.signals.map { "\(l.host): \($0)" } }
        let t = Date()
        let deep = try await engine.deepCheck(redacted: prev.redacted, triage: prev.triage, triageWhere: prev.triageWhere, linkSignals: linkSignals)
        var ledger = prev.ledger.filter { !($0.step == "Expert double-check" && $0.sent == nil) }
        ledger.append(LedgerEntry(step: "Expert double-check", place: .cloud, sent: prev.redacted,
                                  note: "Gemini via Firebase AI Logic, requested after the first pass.", seconds: Date().timeIntervalSince(t)))
        var r = assemble(original: prev.original,
                         redaction: Redaction(text: prev.redacted, map: prev.piiMap, counts: [:]),
                         piiSummary: prev.piiSummary, hadImage: prev.hadImage, links: prev.links,
                         triage: prev.triage, triageWhere: prev.triageWhere, deep: deep, pending: nil, ledger: ledger, truncated: false)
        r.id = prev.id
        r.createdAt = prev.createdAt
        return r
    }

    private static let defaultSteps: [Verdict: [String]] = [
        .likely_scam: [
            "Do not reply, click links, or call any number in the message.",
            "Never pay with gift cards, wire transfers, or crypto.",
            "Do not share codes, passwords, or account numbers.",
            "Talk to someone you trust before doing anything.",
        ],
        .suspicious: [
            "Slow down. Real companies give you time.",
            "Do not use the links or phone numbers in the message.",
            "Contact the company using a number you already know.",
        ],
        .safe: ["No action needed. If anything feels off later, check again."],
    ]

    private static func assemble(original: String, redaction: Redaction, piiSummary: String, hadImage: Bool,
                                 links: [LinkFinding], triage: Triage, triageWhere: Where, deep: DeepCheck?,
                                 pending: DeepPending?, ledger: [LedgerEntry], truncated: Bool) -> CheckResult {
        var base: FinalVerdict
        if let d = deep {
            base = FinalVerdict(riskScore: d.riskScore, verdict: d.verdict, category: d.category, headline: d.headline,
                                explanation: d.explanation, redFlags: d.redFlags, whatToDo: d.whatToDo, howToVerify: d.howToVerify)
        } else {
            base = FinalVerdict(
                riskScore: triage.riskScore, verdict: triage.verdict, category: triage.category,
                headline: triage.verdict.headline, explanation: triage.summary,
                redFlags: triage.redFlags.map { FlagLine(signal: $0, why: "") },
                whatToDo: defaultSteps[triage.verdict] ?? [],
                howToVerify: triage.verdict == .safe ? "" : "Look up the official phone number or website yourself (on a bill, card, or the company's real site) and contact them directly."
            )
        }
        if base.whatToDo.isEmpty { base.whatToDo = defaultSteps[base.verdict] ?? [] }
        if truncated { base.explanation += " (Only the first part of a very long message was checked.)" }

        let map = redaction.map
        let shown = FinalVerdict(
            riskScore: base.riskScore, verdict: base.verdict, category: base.category,
            headline: Rehydrate.text(base.headline, map),
            explanation: Rehydrate.text(base.explanation, map),
            redFlags: base.redFlags.map { FlagLine(signal: Rehydrate.text($0.signal, map), why: Rehydrate.text($0.why, map)) },
            whatToDo: base.whatToDo.map { Rehydrate.text($0, map) },
            howToVerify: Rehydrate.text(base.howToVerify, map)
        )
        return CheckResult(
            original: original, redacted: redaction.text, piiMap: map, piiSummary: piiSummary, hadImage: hadImage,
            links: links, triage: triage, triageWhere: triageWhere, deep: deep, final: shown,
            shareable: Shareable(verdict: base.verdict, riskScore: base.riskScore, category: base.category,
                                 headline: base.headline, explanation: base.explanation),
            deepPending: pending, ledger: ledger
        )
    }
}

enum PipelineError: LocalizedError {
    case nothingToCheck
    var errorDescription: String? { "Paste a message or add a screenshot first." }
}
