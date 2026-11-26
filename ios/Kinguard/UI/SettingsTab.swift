import SwiftUI

struct SettingsTab: View {
    @Environment(AppModel.self) private var model
    @Environment(FamilyStore.self) private var family
    @State private var error: String?

    var body: some View {
        List {
            Section("Account") {
                if let me = family.me {
                    HStack(spacing: 12) {
                        Avatar(name: me.name, url: me.photoURL, size: 48)
                        VStack(alignment: .leading) {
                            Text(me.name).font(.headline)
                            Text(me.email ?? "").font(.caption).foregroundStyle(KG.muted)
                        }
                        Spacer()
                        Button("Sign out") { family.signOut() }.font(.subheadline.weight(.bold))
                    }
                } else {
                    Button {
                        Task {
                            do { try await family.signInWithGoogle() } catch { self.error = error.localizedDescription }
                        }
                    } label: {
                        Label("Sign in with Google", systemImage: "person.crop.circle.badge.plus")
                    }
                    Text("Sign in to create or join a family circle. Checking messages never needs an account.")
                        .font(.caption).foregroundStyle(KG.muted)
                }
                if let error { Text(error).font(.caption).foregroundStyle(KG.bad) }
            }

            Section("Private on-device AI") {
                HStack {
                    DevicePill(status: model.deviceAI)
                    Spacer()
                    Button("Refresh") { model.refreshDeviceAI() }.font(.subheadline)
                }
                switch model.deviceAI {
                case .available:
                    Text("Apple's on-device model is ready. Most checks never leave this phone.").font(.footnote)
                case .notEnabled:
                    Text("Turn on Apple Intelligence in the Settings app to check messages privately on this phone. Until then, Kinguard hides your details and uses the secure cloud.").font(.footnote)
                case .notReady:
                    Text("Apple's on-device model is still downloading. Keep the phone on Wi-Fi and charging.").font(.footnote)
                case .notEligible:
                    Text("This phone can't run Apple's on-device model, so Kinguard hides your details and uses the secure cloud.").font(.footnote)
                }
            }

            Section("How Kinguard protects you") {
                HowRow(place: .device, text: "Screenshots are read on this phone. Names, numbers, emails and codes are hidden before anything leaves it.")
                HowRow(place: .device, text: "Apple's on-device model does a fast, free, private scam screen.")
                HowRow(place: .cloud, text: "If the risk is \(model.policy.deepCheckThreshold)+, Gemini (via Firebase AI Logic) double-checks the hidden-details version.")
                HowRow(place: .device, text: "Your details are put back on your screen only.")
                HowRow(place: .cloud, text: "For high-risk messages (\(model.policy.familyAlertThreshold)+), your circle gets the warning, never the message.")
            }

            Section {
                Text("Built with Firebase AI Logic (Gemini) and Apple Foundation Models, App Check, Remote Config, Authentication and Cloud Firestore. Open source (Apache 2.0).")
                    .font(.caption).foregroundStyle(KG.muted)
            }
        }
        .navigationTitle("Settings")
    }
}

private struct HowRow: View {
    let place: Where
    let text: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            WhereBadge(place: place)
            Text(text).font(.footnote)
        }
    }
}
