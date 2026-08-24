import AppIntents
import SwiftUI

/// "Hey Siri, make a call with Mynah — book a table for four on Friday."
///
/// The intent deliberately does not place the call. It carries the sentence
/// into the app and stops at the check step, which is the same rule the rest of
/// the product is built on: nothing is dialled that the person has not seen
/// written down. Siri is a faster way to reach the composer, not a way around
/// the one screen that catches a wrong number.
///
/// That is also why the errand is one free-text parameter rather than several
/// typed ones. Asking Siri for "business, date, party size" in turn is a form
/// read aloud, and it fails on the thing people actually say — a whole sentence
/// at once. The server already turns a sentence into a brief; this hands it the
/// sentence.
struct PlaceCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Make a call"
    static var description = IntentDescription(
        "Say what needs doing and the assistant will get the call ready for you to check."
    )

    /// Opens the app rather than finishing inside Siri. The check step is a
    /// screen with editable rows and a spoken opener on it; a Siri snippet
    /// cannot show that, and confirming a call in a surface that shows less
    /// than the app does is worse than not confirming it at all.
    static var openAppWhenRun = true

    @Parameter(
        title: "What needs doing",
        requestValueDialog: "What should the assistant call about?"
    )
    var errand: String

    @MainActor
    func perform() async throws -> some IntentResult {
        PendingSiriCall.shared.hand(over: errand)
        return .result()
    }
}

/// Where a phrase waits between Siri and the app.
///
/// `openAppWhenRun` brings the app forward, but the intent and the scene do not
/// share a view model — the app may be cold, and its state arrives after the
/// intent has finished. So the sentence is parked here and the root view claims
/// it when it appears. Written to UserDefaults rather than held in memory
/// because a cold launch runs the intent in a process that is about to be
/// replaced.
enum PendingSiriCall {
    static let shared = Store()

    struct Store {
        private let key = "pendingSiriErrand"

        func hand(over errand: String) {
            let trimmed = errand.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            UserDefaults.standard.set(trimmed, forKey: key)
        }

        /// Reads and clears in one step: a phrase is acted on once. Without the
        /// clear, every later launch would reopen the composer with a sentence
        /// the person said days ago.
        func claim() -> String? {
            guard let errand = UserDefaults.standard.string(forKey: key) else { return nil }
            UserDefaults.standard.removeObject(forKey: key)
            return errand
        }
    }
}

/// The phrases Siri accepts without anyone setting up a shortcut first.
///
/// Apple requires the app name in every phrase and substitutes it from the
/// bundle, so `applicationName` is what appears rather than a name written here.
///
/// English only in this file, and deliberately. Xcode's phrase extractor drops
/// non-ASCII from a literal: three Chinese phrases written here came out of the
/// build as `"\n ${applicationName} \n"` — the app name and the whitespace
/// around where the words had been. The build succeeds, the metadata looks
/// populated, and Siri simply never matches anything said in Chinese. The
/// literals below are keys; the spoken phrases for each language live in
/// Resources/<locale>.lproj/AppShortcuts.strings, which is the path Apple
/// documents for exactly this.
struct MynahShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: PlaceCallIntent(),
            phrases: [
                "Make a call with \(.applicationName)",
                "Call someone with \(.applicationName)",
                "Ask \(.applicationName) to call",
            ],
            shortTitle: "Make a call",
            systemImageName: "phone.arrow.up.right"
        )
    }
}
