// Kinguard design system for iOS (matches the web app).
import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

enum KG {
    static let brand = Color(hex: 0x6D4AFF)
    static let brandDeep = Color(hex: 0x4524D6)
    static let brandSoft = Color(hex: 0xF2EEFF)
    static let bg = Color(hex: 0xF4F2FB)
    static let ink = Color(hex: 0x17142E)
    static let muted = Color(hex: 0x6D6987)
    static let line = Color(hex: 0xEBE7F5)
    static let safe = Color(hex: 0x12A150)
    static let warn = Color(hex: 0xF59E0B)
    static let bad = Color(hex: 0xE23B3F)
    static let cloud = Color(hex: 0x2F6BFF)
    static let deviceGreen = Color(hex: 0x0D7A3C)

    static let grad = LinearGradient(colors: [Color(hex: 0x8B6DFF), Color(hex: 0x6340FB), Color(hex: 0x4120D4)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing)
    static let alertGrad = LinearGradient(colors: [Color(hex: 0xFF7A59), Color(hex: 0xE23B3F), Color(hex: 0xB4232B)],
                                          startPoint: .topLeading, endPoint: .bottomTrailing)

    static func color(_ v: Verdict) -> Color {
        switch v {
        case .safe: safe
        case .suspicious: warn
        case .likely_scam: bad
        }
    }

    static func icon(_ v: Verdict) -> String {
        switch v {
        case .safe: "checkmark.circle.fill"
        case .suspicious: "exclamationmark.triangle.fill"
        case .likely_scam: "xmark.octagon.fill"
        }
    }
}

struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: KG.brandDeep.opacity(0.08), radius: 16, y: 8)
    }
}

extension View {
    func card() -> some View { modifier(CardModifier()) }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(KG.grad, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: KG.brand.opacity(0.35), radius: 12, y: 6)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct SoftButtonStyle: ButtonStyle {
    var tint: Color = KG.brandDeep
    var fill: Color = KG.brandSoft
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .foregroundStyle(tint)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct Avatar: View {
    let name: String
    let url: URL?
    var size: CGFloat = 44
    var ring: Verdict?

    private static let palette: [Color] = [Color(hex: 0x6D4AFF), Color(hex: 0xEF5DA8), Color(hex: 0x14B8A6), Color(hex: 0xF59E0B),
                                           Color(hex: 0x3B82F6), Color(hex: 0x8B5CF6), Color(hex: 0x10B981), Color(hex: 0xF43F5E)]

    private var initials: String {
        name.split(separator: " ").prefix(2).compactMap { $0.first.map { String($0).uppercased() } }.joined()
    }

    private var color: Color {
        let h = name.unicodeScalars.reduce(UInt32(0)) { ($0 &* 31) &+ $1.value }
        return Self.palette[Int(h % UInt32(Self.palette.count))]
    }

    var body: some View {
        ZStack {
            Circle().fill(color)
            Text(initials.isEmpty ? "?" : initials)
                .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            if let url {
                AsyncImage(url: url) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
                .clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
        .overlay {
            if let ring {
                Circle().stroke(KG.color(ring), lineWidth: 3).padding(-5)
            }
        }
    }
}

struct WhereBadge: View {
    let place: Where
    var body: some View {
        let (fg, bg): (Color, Color) = switch place {
        case .device: (KG.deviceGreen, Color(hex: 0xE1F7EA))
        case .cloud: (KG.cloud, Color(hex: 0xE9F0FF))
        case .rules: (Color(hex: 0x4B4763), Color(hex: 0xEFEDF5))
        }
        Label(place.label, systemImage: place == .device ? "iphone" : place == .cloud ? "cloud" : "list.bullet")
            .font(.caption.weight(.bold))
            .foregroundStyle(fg)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(bg, in: Capsule())
    }
}

struct DevicePill: View {
    let status: DeviceAI
    var body: some View {
        let available = status == .available
        Label(status.label, systemImage: available ? "cpu" : "cloud")
            .font(.caption.weight(.heavy))
            .foregroundStyle(available ? KG.deviceGreen : KG.cloud)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(available ? Color(hex: 0xE1F7EA) : Color(hex: 0xE9F0FF), in: Capsule())
    }
}

struct RiskMeter: View {
    let score: Int
    var body: some View {
        VStack(spacing: 6) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(LinearGradient(colors: [Color(hex: 0x34D399), Color(hex: 0xFBBF24), Color(hex: 0xF87171)],
                                                  startPoint: .leading, endPoint: .trailing))
                        .frame(height: 10)
                    Circle()
                        .fill(.white)
                        .overlay(Circle().stroke(KG.ink, lineWidth: 4))
                        .frame(width: 22, height: 22)
                        .offset(x: max(0, min(geo.size.width - 22, geo.size.width * CGFloat(score) / 100 - 11)))
                }
                .frame(height: 22)
            }
            .frame(height: 22)
            HStack {
                Text("Safe")
                Spacer()
                Text("Risk \(score)/100").bold().foregroundStyle(KG.ink)
                Spacer()
                Text("Scam")
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(KG.muted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Scam risk \(score) out of 100")
    }
}

func timeAgo(_ date: Date?) -> String {
    guard let date else { return "just now" }
    let s = max(0, Date().timeIntervalSince(date))
    if s < 60 { return "just now" }
    if s < 3600 { return "\(Int(s / 60))m ago" }
    if s < 86400 { return "\(Int(s / 3600))h ago" }
    if s < 7 * 86400 { return "\(Int(s / 86400))d ago" }
    return date.formatted(date: .abbreviated, time: .omitted)
}
