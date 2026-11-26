// Accounts + family circles. Same Firestore data model and security rules as the web app,
// so an iPhone user and a web user share one family.
//
//   circles/{id}                 { name, ownerUid, memberUids[], createdAt }    max 8 people
//   circles/{id}/members/{uid}   { name, photoURL, role, protected, joinedAt, lastCheck, inviteCode? }
//   circles/{id}/alerts/{id}     redacted verdict only
//   invites/{code}               { circleId, circleName, createdBy, createdByName, asProtected, expiresAt, revoked }
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation
import GoogleSignIn
import Observation
import UIKit

let maxMembers = 8
let inviteHours = 48.0

struct Me: Equatable {
    let uid: String
    let name: String
    let firstName: String
    let photoURL: URL?
    let email: String?
}

struct FamilyCircle: Identifiable, Equatable {
    let id: String
    var name: String
    var ownerUid: String
    var memberUids: [String]
}

enum Role: String { case owner, admin, member }

struct Member: Identifiable, Equatable {
    let id: String // uid
    var name: String
    var photoURL: URL?
    var role: Role
    var isProtected: Bool
    var joinedAt: Date?
    var lastCheck: (at: Date, verdict: Verdict)?

    static func == (a: Member, b: Member) -> Bool {
        a.id == b.id && a.name == b.name && a.role == b.role && a.isProtected == b.isProtected
            && a.lastCheck?.at == b.lastCheck?.at && a.lastCheck?.verdict == b.lastCheck?.verdict
    }
}

struct Invite: Identifiable, Equatable {
    var id: String { code }
    let code: String
    let circleId: String
    let circleName: String
    let createdByName: String
    let asProtected: Bool
    let expiresAt: Date
    let revoked: Bool
}

struct FamilyAlert: Identifiable, Equatable {
    let id: String
    let fromUid: String
    let fromName: String
    let verdict: Verdict
    let riskScore: Int
    let category: Category
    let headline: String
    let explanation: String
    let createdAt: Date?
    let ackBy: [String]
    let ackNames: [String]
}

/// Firestore can't store Swift optionals; send NSNull for missing values.
func orNull(_ s: String?) -> Any {
    if let s { return s }
    return NSNull()
}

enum FamilyError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        if case let .message(m) = self { return m }
        return nil
    }
}

@MainActor
@Observable
final class FamilyStore {
    private(set) var me: Me?
    private(set) var authReady = false
    private(set) var circles: [FamilyCircle] = []
    var currentCircleId: String? {
        didSet {
            UserDefaults.standard.set(currentCircleId, forKey: "kinguard.circle")
            watchCurrentCircle()
        }
    }
    private(set) var members: [Member] = []
    private(set) var alerts: [FamilyAlert] = []
    private(set) var invites: [Invite] = []

    var circle: FamilyCircle? { circles.first { $0.id == currentCircleId } ?? circles.first }
    var myRole: Role? { members.first { $0.id == me?.uid }?.role }
    var canManage: Bool { myRole == .owner || myRole == .admin }

    private var db: Firestore { Firestore.firestore() }
    private var authHandle: AuthStateDidChangeListenerHandle?
    private var circlesListener: ListenerRegistration?
    private var circleListeners: [ListenerRegistration] = []

    init() {
        currentCircleId = UserDefaults.standard.string(forKey: "kinguard.circle")
        // Firebase delivers auth and snapshot callbacks on the main queue.
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            MainActor.assumeIsolated { self?.userChanged(user) }
        }
    }

    // MARK: - Auth

    private func userChanged(_ user: User?) {
        authReady = true
        if let user, !user.isAnonymous {
            let name = user.displayName ?? user.email?.components(separatedBy: "@").first ?? "Me"
            me = Me(uid: user.uid, name: name, firstName: name.components(separatedBy: " ").first ?? name,
                    photoURL: user.photoURL, email: user.email)
            watchCircles()
        } else {
            me = nil
            circlesListener?.remove()
            circles = []
            stopCircleListeners()
        }
    }

    func signInWithGoogle() async throws {
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            throw FamilyError.message("Google sign-in isn't configured. Check GoogleService-Info.plist.")
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController }).first else {
            throw FamilyError.message("Couldn't show the sign-in screen.")
        }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: root)
        guard let idToken = result.user.idToken?.tokenString else {
            throw FamilyError.message("Google didn't return a sign-in token.")
        }
        let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: result.user.accessToken.tokenString)
        let authResult = try await Auth.auth().signIn(with: credential)
        let u = authResult.user
        try? await db.collection("users").document(u.uid).setData([
            "name": u.displayName ?? "",
            "photoURL": orNull(u.photoURL?.absoluteString),
            "updatedAt": FieldValue.serverTimestamp(),
        ], merge: true)
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        try? Auth.auth().signOut()
    }

    // MARK: - Live data

    private func watchCircles() {
        guard let uid = me?.uid else { return }
        circlesListener?.remove()
        circlesListener = db.collection("circles").whereField("memberUids", arrayContains: uid)
            .addSnapshotListener { [weak self] snap, _ in
                MainActor.assumeIsolated {
                guard let self, let docs = snap?.documents else { return }
                let list = docs.map { d -> FamilyCircle in
                    let v = d.data()
                    return FamilyCircle(id: d.documentID, name: v["name"] as? String ?? "Family",
                                  ownerUid: v["ownerUid"] as? String ?? "", memberUids: v["memberUids"] as? [String] ?? [])
                }.sorted { $0.name < $1.name }
                self.circles = list
                if self.circle?.id != self.currentCircleId || self.circleListeners.isEmpty {
                    self.currentCircleId = self.circle?.id
                }
                }
            }
    }

    private func stopCircleListeners() {
        circleListeners.forEach { $0.remove() }
        circleListeners = []
        members = []
        alerts = []
        invites = []
    }

    private func watchCurrentCircle() {
        stopCircleListeners()
        guard me != nil, let id = circle?.id else { return }
        let ref = db.collection("circles").document(id)
        circleListeners.append(ref.collection("members").addSnapshotListener { [weak self] snap, _ in
            MainActor.assumeIsolated {
            guard let self else { return }
            let order: [Role: Int] = [.owner: 0, .admin: 1, .member: 2]
            let list = (snap?.documents ?? []).map { d -> Member in
                let v = d.data()
                var last: (Date, Verdict)?
                if let lc = v["lastCheck"] as? [String: Any], let at = (lc["at"] as? Timestamp)?.dateValue(),
                   let verdict = Verdict(rawValue: lc["verdict"] as? String ?? "") {
                    last = (at, verdict)
                }
                return Member(id: d.documentID, name: v["name"] as? String ?? "Member",
                              photoURL: (v["photoURL"] as? String).flatMap(URL.init(string:)),
                              role: Role(rawValue: v["role"] as? String ?? "") ?? .member,
                              isProtected: v["protected"] as? Bool ?? false,
                              joinedAt: (v["joinedAt"] as? Timestamp)?.dateValue(),
                              lastCheck: last)
            }.sorted { (order[$0.role]!, $0.name) < (order[$1.role]!, $1.name) }
            self.members = list
            }
        })
        circleListeners.append(ref.collection("alerts").order(by: "createdAt", descending: true).limit(to: 30)
            .addSnapshotListener { [weak self] snap, _ in
                MainActor.assumeIsolated {
                guard let self else { return }
                let list = (snap?.documents ?? []).map { d -> FamilyAlert in
                    let v = d.data()
                    return FamilyAlert(id: d.documentID, fromUid: v["fromUid"] as? String ?? "", fromName: v["fromName"] as? String ?? "",
                                       verdict: Verdict(rawValue: v["verdict"] as? String ?? "") ?? .suspicious,
                                       riskScore: v["riskScore"] as? Int ?? 0,
                                       category: Category(rawValue: v["category"] as? String ?? "") ?? .other,
                                       headline: v["headline"] as? String ?? "", explanation: v["explanation"] as? String ?? "",
                                       createdAt: (v["createdAt"] as? Timestamp)?.dateValue(),
                                       ackBy: v["ackBy"] as? [String] ?? [], ackNames: v["ackNames"] as? [String] ?? [])
                }
                self.alerts = list
                }
            })
        circleListeners.append(db.collection("invites").whereField("circleId", isEqualTo: id).whereField("revoked", isEqualTo: false)
            .addSnapshotListener { [weak self] snap, _ in
                MainActor.assumeIsolated {
                guard let self else { return }
                let now = Date()
                let list = (snap?.documents ?? []).compactMap { Self.invite(from: $0.documentID, $0.data()) }
                    .filter { $0.expiresAt > now }
                    .sorted { $0.expiresAt > $1.expiresAt }
                self.invites = list
                }
            })
    }

    nonisolated private static func invite(from code: String, _ v: [String: Any]) -> Invite? {
        guard let circleId = v["circleId"] as? String else { return nil }
        return Invite(code: code, circleId: circleId, circleName: v["circleName"] as? String ?? "Family",
                      createdByName: v["createdByName"] as? String ?? "A family member",
                      asProtected: v["asProtected"] as? Bool ?? false,
                      expiresAt: (v["expiresAt"] as? Timestamp)?.dateValue() ?? .distantPast,
                      revoked: v["revoked"] as? Bool ?? false)
    }

    // MARK: - Actions

    private func requireMe() throws -> Me {
        guard let me else { throw FamilyError.message("Please sign in first.") }
        return me
    }

    func createCircle(name: String, iAmProtected: Bool) async throws {
        let me = try requireMe()
        let ref = db.collection("circles").document()
        let batch = db.batch()
        batch.setData(["name": String(name.prefix(40)), "ownerUid": me.uid, "memberUids": [me.uid],
                       "createdAt": FieldValue.serverTimestamp()], forDocument: ref)
        batch.setData(["name": String(me.name.prefix(60)), "photoURL": orNull(me.photoURL?.absoluteString),
                       "role": "owner", "protected": iAmProtected, "joinedAt": FieldValue.serverTimestamp(),
                       "lastCheck": NSNull()], forDocument: ref.collection("members").document(me.uid))
        try await batch.commit()
        currentCircleId = ref.documentID
    }

    nonisolated static func newCode() -> String {
        let alphabet = Array("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
        return String((0..<6).map { _ in alphabet[Int.random(in: 0..<alphabet.count)] })
    }

    nonisolated static func normalize(_ input: String) -> String {
        String(input.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(6))
    }

    func createInvite(asProtected: Bool) async throws -> Invite {
        let me = try requireMe()
        guard let circle else { throw FamilyError.message("Create a circle first.") }
        guard circle.memberUids.count < maxMembers else { throw FamilyError.message("A circle can have up to \(maxMembers) people.") }
        let expires = Date().addingTimeInterval(inviteHours * 3600)
        for attempt in 0..<4 {
            let code = Self.newCode()
            do {
                try await db.collection("invites").document(code).setData([
                    "circleId": circle.id, "circleName": circle.name, "createdBy": me.uid, "createdByName": me.firstName,
                    "asProtected": asProtected, "expiresAt": Timestamp(date: expires), "revoked": false,
                    "createdAt": FieldValue.serverTimestamp(),
                ])
                return Invite(code: code, circleId: circle.id, circleName: circle.name, createdByName: me.firstName,
                              asProtected: asProtected, expiresAt: expires, revoked: false)
            } catch {
                if attempt == 3 { throw error } // a clashing code is rejected by the rules; try another
            }
        }
        throw FamilyError.message("Couldn't create an invite.")
    }

    func revokeInvite(_ code: String) async throws {
        try await db.collection("invites").document(code).updateData(["revoked": true])
    }

    func previewInvite(_ code: String) async throws -> Invite {
        let snap = try? await db.collection("invites").document(code).getDocument()
        guard let snap, snap.exists, let data = snap.data(), let inv = Self.invite(from: code, data) else {
            throw FamilyError.message("That code was not found. Check the letters and try again.")
        }
        if inv.revoked { throw FamilyError.message("That invite was cancelled. Ask for a new code.") }
        if inv.expiresAt < Date() { throw FamilyError.message("That invite has expired. Ask for a new code.") }
        return inv
    }

    func join(_ inv: Invite) async throws {
        let me = try requireMe()
        let circleRef = db.collection("circles").document(inv.circleId)
        let batch = db.batch()
        batch.setData(["name": String(me.name.prefix(60)), "photoURL": orNull(me.photoURL?.absoluteString),
                       "role": "member", "protected": inv.asProtected, "joinedAt": FieldValue.serverTimestamp(),
                       "lastCheck": NSNull(), "inviteCode": inv.code], forDocument: circleRef.collection("members").document(me.uid))
        batch.updateData(["memberUids": FieldValue.arrayUnion([me.uid])], forDocument: circleRef)
        do {
            try await batch.commit()
        } catch {
            throw FamilyError.message("Couldn't join. The circle may be full (\(maxMembers) people max), or you're already in it.")
        }
        currentCircleId = inv.circleId
    }

    /// Leave yourself, or (owner/admin) remove someone else.
    func remove(uid: String) async throws {
        guard let circle else { return }
        let ref = db.collection("circles").document(circle.id)
        let batch = db.batch()
        batch.deleteDocument(ref.collection("members").document(uid))
        batch.updateData(["memberUids": FieldValue.arrayRemove([uid])], forDocument: ref)
        try await batch.commit()
    }

    func setProtected(uid: String, _ value: Bool) async throws {
        guard let circle else { return }
        try await db.collection("circles").document(circle.id).collection("members").document(uid).updateData(["protected": value])
    }

    func setRole(uid: String, _ role: Role) async throws {
        guard let circle else { return }
        try await db.collection("circles").document(circle.id).collection("members").document(uid).updateData(["role": role.rawValue])
    }

    func rename(_ name: String) async throws {
        guard let circle else { return }
        try await db.collection("circles").document(circle.id).updateData(["name": String(name.prefix(40))])
    }

    func deleteCircle() async throws {
        guard let circle else { return }
        try await db.collection("circles").document(circle.id).delete()
        currentCircleId = nil
    }

    func acknowledge(_ alert: FamilyAlert) async throws {
        let me = try requireMe()
        guard let circle else { return }
        try await db.collection("circles").document(circle.id).collection("alerts").document(alert.id).updateData([
            "ackBy": FieldValue.arrayUnion([me.uid]), "ackNames": FieldValue.arrayUnion([String(me.firstName.prefix(40))]),
        ])
    }

    /// Share the check with every circle where I'm protected: status always, alert when high-risk.
    @discardableResult
    func share(_ result: CheckResult, alertThreshold: Int, force: Bool = false) async -> Bool {
        guard let me else { return false }
        var protectedIn: [String] = []
        for c in circles {
            let snap = try? await db.collection("circles").document(c.id).collection("members").document(me.uid).getDocument()
            if snap?.data()?["protected"] as? Bool == true { protectedIn.append(c.id) }
        }
        guard !protectedIn.isEmpty else { return false }
        for id in protectedIn {
            try? await db.collection("circles").document(id).collection("members").document(me.uid).updateData([
                "lastCheck": ["at": FieldValue.serverTimestamp(), "verdict": result.final.verdict.rawValue],
            ])
        }
        guard force || result.final.riskScore >= alertThreshold else { return false }
        let s = result.shareable
        for id in protectedIn {
            try? await db.collection("circles").document(id).collection("alerts").document().setData([
                "fromUid": me.uid, "fromName": String(me.firstName.prefix(40)), "verdict": s.verdict.rawValue,
                "riskScore": s.riskScore, "category": s.category.rawValue, "headline": String(s.headline.prefix(200)),
                "explanation": String(s.explanation.prefix(1000)), "createdAt": FieldValue.serverTimestamp(),
                "ackBy": [String](), "ackNames": [String](),
            ])
        }
        return true
    }
}
