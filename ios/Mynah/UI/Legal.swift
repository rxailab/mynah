import SwiftUI
import UIKit

/// The published terms and privacy policy.
///
/// They live on the server rather than in the app for two reasons: a store
/// listing has to link to the privacy policy at a public URL, and a correction
/// has to reach people who are not going to install an update to read it.
enum Legal {
    static let terms = "terms"
    static let privacy = "privacy"

    /// Opens one of the documents in the browser, in whichever language the app
    /// is currently showing.
    static func open(_ document: String, language: Language) {
        let chinese = (language.locale ?? Locale.current).language.languageCode?.identifier == "zh"
        guard let url = URL(string: "\(Build.serverURL)/legal/\(document)?lang=\(chinese ? "zh" : "en")")
        else { return }
        UIApplication.shared.open(url)
    }
}
