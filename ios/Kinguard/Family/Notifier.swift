// Live family alerts: an in-app banner while Kinguard is open, plus a local notification
// if the app was just sent to the background. (Alerts while the app is fully closed would need
// remote push via APNs + Cloud Functions.)
import UIKit
import UserNotifications

@MainActor
enum Notifier {
    private static let delegate = ForegroundPresenter()

    static func requestPermission() {
        let center = UNUserNotificationCenter.current()
        center.delegate = delegate
        Task { _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge]) }
    }

    static func announce(_ alert: FamilyAlert, circleName: String) {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        // In the foreground the in-app banner is enough; otherwise post a local notification.
        guard UIApplication.shared.applicationState != .active else { return }
        let content = UNMutableNotificationContent()
        content.title = "\(alert.fromName) may have received a scam"
        content.body = "\(alert.headline). Risk \(alert.riskScore)/100 · \(circleName)"
        content.sound = .default
        let request = UNNotificationRequest(identifier: alert.id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

final class ForegroundPresenter: NSObject, UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }
}
