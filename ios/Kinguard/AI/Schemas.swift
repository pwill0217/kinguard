// Structured outputs. Each @Generable type is used unchanged with BOTH Apple's on-device
// SystemLanguageModel and Gemini (Firebase AI Logic's GeminiLanguageModel), because both
// plug into Apple's Foundation Models LanguageModelSession.
import FoundationModels

@Generable
enum VerdictChoice {
    case safe, suspicious, likelyScam

    var verdict: Verdict {
        switch self {
        case .safe: .safe
        case .suspicious: .suspicious
        case .likelyScam: .likely_scam
        }
    }
}

@Generable
enum CategoryChoice {
    case none, governmentImpersonation, bankOrCompanyImpersonation, techSupport, familyEmergency, romance,
         prizeOrLottery, delivery, jobOffer, investmentOrCrypto, phishingLink, fakeBillOrPayment, other

    var category: Category {
        switch self {
        case .none: .none
        case .governmentImpersonation: .impersonation_government
        case .bankOrCompanyImpersonation: .impersonation_bank
        case .techSupport: .tech_support
        case .familyEmergency: .family_emergency
        case .romance: .romance
        case .prizeOrLottery: .prize_lottery
        case .delivery: .delivery
        case .jobOffer: .job_offer
        case .investmentOrCrypto: .investment_crypto
        case .phishingLink: .phishing_link
        case .fakeBillOrPayment: .invoice_payment
        case .other: .other
        }
    }
}

@Generable
enum ConfidenceChoice {
    case low, medium, high
}

@Generable(description: "A quick scam-risk screen of a message")
struct TriageOutput {
    @Guide(description: "0 means clearly safe, 100 means certainly a scam", .range(0...100))
    var riskScore: Int
    var verdict: VerdictChoice
    var category: CategoryChoice
    var confidence: ConfidenceChoice
    @Guide(description: "Up to 5 short warning signs in plain words. Empty if the message is safe.")
    var redFlags: [String]
    @Guide(description: "One plain, calm sentence written for an older adult")
    var summary: String
}

@Generable
enum PiiKindChoice {
    case personName, streetAddress, dateOfBirth, accountOrMemberNumber, idNumber
}

@Generable
struct PiiItem {
    @Guide(description: "The exact characters as they appear in the message")
    var text: String
    var kind: PiiKindChoice
}

@Generable(description: "Personal details found in a message")
struct PiiOutput {
    var items: [PiiItem]
}

@Generable
struct RedFlagItem {
    @Guide(description: "The warning sign, in a few plain words")
    var signal: String
    @Guide(description: "Why it matters, in one short sentence")
    var why: String
}

@Generable(description: "An expert scam assessment with clear next steps for an older adult")
struct DeepOutput {
    @Guide(description: "0 means clearly safe, 100 means certainly a scam", .range(0...100))
    var riskScore: Int
    var verdict: VerdictChoice
    var category: CategoryChoice
    @Guide(description: "At most 10 words, for example: This is a fake Amazon message")
    var headline: String
    @Guide(description: "2 or 3 short sentences at a 6th-grade reading level")
    var explanation: String
    var redFlags: [RedFlagItem]
    @Guide(description: "3 to 5 concrete next steps, each one short sentence")
    var whatToDo: [String]
    @Guide(description: "How to check independently without using any phone number, link or email from the message")
    var howToVerify: String
}
