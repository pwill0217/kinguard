// App state: the AI engine, the current check, and on-device history.
import AVFoundation
import Foundation
import Observation
import UIKit

@MainActor
@Observable
final class AppModel {
    var policy = Policy()
    let engine = AIEngine(policy: Policy())
    var deviceAI: DeviceAI = .notEligible
    var history: [CheckResult] = []

    var stage: Stage?
    var result: CheckResult?
    var errorMessage: String?
    var deepBusy = false
    var alertState: [UUID: String] = [:] // "sending" | "sent"

    init() {
        history = Self.loadHistory()
        refreshDeviceAI()
    }

    func bootstrap() async {
        policy = await Policy.load()
        engine.policy = policy
        refreshDeviceAI()
    }

    func refreshDeviceAI() {
        deviceAI = engine.deviceAI
    }

    func check(text: String, image: UIImage?, family: FamilyStore) async {
        errorMessage = nil
        refreshDeviceAI()
        do {
            let r = try await Pipeline.run(.init(text: text, image: image), engine: engine, online: true) { stage = $0 }
            stage = nil
            finish(r, family: family)
        } catch {
            stage = nil
            errorMessage = error.localizedDescription
        }
    }

    func runDeepCheck(family: FamilyStore) async {
        guard let prev = result else { return }
        deepBusy = true
        defer { deepBusy = false }
        do {
            finish(try await Pipeline.completeDeep(prev, engine: engine), family: family)
        } catch {
            errorMessage = "The double-check couldn't run: \(AIEngine.short(error))"
        }
    }

    private func finish(_ r: CheckResult, family: FamilyStore) {
        result = r
        history.removeAll { $0.id == r.id }
        history.insert(r, at: 0)
        history = Array(history.prefix(50))
        saveHistory()
        Task {
            if await family.share(r, alertThreshold: policy.familyAlertThreshold) { alertState[r.id] = "sent" }
        }
    }

    func tellFamily(_ r: CheckResult, family: FamilyStore) async {
        alertState[r.id] = "sending"
        let ok = await family.share(r, alertThreshold: policy.familyAlertThreshold, force: true)
        alertState[r.id] = ok ? "sent" : nil
        if !ok { errorMessage = "Create or join a family circle first, then try again." }
    }

    func clearHistory() {
        history = []
        saveHistory()
    }

    // MARK: - History stays on this device

    private static var historyURL: URL {
        URL.documentsDirectory.appending(path: "kinguard-history.json")
    }

    private static func loadHistory() -> [CheckResult] {
        guard let data = try? Data(contentsOf: historyURL) else { return [] }
        return (try? JSONDecoder().decode([CheckResult].self, from: data)) ?? []
    }

    private func saveHistory() {
        if let data = try? JSONEncoder().encode(history) {
            try? data.write(to: Self.historyURL, options: [.atomic, .completeFileProtection])
        }
    }
}

/// "Read this to me" with Apple's on-device voices.
@MainActor
@Observable
final class Speaker: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = Speaker()
    private let synth = AVSpeechSynthesizer()
    var speaking = false

    override init() {
        super.init()
        synth.delegate = self
    }

    func toggle(_ text: String) {
        if speaking {
            synth.stopSpeaking(at: .immediate)
            speaking = false
            return
        }
        let u = AVSpeechUtterance(string: text)
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.92
        u.voice = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language == "en-US" }
            .max { $0.quality.rawValue < $1.quality.rawValue } ?? AVSpeechSynthesisVoice(language: "en-US")
        synth.speak(u)
        speaking = true
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }
}
