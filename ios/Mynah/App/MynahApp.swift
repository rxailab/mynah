import SwiftUI

/// The one deployment this app talks to. Baked in rather than typed by the
/// person using it: there is one server, and a wrong address is a support
/// problem with no upside. Override for local work by editing this line — the
/// iOS counterpart of Android's `-Pvoicecall.serverUrl`.
enum Build {
    static let serverURL = "https://voice.rxstudio.co.uk"

    #if DEBUG
    static let debug = true
    #else
    static let debug = false
    #endif

    /// What Settings shows at the foot of the screen, straight from the bundle
    /// rather than a constant that can fall behind it.
    static let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    static let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
}

@main
struct MynahApp: App {
    // Inter and Roboto Mono are registered by the UIAppFonts key in Info.plist,
    // so they are loaded before the first view is drawn and nothing has to
    // register them here.
    @StateObject private var model = CallsViewModel()

    var body: some Scene {
        WindowGroup {
            VoiceCallApp(model: model)
                // The palette is load-bearing — lime is the one action, amber is
                // "you are needed", red ends a call — so the design is a fixed
                // light scheme in both system modes, as on Android.
                .preferredColorScheme(.light)
                .environment(\.locale, model.language.locale ?? Locale.current)
        }
    }
}
