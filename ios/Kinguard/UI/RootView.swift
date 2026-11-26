import SwiftUI

enum AppTab: Hashable { case circle, check, activity, settings }

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(FamilyStore.self) private var family
    @State private var tab: AppTab = .circle

    private var unread: Int {
        guard let me = family.me else { return 0 }
        let weekAgo = Date().addingTimeInterval(-7 * 86400)
        return family.alerts.filter { $0.fromUid != me.uid && $0.verdict != .safe && $0.ackBy.isEmpty && ($0.createdAt ?? Date()) > weekAgo }.count
    }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                CircleTab(onCheck: { tab = .check })
            }
            .tabItem { Label(family.circle == nil ? "Home" : "Circle", systemImage: "person.3.fill") }
            .badge(unread)
            .tag(AppTab.circle)

            NavigationStack {
                CheckTab()
            }
            .tabItem { Label("Check", systemImage: "checkmark.shield.fill") }
            .tag(AppTab.check)

            NavigationStack {
                ActivityTab()
            }
            .tabItem { Label("Activity", systemImage: "clock.fill") }
            .tag(AppTab.activity)

            NavigationStack {
                SettingsTab()
            }
            .tabItem { Label("Settings", systemImage: "gearshape.fill") }
            .tag(AppTab.settings)
        }
        .tint(KG.brand)
        // Kinguard's palette is designed for light backgrounds; keep it readable in Dark Mode.
        .preferredColorScheme(.light)
        .overlay(alignment: .top) {
            if let alert = family.incoming {
                IncomingAlertBanner(alert: alert) {
                    tab = .circle
                    family.dismissIncoming()
                }
                .padding(.horizontal)
                .transition(.move(edge: .top).combined(with: .opacity))
                .task(id: alert.id) {
                    try? await Task.sleep(for: .seconds(8))
                    family.dismissIncoming(alert.id)
                }
            }
        }
        .animation(.spring(duration: 0.35), value: family.incoming?.id)
        .onChange(of: family.me?.uid) { _, _ in
            // "Family told" belongs to whoever sent it; reset when the account changes.
            model.alertState = [:]
        }
    }
}

struct IncomingAlertBanner: View {
    let alert: FamilyAlert
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: "bell.badge.fill").font(.title3).foregroundStyle(.white)
                    .frame(width: 42, height: 42).background(.white.opacity(0.2), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(alert.fromName) may have received a scam").font(.subheadline.weight(.heavy))
                    Text("\(alert.headline) · risk \(alert.riskScore)").font(.caption).opacity(0.9).lineLimit(2)
                }
                Spacer(minLength: 0)
                Text("View").font(.caption.weight(.heavy)).padding(.horizontal, 10).padding(.vertical, 6)
                    .background(.white.opacity(0.22), in: Capsule())
            }
            .foregroundStyle(.white)
            .padding(14)
            .background(KG.alertGrad, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: KG.bad.opacity(0.35), radius: 16, y: 8)
        }
        .buttonStyle(.plain)
    }
}

/// Shared top-bar content: circle name or logo, plus the on-device AI status.
struct TopBar: ToolbarContent {
    let title: String
    let status: DeviceAI

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.shield.fill")
                    .foregroundStyle(.white)
                    .padding(7)
                    .background(KG.grad, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(title).font(.headline.weight(.heavy)).foregroundStyle(KG.ink).lineLimit(1)
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            DevicePill(status: status)
        }
    }
}
