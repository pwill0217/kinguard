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
