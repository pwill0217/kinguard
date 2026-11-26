import SwiftUI

struct ResultView: View {
    @Environment(AppModel.self) private var model
    @Environment(FamilyStore.self) private var family
    @State private var speaker = Speaker.shared
    let result: CheckResult

    /// Always show the freshest version (e.g. after a requested double-check).
    private var r: CheckResult { model.result?.id == result.id ? model.result! : result }

    var body: some View {
        let f = r.final
        let sent = r.ledger.filter { $0.sent != nil }
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // Verdict
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 14) {
                        Image(systemName: KG.icon(f.verdict))
                            .font(.system(size: 46))
                            .foregroundStyle(KG.color(f.verdict))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(f.headline).font(.title2.weight(.heavy)).foregroundStyle(KG.ink)
                            if f.category != .none {
                                Text(f.category.label).font(.subheadline.weight(.semibold)).foregroundStyle(KG.muted)
                            }
                        }
                    }
                    RiskMeter(score: f.riskScore)
                    Text(f.explanation).font(.body).foregroundStyle(KG.ink)
                    HStack {
                        Button {
                            speaker.toggle(([f.headline + ".", f.explanation, "Here is what to do."] + f.whatToDo + [f.howToVerify]).joined(separator: " "))
                        } label: {
                            Label(speaker.speaking ? "Stop" : "Read this to me", systemImage: speaker.speaking ? "stop.fill" : "speaker.wave.2.fill")
                        }
                        .buttonStyle(SoftButtonStyle(tint: KG.ink, fill: .white))
                        if family.me != nil, !family.circles.isEmpty, f.verdict != .safe {
                            switch model.alertState[r.id] {
                            case "sent":
                                Label("Family told", systemImage: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(KG.safe)
                            case "sending":
                                ProgressView()
                            default:
                                Button {
                                    Task { await model.tellFamily(r, family: family) }
                                } label: {
                                    Label("Tell my family", systemImage: "bell.fill")
                                }
                                .buttonStyle(SoftButtonStyle(tint: KG.ink, fill: .white))
                            }
                        }
                    }
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    LinearGradient(colors: [KG.color(f.verdict).opacity(0.16), .white], startPoint: .top, endPoint: .center),
                    in: RoundedRectangle(cornerRadius: 26, style: .continuous)
                )
                .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(KG.color(f.verdict).opacity(0.35), lineWidth: 2))

                if r.deepPending == .belowThreshold || r.deepPending == .error || r.deepPending == .offline {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(r.deepPending == .belowThreshold ? "Checked privately on your phone. Want a second opinion? Only the version with your details hidden is sent."
                             : "The expert double-check couldn't run. Try again when you're online.")
                            .font(.subheadline)
                        Button(model.deepBusy ? "Double-checking…" : "Get an expert double-check") {
                            Task { await model.runDeepCheck(family: family) }
                        }
                        .buttonStyle(SoftButtonStyle())
                        .disabled(model.deepBusy)
                    }
                    .card()
                }

                if !f.redFlags.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Warning signs").font(.headline.weight(.heavy))
                        ForEach(f.redFlags, id: \.self) { fl in
                            HStack(alignment: .top) {
                                Image(systemName: "exclamationmark.circle.fill").foregroundStyle(KG.bad)
                                (Text(fl.signal).bold() + Text(fl.why.isEmpty ? "" : " · \(fl.why)").foregroundStyle(KG.muted))
                                    .font(.subheadline)
                            }
                        }
                    }
                    .card()
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("What to do now").font(.headline.weight(.heavy))
                    ForEach(Array(f.whatToDo.enumerated()), id: \.offset) { i, step in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(i + 1)").font(.subheadline.weight(.heavy)).foregroundStyle(.white)
                                .frame(width: 24, height: 24).background(KG.brand, in: Circle())
                            Text(step).font(.subheadline)
                        }
                    }
                    if !f.howToVerify.isEmpty {
                        (Text("Check for yourself: ").bold() + Text(f.howToVerify))
                            .font(.subheadline)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(KG.brandSoft, in: RoundedRectangle(cornerRadius: 14))
                    }
                }
                .card()

                // The privacy ledger: what ran where, and exactly what the cloud saw.
                VStack(alignment: .leading, spacing: 12) {
                    Text("How Kinguard checked this").font(.headline.weight(.heavy))
                    Text(sent.isEmpty ? "Nothing left this phone." : "Hidden before sending: \(r.piiSummary)")
                        .font(.footnote).foregroundStyle(KG.muted)
                    ForEach(r.ledger) { e in
                        HStack(alignment: .top, spacing: 10) {
                            WhereBadge(place: e.place)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.step).font(.subheadline.weight(.bold))
                                    + Text(e.seconds.map { String(format: " · %.1fs", $0) } ?? "").foregroundStyle(KG.muted)
                                if let note = e.note { Text(note).font(.caption).foregroundStyle(KG.muted) }
                            }
                        }
                    }
                    if let last = sent.last?.sent {
                        Text("Exactly what the cloud saw").font(.subheadline.weight(.heavy)).padding(.top, 4)
                        Text(last)
                            .font(.system(.footnote, design: .monospaced))
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(hex: 0xF7F6FB), in: RoundedRectangle(cornerRadius: 12))
                        Text("Your real details were put back only on this screen, on this phone.")
                            .font(.caption).foregroundStyle(KG.muted)
                    }
                    if !r.links.isEmpty {
                        Text("Links in the message").font(.subheadline.weight(.heavy)).padding(.top, 4)
                        ForEach(r.links, id: \.host) { l in
                            (Text(l.host).font(.system(.caption, design: .monospaced)).bold()
                                + Text(l.signals.isEmpty ? " · no warning signs" : " · " + l.signals.joined(separator: "; "))
                                .font(.caption).foregroundStyle(l.signals.isEmpty ? KG.muted : KG.bad))
                        }
                    }
                }
                .card()

                Text("Kinguard gives guidance, not guarantees. When in doubt, hang up and call someone you trust.")
                    .font(.caption).foregroundStyle(KG.muted).frame(maxWidth: .infinity)
            }
            .padding()
        }
        .background(KG.bg)
        .navigationTitle("Result")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { if speaker.speaking { speaker.toggle("") } }
    }
}
