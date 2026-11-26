// Screenshots are read with Apple's on-device Vision text recognition, so the image never leaves the phone.
import UIKit
import Vision

enum OCR {
    enum Failure: LocalizedError {
        case unreadable
        var errorDescription: String? { "That picture couldn't be read. Try a clearer screenshot." }
    }

    static func text(from image: UIImage) async throws -> String {
        guard let cg = image.cgImage else { throw Failure.unreadable }
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let observations = try await request.perform(on: cg)
        let lines = observations.compactMap { $0.topCandidates(1).first?.string }
        return lines.joined(separator: "\n")
    }
}
