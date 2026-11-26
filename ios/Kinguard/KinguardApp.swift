import FirebaseAppCheck
import FirebaseCore
import GoogleSignIn
import SwiftUI

@main
struct KinguardApp: App {
    @State private var model: AppModel
    @State private var family: FamilyStore

    init() {
        // App Check must be configured before FirebaseApp.configure().
        // Debug provider for the Simulator/development: register the token printed in the Xcode console
        // under Firebase console → App Check → Apps → Manage debug tokens.
        #if DEBUG || targetEnvironment(simulator)
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(KinguardAppCheckFactory())
        #endif
        FirebaseApp.configure()
        _model = State(initialValue: AppModel())
        _family = State(initialValue: FamilyStore())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(family)
                .task { await model.bootstrap() }
                .onOpenURL { url in
                    _ = GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}

/// Release builds on real devices use App Attest.
final class KinguardAppCheckFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> (any AppCheckProvider)? {
        AppAttestProvider(app: app)
    }
}
