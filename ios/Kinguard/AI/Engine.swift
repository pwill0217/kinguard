// Kinguard's hybrid AI engine on iOS.
//
// Firebase AI Logic's GeminiLanguageModel and Apple's on-device SystemLanguageModel both conform
// to Foundation Models' LanguageModel protocol, so every step below runs the SAME
// LanguageModelSession code and the SAME @Generable output types. Only the model differs:
//
//   PII scan       Apple on-device ONLY        sees the raw text, so it must never go to the cloud
//   First pass     prefer Apple on-device      falls back to Gemini (cloud) on REDACTED text
//   Deep check     Gemini via Firebase ONLY    REDACTED text, only when Remote Config says so
import FirebaseAILogic
import Foundation
import FoundationModels

enum Where: String, Codable {
    case device, cloud, rules

    var label: String {
        switch self {
        case .device: "On this device"
        case .cloud: "Cloud"
        case .rules: "Built-in rules"
        }
    }
}

enum DeviceAI: Equatable {
    case available
    case notEnabled
    case notReady
    case notEligible

    var label: String {
        switch self {
        case .available: "On-device AI"
        case .notEnabled: "Turn on Apple Intelligence"
        case .notReady: "On-device AI downloading"
        case .notEligible: "Secure cloud"
        }
    }
}

struct DeepCheck: Codable, Hashable {
    var riskScore: Int
    var verdict: Verdict
    var category: Category
    var headline: String
    var explanation: String
    var redFlags: [FlagLine]
    var whatToDo: [String]
    var howToVerify: String
}

struct FlagLine: Codable, Hashable {
    var signal: String
    var why: String
}

@MainActor
final class AIEngine {
    private let ai = FirebaseAI.firebaseAI(backend: .googleAI())
    var policy: Policy

    init(policy: Policy) {
        self.policy = policy
    }

    var deviceAI: DeviceAI {
        switch SystemLanguageModel.default.availability {
        case .available:
            return .available
        case .unavailable(.appleIntelligenceNotEnabled):
            return .notEnabled
        case .unavailable(.modelNotReady):
            return .notReady
        case .unavailable:
            return .notEligible
        }
    }

    // MARK: - One generic call for every model

    private func generate<T: Generable & Sendable>(_ model: some LanguageModel, _ prompt: String, as type: T.Type) async throws -> T {
        // A fresh session per request keeps every call single-turn (no shared history).
        let session = LanguageModelSession(model: model)
        return try await session.respond(to: prompt, generating: type).content
    }

    /// Cloud call with a hard time limit, so a slow or overloaded model never leaves the UI spinning.
    private func cloud<T: Generable & Sendable>(_ name: String, _ prompt: String, as type: T.Type, within seconds: Double) async throws -> T {
        let work = Task { @MainActor in try await self.generate(self.gemini(name), prompt, as: type) }
        let box = Once()
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<T, Error>) in
            Task { @MainActor in
                do {
                    let value = try await work.value
                    if box.claim() { cont.resume(returning: value) }
                } catch {
                    if box.claim() { cont.resume(throwing: error) }
                }
            }
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(seconds))
                if box.claim() {
                    work.cancel()
                    cont.resume(throwing: AITimeout(model: name, seconds: Int(seconds)))
                }
            }
        }
    }

    private var onDevice: SystemLanguageModel { SystemLanguageModel.default }

    private func gemini(_ name: String) -> some LanguageModel {
        ai.geminiLanguageModel(name: name)
    }

    // MARK: - Steps

    /// Names, addresses, IDs in the RAW text. On-device only: this step never falls back to the cloud.
    func findPII(rawText: String) async throws -> [(text: String, kind: PiiKind)] {
        guard deviceAI == .available else { return [] }
        let out = try await generate(onDevice, Prompts.pii(rawText), as: PiiOutput.self)
        return out.items.map { item in
            let kind: PiiKind = switch item.kind {
            case .personName: .PERSON
            case .streetAddress: .ADDRESS
            case .dateOfBirth: .DOB
            case .accountOrMemberNumber: .ACCOUNT
            case .idNumber: .ID
            }
            return (item.text, kind)
        }
    }

    /// First-pass screen on REDACTED text: Apple on-device first, Gemini in the cloud as the fallback.
    func triage(redacted: String, linkSignals: [String]) async throws -> (Triage, Where, String?) {
        let prompt = Prompts.triage(redacted, linkSignals: linkSignals)
        var fallbackReason: String?
        if deviceAI == .available {
            do {
                return (Self.triage(from: try await generate(onDevice, prompt, as: TriageOutput.self)), .device, nil)
            } catch {
                fallbackReason = "On-device model couldn't answer (\(Self.short(error))), so the redacted text was screened in the cloud."
            }
        } else {
            fallbackReason = "On-device AI isn't available here (\(deviceAI.label.lowercased())), so the redacted text was screened in the cloud."
        }
        let out = try await cloud(policy.hybridCloudModel, prompt, as: TriageOutput.self, within: 20)
        return (Self.triage(from: out), .cloud, fallbackReason)
    }

    /// Expert double-check: Gemini via Firebase AI Logic, REDACTED text only.
    /// Retries once on overload, then switches to the Remote Config fallback model.
    func deepCheck(redacted: String, triage: Triage, triageWhere: Where, linkSignals: [String]) async throws -> DeepCheck {
        let prompt = Prompts.deep(redacted, triage: triage, triageWhere: triageWhere, linkSignals: linkSignals)
        // Primary model gets one quick retry on overload; a timeout skips straight to the lighter fallback.
        let attempts: [(name: String, limit: Double)] = [
            (policy.deepCheckModel, 25), (policy.deepCheckModel, 20), (policy.deepCheckFallbackModel, 20),
        ]
        var lastError: Error?
        var i = 0
        while i < attempts.count {
            let a = attempts[i]
            do {
                return Self.deep(from: try await cloud(a.name, prompt, as: DeepOutput.self, within: a.limit))
            } catch is AITimeout where i < 2 {
                lastError = AITimeout(model: a.name, seconds: Int(a.limit))
                i = 2
                continue
            } catch {
                lastError = error
                if i == 0 { try? await Task.sleep(for: .milliseconds(1200)) }
            }
            i += 1
        }
        throw lastError ?? URLError(.unknown)
    }

    // MARK: - Mapping

    private static func triage(from o: TriageOutput) -> Triage {
        let score = max(0, min(100, o.riskScore))
        return Triage(
            riskScore: score,
            verdict: consistent(o.verdict.verdict, score),
            category: score < 20 ? .none : o.category.category,
            confidence: "\(o.confidence)",
            redFlags: Array(o.redFlags.filter { !$0.isEmpty }.prefix(5)),
            summary: o.summary
        )
    }

    private static func deep(from o: DeepOutput) -> DeepCheck {
        let score = max(0, min(100, o.riskScore))
        return DeepCheck(
            riskScore: score,
            verdict: consistent(o.verdict.verdict, score),
            category: score < 20 ? .none : o.category.category,
            headline: o.headline,
            explanation: o.explanation,
            redFlags: o.redFlags.prefix(6).map { FlagLine(signal: $0.signal, why: $0.why) },
            whatToDo: Array(o.whatToDo.prefix(5)),
            howToVerify: o.howToVerify
        )
    }

    /// Small models sometimes disagree with themselves; keep the verdict consistent with the score.
    private static func consistent(_ v: Verdict, _ score: Int) -> Verdict {
        let rank: [Verdict: Int] = [.safe: 0, .suspicious: 1, .likely_scam: 2]
        let fromScore = Verdict.from(score: score)
        return abs(rank[v]! - rank[fromScore]!) > 1 ? fromScore : v
    }

    static func short(_ error: Error) -> String {
        let s = error.localizedDescription
        return s.count > 90 ? String(s.prefix(90)) + "…" : s
    }
}


struct AITimeout: LocalizedError {
    let model: String
    let seconds: Int
    var errorDescription: String? { "\(model) didn't answer within \(seconds)s" }
}

/// Lets exactly one of two racing tasks resume a continuation.
@MainActor
final class Once {
    private var done = false
    func claim() -> Bool {
        if done { return false }
        done = true
        return true
    }
}
