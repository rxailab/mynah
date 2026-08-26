import AppIntents
import SwiftUI

/// "Hey Siri, start an errand with Mynah" — and the composer is open, waiting.
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

    /// Optional, and that is the whole reason Siri works at all.
    ///
    /// It was required, with a `requestValueDialog` to ask for it. Tapping the
    /// shortcut was fine — Shortcuts puts up a text field — but by voice Siri
    /// would only ever answer that the app does not support this yet. A spoken
    /// run has to resolve every required parameter before it can start, and
    /// this intent opens the app the moment it starts, so there is no point at
    /// which Siri can hold the line and ask. An intent it cannot complete is
    /// one it declines to offer.
    ///
    /// Nothing is lost by letting it be empty. The errand was never going to be
    /// dialled off the back of one spoken sentence: it lands on the check
    /// screen either way, and an empty one opens the composer with the keyboard
    /// up, which is where the sentence was going to be typed anyway.
    @Parameter(title: "What needs doing")
    var errand: String?

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

        /// Always writes, even for an empty errand. The mark is what tells the
        /// app it was started by a phrase rather than by a tap on the icon, and
        /// that is worth knowing on its own: someone who said "start an errand"
        /// should land on the composer with the keyboard up, not on the board
        /// wondering whether Siri heard them. The text, when there is any, is a
        /// head start on top of that.
        func hand(over errand: String?) {
            let trimmed = errand?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            UserDefaults.standard.set(trimmed, forKey: key)
        }

        /// Reads and clears in one step: a phrase is acted on once. Without the
        /// clear, every later launch would reopen the composer with a sentence
        /// the person said days ago. An empty string is a real answer here —
        /// "they came from Siri and said nothing more" — so only a missing key
        /// means no.
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
/// Two vocabularies on purpose. "Call" is what people reach for, and "errand"
/// is what this actually is — but the reason both are here is that a phrase
/// built on "call" may collide with the telephony domain Siri already owns, the
/// one behind "call Mum on WhatsApp", where the question becomes whether this
/// is a phone app. That was a guess that turned out not to be the blocker; it
/// is still a real risk, so the errand wording stays as the path that cannot
/// collide, and the call wording stays because it is what gets said out loud.
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
                "Start an errand with \(.applicationName)",
                "New errand with \(.applicationName)",
                "Ask \(.applicationName) to sort something out",
                // Three more slots carrying the Chinese phrases. Both .strings
                // files fill all six, because the system picks the .lproj by
                // device language while Siri matches in its own: a phone set to
                // English with Siri set to Chinese reads en.lproj, and a Chinese
                // phrase that exists only in zh-Hans is unreachable there.
                "\(.applicationName) errand",
                "\(.applicationName) handle something",
                "\(.applicationName) do something for me",
            ],
            shortTitle: "Start an errand",
            systemImageName: "phone.arrow.up.right"
        )
    }
}
