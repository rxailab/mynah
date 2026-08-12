import Foundation
import UserNotifications

/// Follows one live call so the phone can say "you're needed" without the app
/// being on screen.
///
/// The Android app does this with a foreground service. iOS has no such thing:
/// a socket cannot be held open indefinitely from the background without a VoIP
/// push entitlement and a server that sends one. So the watch runs for as long
/// as the app is alive — the whole of a call you are watching, and the few
/// minutes iOS grants after it goes to the background — and posts a local
/// notification the moment the assistant starts transferring, and another when
/// the call ends. Anything longer than that needs push, which is a server
/// change as much as an app one.
@MainActor
final class CallWatch {
    static let shared = CallWatch()

    private let api = VoiceCallAPI()
    private var tasks: [String: Task<Void, Never>] = [:]

    private init() {}

    /// Asked for on arrival at the feed, not at launch. Notifications here are
    /// about calls in progress, and there is nothing to say about a call to
    /// somebody who has not yet seen what the app does.
    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func start(settings: ServerSettings, callId: String) {
        guard settings.isSignedIn, tasks[callId] == nil else { return }
        tasks[callId] = Task { [weak self] in
            await self?.follow(settings: settings, callId: callId)
            self?.tasks[callId] = nil
        }
    }

    func stopAll() {
        tasks.values.forEach { $0.cancel() }
        tasks.removeAll()
    }

    private func follow(settings: ServerSettings, callId: String) async {
        var transferNotified = false
        var backoff: UInt64 = 2_000_000_000

        while !Task.isCancelled {
            if let snapshot = try? await api.getCall(settings, id: callId) {
                if react(snapshot, alreadyNotified: transferNotified) { transferNotified = true }
                if !snapshot.isLive { return }
            }

            var finished = false
            if let feed = try? api.liveFeed(settings, callId: callId) {
                for await event in feed {
                    guard let call = event.call, call.id == callId else { continue }
                    if react(call, alreadyNotified: transferNotified) { transferNotified = true }
                    if !call.isLive {
                        finished = true
                        break
                    }
                }
            }
            if finished || Task.isCancelled { return }

            // Socket dropped on a call that may still be running: check again.
            try? await Task.sleep(nanoseconds: backoff)
            backoff = min(backoff * 2, 15_000_000_000)
        }
    }

    /// Returns true when the needs-you alert was just posted.
    private func react(_ call: Call, alreadyNotified: Bool) -> Bool {
        if call.status == CallStatus.transferring, !alreadyNotified {
            post(
                id: "needs-you-\(call.id)",
                title: t("notif_needs_you_title", call.businessName),
                body: t("subline_transfer"),
                callId: call.id,
                urgent: true
            )
            return true
        }

        if !call.isLive {
            UNUserNotificationCenter.current()
                .removeDeliveredNotifications(withIdentifiers: ["needs-you-\(call.id)"])
            let failed = call.status == CallStatus.failed
            post(
                id: "result-\(call.id)",
                title: failed
                    ? t("notif_no_answer_title", call.businessName)
                    : t("notif_done_title", call.businessName),
                body: call.summary ?? call.error ?? call.goal,
                callId: call.id,
                urgent: false
            )
        }
        return false
    }

    private func post(id: String, title: String, body: String, callId: String, urgent: Bool) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.userInfo = ["callId": callId]
        content.sound = urgent ? .default : nil
        if urgent { content.interruptionLevel = .timeSensitive }
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: id, content: content, trigger: nil)
        )
    }
}
