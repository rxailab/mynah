import Foundation
import SwiftUI

/// Which language the app's own text is in. Deliberately separate from the
/// language the assistant speaks on a call: that has to match whoever is being
/// rung, not whoever is holding the phone.
enum Language: String, CaseIterable, Identifiable {
    case system
    case english = "en"
    case chinese = "zh"

    var id: String { rawValue }

    /// The bundle directory this choice reads its strings from. Nil for
    /// ``system``, which means "whatever iOS picked".
    var lproj: String? {
        switch self {
        case .system: nil
        case .english: "en"
        case .chinese: "zh-Hans"
        }
    }

    var locale: Locale? {
        switch self {
        case .system: nil
        case .english: Locale(identifier: "en")
        case .chinese: Locale(identifier: "zh-Hans")
        }
    }

    static func of(_ id: String?) -> Language {
        allCases.first { $0.rawValue == id } ?? .system
    }
}

/// Resolves strings in whatever language is currently selected.
///
/// The bundle is swapped rather than the app restarted, which is the iOS
/// counterpart of the Android app's localised `Context`: everything reads its
/// text through ``t(_:)`` at draw time, so a change here reaches the whole tree
/// on the next pass.
enum Localizer {
    private static var bundle: Bundle = .main

    static func use(_ language: Language) {
        guard let lproj = language.lproj,
              let path = Bundle.main.path(forResource: lproj, ofType: "lproj"),
              let localised = Bundle(path: path)
        else {
            bundle = .main
            return
        }
        bundle = localised
    }

    static func string(_ key: String) -> String {
        let value = bundle.localizedString(forKey: key, value: nil, table: nil)
        #if DEBUG
        if value == key { print("⚠️ missing string: \(key)") }
        #endif
        return value
    }
}

/// One string, in the interface language. Keys are the Android resource names,
/// so the two apps share one glossary — see ios/tools/strings_from_android.py.
func t(_ key: String) -> String { Localizer.string(key) }

/// A string with the one argument its Android original declares.
func t(_ key: String, _ argument: CVarArg) -> String {
    String(format: Localizer.string(key), argument)
}

/// The interface language a `Text` is drawn in, so number and date formatting
/// follows the same choice the words do.
extension View {
    func localised(_ language: Language) -> some View {
        environment(\.locale, language.locale ?? Locale.current)
    }
}
