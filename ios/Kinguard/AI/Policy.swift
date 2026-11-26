// Routing policy, shared with the web app and tunable live in Firebase Remote Config.
import FirebaseRemoteConfig
import Foundation

struct Policy: Sendable {
    var deepCheckThreshold = 35
    var familyAlertThreshold = 70
    var hybridCloudModel = "gemini-3.5-flash-lite"
    var deepCheckModel = "gemini-3.8-flash"
    var deepCheckFallbackModel = "gemini-3.5-flash-lite"
    var escalateLowConfidence = true
    /// Apple's on-device model has a ~4K-token context window.
    var maxInputChars = 3000

    @MainActor
    static func load() async -> Policy {
        var p = Policy()
        let rc = RemoteConfig.remoteConfig()
        let settings = RemoteConfigSettings()
        settings.minimumFetchInterval = 3600
        rc.configSettings = settings
        rc.setDefaults([
            "deep_check_threshold": NSNumber(value: p.deepCheckThreshold),
            "family_alert_threshold": NSNumber(value: p.familyAlertThreshold),
            "hybrid_cloud_model": p.hybridCloudModel as NSString,
            "deep_check_model": p.deepCheckModel as NSString,
            "deep_check_fallback_model": p.deepCheckFallbackModel as NSString,
            "escalate_low_confidence": NSNumber(value: p.escalateLowConfidence),
        ])
        _ = try? await rc.fetchAndActivate()
        let defaults = Policy()
        func num(_ key: String, _ fallback: Int) -> Int {
            let v = rc[key].numberValue.intValue
            return v > 0 ? v : fallback
        }
        func str(_ key: String, _ fallback: String) -> String {
            let v = rc[key].stringValue
            return v.isEmpty ? fallback : v
        }
        p.deepCheckThreshold = num("deep_check_threshold", defaults.deepCheckThreshold)
        p.familyAlertThreshold = num("family_alert_threshold", defaults.familyAlertThreshold)
        p.hybridCloudModel = str("hybrid_cloud_model", defaults.hybridCloudModel)
        p.deepCheckModel = str("deep_check_model", defaults.deepCheckModel)
        p.deepCheckFallbackModel = str("deep_check_fallback_model", defaults.deepCheckFallbackModel)
        p.escalateLowConfidence = rc["escalate_low_confidence"].boolValue
        return p
    }
}
