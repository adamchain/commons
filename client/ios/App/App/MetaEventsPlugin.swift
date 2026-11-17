import AppTrackingTransparency
import Capacitor
import FBSDKCoreKit
import UIKit

/// Meta app events stay off until the App ID and client token from the Meta
/// developer dashboard are in Info.plist. Those values are not in the repo.
enum MetaAppEvents {
    static var isConfigured: Bool {
        let appId = (Bundle.main.object(forInfoDictionaryKey: "FacebookAppID") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let token = (Bundle.main.object(forInfoDictionaryKey: "FacebookClientToken") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return appId.range(of: #"^\d{5,20}$"#, options: .regularExpression) != nil && !token.isEmpty
    }

    static func start(_ application: UIApplication, launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
        guard isConfigured else { return }
        Settings.shared.isAutoLogAppEventsEnabled = true
        Settings.shared.isAdvertiserIDCollectionEnabled = true
        ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    static func open(_ app: UIApplication, url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) -> Bool {
        guard isConfigured else { return false }
        return ApplicationDelegate.shared.application(app, open: url, options: options)
    }

    static func becomeActive() {
        guard isConfigured else { return }
        ATTrackingManager.requestTrackingAuthorization { _ in
            AppEvents.shared.activateApp()
        }
    }

    static func logCompleteRegistration() {
        guard isConfigured else { return }
        AppEvents.shared.logEvent(.completedRegistration, parameters: [
            AppEvents.ParameterName.registrationMethod: "phone",
        ])
    }
}

@objc(MetaEventsPlugin)
public class MetaEventsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MetaEventsPlugin"
    public let jsName = "MetaEvents"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "logCompleteRegistration", returnType: CAPPluginReturnPromise),
    ]

    @objc func logCompleteRegistration(_ call: CAPPluginCall) {
        MetaAppEvents.logCompleteRegistration()
        call.resolve()
    }
}
