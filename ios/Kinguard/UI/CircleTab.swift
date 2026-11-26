import SwiftUI

struct CircleTab: View {
    @Environment(AppModel.self) private var model
    @Environment(FamilyStore.self) private var family
    var onCheck: () -> Void

    @State private var sheet: SheetKind?
    @State private var selectedMember: Member?
    @State private var error: String?

    enum SheetKind: String, Identifiable {
        case invite, join, create, settings, switcher
        var id: String { rawValue }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !family.authReady {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                } else if let me = family.me {
                    if let circle = family.circle {
                        hub(me: me, circle: circle)
                    } else {
                        noCircle(me: me)
                    }
                } else {
                    signIn
                    quickCheck
                }
                if let error { Text(error).font(.footnote.weight(.semibold)).foregroundStyle(KG.bad) }
            }
            .padding()
        }
        .background(KG.bg)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if let circle = family.circle {
                    Button { sheet = .switcher } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "person.3.fill").font(.caption).foregroundStyle(.white)
                                .padding(6).background(KG.grad, in: Circle())
                            Text(circle.name).font(.headline.weight(.heavy)).foregroundStyle(KG.ink).lineLimit(1)
                            Image(systemName: "chevron.down").font(.caption.weight(.bold)).foregroundStyle(KG.muted)
                        }
                    }
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.shield.fill").foregroundStyle(.white)
                            .padding(7).background(KG.grad, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        Text("Kinguard").font(.headline.weight(.heavy))
                    }
                }
            }
            ToolbarItem(placement: .topBarTrailing) { DevicePill(status: model.deviceAI) }
        }
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { kind in
            switch kind {
            case .invite: InviteSheet()
            case .join: JoinSheet()
            case .create: CreateSheet()
            case .settings: CircleSettingsSheet()
            case .switcher: SwitcherSheet(onCreate: { sheet = .create }, onJoin: { sheet = .join })
            }
        }
        .sheet(item: $selectedMember) { m in MemberSheet(memberId: m.id) }
    }

    // MARK: - Signed out

    private var signIn: some View {
        VStack(spacing: 16) {
            ZStack {
                ForEach(Array(["👵", "🧑", "👧", "👴"].enumerated()), id: \.offset) { i, e in
                    Text(e).font(.title)
                        .frame(width: 54, height: 54)
                        .background(.white.opacity(0.22), in: Circle())
                        .overlay(Circle().stroke(.white.opacity(0.45), lineWidth: 2))
                        .offset(x: [-95, 95, -70, 75][i], y: [-38, -44, 40, 36][i])
                }
                Image(systemName: "checkmark.shield.fill").font(.system(size: 40)).foregroundStyle(KG.brand)
                    .frame(width: 84, height: 84).background(.white, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            }
            .frame(height: 150)
            Text("Scam protection for the people you love").font(.title2.weight(.heavy)).multilineTextAlignment(.center)
            Text("Create a family circle. When Kinguard catches a likely scam, the people who look out for each other find out right away, without anyone's messages being shared.")
                .multilineTextAlignment(.center).opacity(0.9)
            Button {
                Task {
                    do { try await family.signInWithGoogle() } catch { self.error = error.localizedDescription }
                }
            } label: {
                Label("Continue with Google", systemImage: "person.crop.circle.fill")
                    .font(.headline).foregroundStyle(KG.ink)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            Text("Your circle is saved to your account, so it works on every device. Checking a message never needs an account.")
                .font(.caption).multilineTextAlignment(.center).opacity(0.85)
        }
        .foregroundStyle(.white)
        .padding(22)
        .background(KG.grad, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    private var quickCheck: some View {
            Button(action: onCheck) {
                HStack {
                    Image(systemName: "checkmark.shield").font(.title3).foregroundStyle(KG.brand)
                        .frame(width: 46, height: 46).background(KG.brandSoft, in: RoundedRectangle(cornerRadius: 15))
                    VStack(alignment: .leading) {
                        Text("Just check a message").font(.headline).foregroundStyle(KG.ink)
                        Text("No account needed").font(.caption).foregroundStyle(KG.muted)
                    }
                    Spacer()
                }
                .card()
            }
    }

    // MARK: - Signed in, no circle yet

    private func noCircle(me: Me) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(spacing: 12) {
                Avatar(name: me.name, url: me.photoURL, size: 84)
                    .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 4))
                Text("WELCOME, \(me.firstName.uppercased())").font(.caption.weight(.heavy)).opacity(0.85)
                Text("It's just you so far").font(.title.weight(.heavy))
                Text("Invite the people you look out for, or the people who look out for you. Up to \(maxMembers) per family.")
                    .multilineTextAlignment(.center).opacity(0.9)
                HStack {
                    Button {
                        Task { await createDefault(me: me) }
                    } label: {
                        Label("Invite family", systemImage: "plus").font(.headline).foregroundStyle(KG.brandDeep)
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(.white, in: RoundedRectangle(cornerRadius: 14))
                    }
                    Button { sheet = .join } label: {
                        Text("I have a code").font(.headline).foregroundStyle(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 14))
                    }
                }
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(22)
            .background(KG.grad, in: RoundedRectangle(cornerRadius: 30, style: .continuous))

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Your family").font(.headline.weight(.heavy))
                    Text("1/\(maxMembers)").font(.caption.weight(.bold)).foregroundStyle(KG.muted)
                        .padding(.horizontal, 8).padding(.vertical, 2).background(KG.bg, in: Capsule())
                }
                HStack(spacing: 12) {
                    Avatar(name: me.name, url: me.photoURL)
                    VStack(alignment: .leading) {
                        Text("\(Text(me.name).bold())\(Text(" (you)").foregroundStyle(KG.muted))")
                        Text(me.email ?? "").font(.caption).foregroundStyle(KG.muted)
                    }
                }
                ForEach(["Add a parent or grandparent", "Add a helper"], id: \.self) { t in
                    Button { Task { await createDefault(me: me) } } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "plus").foregroundStyle(KG.brand)
                                .frame(width: 44, height: 44)
                                .overlay(Circle().stroke(KG.brand.opacity(0.4), style: StrokeStyle(lineWidth: 2, dash: [4])))
                            Text(t).font(.subheadline.weight(.bold)).foregroundStyle(KG.muted)
                        }
                    }
                }
                Button("Or create a family with a custom name") { sheet = .create }.font(.subheadline.weight(.bold))
            }
            .card()
        }
    }

    private func createDefault(me: Me) async {
        let last = me.name.components(separatedBy: " ").dropFirst().joined(separator: " ")
        do {
            try await family.createCircle(name: last.isEmpty ? "\(me.firstName)'s Family" : "The \(last) Family", iAmProtected: false)
            sheet = .invite
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - The hub

    private func hub(me: Me, circle: FamilyCircle) -> some View {
        let weekAgo = Date().addingTimeInterval(-7 * 86400)
        let attention = family.alerts.filter { $0.verdict != .safe && $0.ackBy.isEmpty && $0.fromUid != me.uid && ($0.createdAt ?? Date()) > weekAgo }
        let solo = family.members.count <= 1
        let protectedCount = family.members.filter(\.isProtected).count
        return VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(circle.name.uppercased()).font(.caption.weight(.heavy)).opacity(0.85)
                        Text(attention.isEmpty ? (solo ? "It's just you so far" : "Everyone's safe")
                             : "\(attention.count) warning\(attention.count > 1 ? "s" : "") need\(attention.count > 1 ? "" : "s") attention")
                            .font(.title.weight(.heavy))
                        Text(solo ? "Invite your family to start looking out for each other."
                             : "\(protectedCount) protected · \(family.members.count - protectedCount) helper\(family.members.count - protectedCount == 1 ? "" : "s")")
                            .opacity(0.9)
                    }
                    Spacer()
                    Image(systemName: attention.isEmpty ? "checkmark.shield.fill" : "bell.fill").font(.title2)
                        .frame(width: 54, height: 54).background(.white.opacity(0.18), in: RoundedRectangle(cornerRadius: 18))
                }
                HStack {
                    HStack(spacing: -10) {
                        ForEach(family.members.prefix(5)) { m in
                            Avatar(name: m.name, url: m.photoURL, size: solo ? 46 : 36)
                                .overlay(Circle().stroke(.white, lineWidth: 2.5))
                        }
                    }
                    Spacer()
                    if solo && family.canManage {
                        Button { sheet = .invite } label: { Label("Invite family", systemImage: "plus") }
                            .buttonStyle(SoftButtonStyle(tint: KG.brandDeep, fill: .white))
                    } else {
                        Button("Check a message", action: onCheck)
                            .buttonStyle(SoftButtonStyle(tint: KG.brandDeep, fill: .white))
                    }
                }
            }
            .foregroundStyle(.white)
            .padding(22)
            .background(attention.isEmpty ? KG.grad : KG.alertGrad, in: RoundedRectangle(cornerRadius: 30, style: .continuous))

            if !attention.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Needs attention").font(.headline.weight(.heavy))
                    ForEach(attention) { a in AlertRow(alert: a, me: me) }
                }
                .card()
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Members").font(.headline.weight(.heavy))
                    Text("\(family.members.count)/\(maxMembers)").font(.caption.weight(.bold)).foregroundStyle(KG.muted)
                        .padding(.horizontal, 8).padding(.vertical, 2).background(KG.bg, in: Capsule())
                    Spacer()
                    if family.canManage {
                        Button { sheet = .invite } label: { Label("Invite", systemImage: "plus") }
                            .buttonStyle(SoftButtonStyle())
                            .disabled(family.members.count >= maxMembers)
                    }
                }
                ForEach(family.members) { m in
                    Button { selectedMember = m } label: { MemberRow(member: m, isMe: m.id == me.uid) }
                        .disabled(!(family.canManage || m.id == me.uid))
                    if m.id != family.members.last?.id { Divider() }
                }
                if family.canManage && !family.invites.isEmpty {
                    Text("PENDING INVITES").font(.caption.weight(.heavy)).foregroundStyle(KG.muted).padding(.top, 8)
                    ForEach(family.invites) { inv in
                        HStack {
                            Text(inv.code).font(.system(.subheadline, design: .monospaced).weight(.heavy)).foregroundStyle(KG.brandDeep)
                                .padding(.horizontal, 8).padding(.vertical, 4).background(KG.brandSoft, in: RoundedRectangle(cornerRadius: 8))
                            Text(inv.asProtected ? "Someone to protect" : "Helper").font(.caption)
                            Spacer()
                            ShareLink(item: inviteText(inv)) { Image(systemName: "square.and.arrow.up") }
                            Button("Cancel", role: .destructive) { Task { try? await family.revokeInvite(inv.code) } }
                                .font(.caption.weight(.bold))
                        }
                    }
                }
            }
            .card()

            let others = family.alerts.filter { a in !attention.contains(where: { $0.id == a.id }) }
            VStack(alignment: .leading, spacing: 8) {
                Text("Recent alerts").font(.headline.weight(.heavy))
                if others.isEmpty {
                    Text(family.alerts.isEmpty ? "No alerts yet. When a protected member checks a likely scam, it shows up here instantly." : "Nothing else recently.")
                        .font(.subheadline).foregroundStyle(KG.muted)
                } else {
                    ForEach(others.prefix(10)) { a in AlertRow(alert: a, me: me) }
                }
            }
            .card()

            Button { sheet = .settings } label: { Label("Circle settings", systemImage: "gearshape") }
                .font(.subheadline.weight(.bold)).foregroundStyle(KG.muted).frame(maxWidth: .infinity)
        }
    }
}

func inviteText(_ inv: Invite) -> String {
    "Join our family circle \"\(inv.circleName)\" on Kinguard, the scam checker. Code: \(inv.code)\nhttps://kinguard-3e9fb.web.app/join/\(inv.code)"
}

struct MemberRow: View {
    let member: Member
    let isMe: Bool

    private var status: (String, Color) {
        guard member.isProtected else { return ("Helper", KG.muted) }
        guard let last = member.lastCheck else { return ("Protected · no checks yet", KG.muted) }
        let word = switch last.verdict {
        case .safe: "All clear"
        case .suspicious: "Checked something suspicious"
        case .likely_scam: "Caught a likely scam"
        }
        return ("\(word) · \(timeAgo(last.at))", KG.color(last.verdict))
    }

    var body: some View {
        HStack(spacing: 12) {
            Avatar(name: member.name, url: member.photoURL, ring: member.isProtected ? member.lastCheck?.verdict : nil)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(Text(member.name).bold().foregroundStyle(KG.ink))\(Text(isMe ? " (you)" : "").foregroundStyle(KG.muted))")
                Text(status.0).font(.caption.weight(.semibold)).foregroundStyle(status.1)
            }
            Spacer()
            if member.isProtected {
                Image(systemName: "checkmark.shield.fill").font(.caption).foregroundStyle(KG.brandDeep)
                    .padding(5).background(KG.brandSoft, in: Capsule())
            }
            if member.role != .member {
                Text(member.role == .owner ? "Owner" : "Admin").font(.caption2.weight(.heavy)).foregroundStyle(KG.ink)
                    .padding(.horizontal, 8).padding(.vertical, 4).background(KG.bg, in: Capsule())
            }
        }
        .padding(.vertical, 4)
    }
}

struct AlertRow: View {
    @Environment(FamilyStore.self) private var family
    let alert: FamilyAlert
    let me: Me

    var body: some View {
        let from = family.members.first { $0.id == alert.fromUid }
        let mine = alert.fromUid == me.uid
        HStack(alignment: .top, spacing: 12) {
            Avatar(name: alert.fromName, url: from?.photoURL, size: 40)
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: KG.icon(alert.verdict)).font(.caption).foregroundStyle(KG.color(alert.verdict))
                        .background(.white, in: Circle()).offset(x: 4, y: 4)
                }
            VStack(alignment: .leading, spacing: 3) {
                Text("\(Text(mine ? "You" : alert.fromName).bold()) · \(alert.headline)")
                    .font(.subheadline)
                Text("\(alert.category.label) · risk \(alert.riskScore) · \(timeAgo(alert.createdAt))")
                    .font(.caption).foregroundStyle(KG.muted)
                Text(alert.explanation).font(.footnote).foregroundStyle(KG.ink.opacity(0.8))
                if !alert.ackNames.isEmpty {
                    Text("✓ \(alert.ackNames.joined(separator: ", ")) \(alert.ackNames.count > 1 ? "are" : "is") on it")
                        .font(.caption.weight(.bold)).foregroundStyle(KG.safe)
                }
            }
            Spacer(minLength: 0)
            if !mine && !alert.ackBy.contains(me.uid) {
                Button("I'll call") { Task { try? await family.acknowledge(alert) } }
                    .buttonStyle(SoftButtonStyle())
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Sheets

struct InviteSheet: View {
    @Environment(FamilyStore.self) private var family
    @Environment(\.dismiss) private var dismiss
    @State private var invite: Invite?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if let inv = invite {
                    Text("Share this code. It expires in 48 hours.").foregroundStyle(KG.muted)
                    Text(inv.code)
                        .font(.system(size: 40, weight: .heavy, design: .monospaced)).kerning(8)
                        .foregroundStyle(KG.brandDeep)
                        .frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(KG.brandSoft, in: RoundedRectangle(cornerRadius: 18))
                    ShareLink(item: inviteText(inv)) {
                        Label("Share invite", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    Label("They'll sign in with Google, then enter the code.", systemImage: "lock.fill")
                        .font(.caption).foregroundStyle(KG.muted)
                } else {
                    Text("Who are you inviting?").font(.headline)
                    choice(icon: "checkmark.shield.fill", title: "Someone to protect",
                           text: "A parent or grandparent. You'll be told if they run into a likely scam.", protected: true)
                    choice(icon: "person.2.fill", title: "A helper",
                           text: "A sibling or relative who also gets the heads-up.", protected: false)
                    if let error { Text(error).font(.footnote).foregroundStyle(KG.bad) }
                }
                Spacer()
            }
            .padding()
            .navigationTitle("Invite to \(family.circle?.name ?? "your circle")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func choice(icon: String, title: String, text: String, protected: Bool) -> some View {
        Button {
            busy = true
            Task {
                do { invite = try await family.createInvite(asProtected: protected) } catch { self.error = error.localizedDescription }
                busy = false
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon).foregroundStyle(.white).frame(width: 44, height: 44)
                    .background(KG.grad, in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(KG.ink)
                    Text(text).font(.footnote).foregroundStyle(KG.muted).multilineTextAlignment(.leading)
                }
                Spacer()
            }
            .padding(14)
            .background(.white, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(KG.line, lineWidth: 1.5))
        }
        .disabled(busy)
    }
}

struct JoinSheet: View {
    @Environment(FamilyStore.self) private var family
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var invite: Invite?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if let inv = invite {
                    Image(systemName: "person.3.fill").font(.title).foregroundStyle(.white)
                        .frame(width: 64, height: 64).background(KG.grad, in: RoundedRectangle(cornerRadius: 22))
                    Text("\(inv.createdByName) invited you to").foregroundStyle(KG.muted)
                    Text(inv.circleName).font(.title2.weight(.heavy))
                    Text(inv.asProtected ? "You'll be protected. When you check a message that looks like a scam, this circle gets a heads-up. They never see your messages."
                         : "You'll be a helper. You'll get a heads-up when someone you protect runs into a likely scam.")
                        .font(.footnote).foregroundStyle(KG.muted).multilineTextAlignment(.center)
                    Button(busy ? "Joining…" : "Join \(inv.circleName)") {
                        busy = true
                        Task {
                            do { try await family.join(inv); dismiss() } catch { self.error = error.localizedDescription }
                            busy = false
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle()).disabled(busy)
                } else {
                    TextField("ABC234", text: $code)
                        .font(.system(size: 30, weight: .heavy, design: .monospaced))
                        .multilineTextAlignment(.center)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .padding().background(Color(hex: 0xFBFAFF), in: RoundedRectangle(cornerRadius: 16))
                        .onChange(of: code) { _, v in
                            let n = FamilyStore.normalize(v)
                            if n != v { code = n }
                        }
                    Button(busy ? "Checking…" : "Continue") {
                        busy = true
                        Task {
                            do { invite = try await family.previewInvite(code) } catch { self.error = error.localizedDescription }
                            busy = false
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle()).disabled(busy || code.count != 6)
                }
                if let error { Text(error).font(.footnote).foregroundStyle(KG.bad) }
                Spacer()
            }
            .padding()
            .navigationTitle("Join a circle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

struct CreateSheet: View {
    @Environment(FamilyStore.self) private var family
    @Environment(\.dismiss) private var dismiss
    @State private var name = "My Family"
    @State private var iAmProtected = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Circle name", text: $name)
                Toggle(isOn: $iAmProtected) {
                    VStack(alignment: .leading) {
                        Text("Watch my messages too")
                        Text("Alert this circle when I check something that looks like a scam.").font(.caption).foregroundStyle(KG.muted)
                    }
                }
                if let error { Text(error).foregroundStyle(KG.bad) }
            }
            .navigationTitle("Create a circle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            do {
                                try await family.createCircle(name: name.trimmingCharacters(in: .whitespaces), iAmProtected: iAmProtected)
                                dismiss()
                            } catch { self.error = error.localizedDescription }
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

struct MemberSheet: View {
    @Environment(FamilyStore.self) private var family
    @Environment(\.dismiss) private var dismiss
    let memberId: String
    @State private var error: String?
    @State private var confirm = false

    var body: some View {
        NavigationStack {
            if let m = family.members.first(where: { $0.id == memberId }), let me = family.me {
                let isMe = m.id == me.uid
                let canRemove = !isMe && family.canManage && m.role != .owner && (family.myRole == .owner || m.role == .member)
                Form {
                    Section {
                        HStack(spacing: 14) {
                            Avatar(name: m.name, url: m.photoURL, size: 64, ring: m.isProtected ? m.lastCheck?.verdict : nil)
                            VStack(alignment: .leading) {
                                Text(m.name).font(.title3.weight(.heavy))
                                Text("\(m.role.rawValue.capitalized)\(m.joinedAt.map { " · joined \($0.formatted(date: .abbreviated, time: .omitted))" } ?? "")")
                                    .font(.caption).foregroundStyle(KG.muted)
                            }
                        }
                    }
                    if isMe || family.canManage {
                        Toggle(isOn: Binding(get: { m.isProtected }, set: { v in Task { try? await family.setProtected(uid: m.id, v) } })) {
                            VStack(alignment: .leading) {
                                Text("Protected")
                                Text(isMe ? "Alert this circle when I check something that looks like a scam." : "Alert the circle when \(m.name.components(separatedBy: " ").first ?? m.name) checks a likely scam.")
                                    .font(.caption).foregroundStyle(KG.muted)
                            }
                        }
                    }
                    if family.myRole == .owner && !isMe && m.role != .owner {
                        Toggle(isOn: Binding(get: { m.role == .admin }, set: { v in Task { try? await family.setRole(uid: m.id, v ? .admin : .member) } })) {
                            VStack(alignment: .leading) {
                                Text("Admin")
                                Text("Admins can invite and remove members.").font(.caption).foregroundStyle(KG.muted)
                            }
                        }
                    }
                    if canRemove || (isMe && m.role != .owner) {
                        Button(isMe ? "Leave circle" : "Remove from circle", role: .destructive) { confirm = true }
                    }
                    if let error { Text(error).foregroundStyle(KG.bad) }
                }
                .confirmationDialog(isMe ? "Leave this circle?" : "Remove \(m.name)?", isPresented: $confirm, titleVisibility: .visible) {
                    Button(isMe ? "Leave" : "Remove", role: .destructive) {
                        Task {
                            do { try await family.remove(uid: m.id); dismiss() } catch { self.error = error.localizedDescription }
                        }
                    }
                }
                .navigationTitle(isMe ? "Your membership" : "Member")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct CircleSettingsSheet: View {
    @Environment(FamilyStore.self) private var family
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var confirm = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if family.canManage {
                    Section("Circle name") {
                        TextField("Name", text: $name)
                        Button("Save") { Task { try? await family.rename(name) } }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || name == family.circle?.name)
                    }
                }
                Section {
                    Text("Up to \(maxMembers) people per circle. Invite codes expire after 48 hours and can be cancelled anytime.")
                        .font(.footnote).foregroundStyle(KG.muted)
                    Button(family.myRole == .owner ? "Delete circle" : "Leave circle", role: .destructive) { confirm = true }
                }
                if let error { Text(error).foregroundStyle(KG.bad) }
            }
            .onAppear { name = family.circle?.name ?? "" }
            .confirmationDialog(family.myRole == .owner ? "Delete this circle for everyone?" : "Leave this circle?",
                                isPresented: $confirm, titleVisibility: .visible) {
                Button(family.myRole == .owner ? "Delete" : "Leave", role: .destructive) {
                    Task {
                        do {
                            if family.myRole == .owner { try await family.deleteCircle() } else if let me = family.me { try await family.remove(uid: me.uid) }
                            dismiss()
                        } catch { self.error = error.localizedDescription }
                    }
                }
            }
            .navigationTitle("Circle settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}

struct SwitcherSheet: View {
    @Environment(FamilyStore.self) private var family
    @Environment(\.dismiss) private var dismiss
    var onCreate: () -> Void
    var onJoin: () -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(family.circles) { c in
                    Button {
                        family.currentCircleId = c.id
                        dismiss()
                    } label: {
                        HStack {
                            Image(systemName: "person.3.fill").foregroundStyle(.white).frame(width: 40, height: 40)
                                .background(KG.grad, in: RoundedRectangle(cornerRadius: 12))
                            VStack(alignment: .leading) {
                                Text(c.name).font(.headline).foregroundStyle(KG.ink)
                                Text("\(c.memberUids.count) of \(maxMembers) people").font(.caption).foregroundStyle(KG.muted)
                            }
                            Spacer()
                            if c.id == family.circle?.id { Image(systemName: "checkmark").foregroundStyle(KG.brand) }
                        }
                    }
                }
                Section {
                    Button { dismiss(); onCreate() } label: { Label("Create a new circle", systemImage: "plus") }
                    Button { dismiss(); onJoin() } label: { Label("Join with a code", systemImage: "person.badge.plus") }
                }
            }
            .navigationTitle("Your circles")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}
