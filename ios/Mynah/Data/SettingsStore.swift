import Foundation
import Security

/// Where the server is, and the session that proves who is asking.
///
/// The address is fixed at build time — there is one deployment, and letting
/// someone retype it only ever produces a broken install. The token is the one
/// thing that varies: it arrives from signing in and is dropped on sign-out.
struct ServerSettings: Equatable {
    var baseURL: String = Build.serverURL
    var apiToken: String = ""

    var isSignedIn: Bool { !apiToken.isBlank }

    /// `https://host` with no trailing slash, or nil if it is unusable.
    func normalisedBase() -> String? {
        var trimmed = baseURL.trimmed
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        if trimmed.isEmpty { return nil }
        let withScheme = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
            ? trimmed
            : "https://\(trimmed)"
        if withScheme.hasPrefix("https://") { return withScheme }
        // Debug builds may point at a dev server over plain HTTP so the app can
        // be exercised from a simulator against localhost. Release builds
        // reject cleartext outright, here and in App Transport Security.
        return Build.debug ? withScheme : nil
    }
}

/// The three things that only happen once. Read together because the screen the
/// app opens on depends on all of them.
///
/// All of them survive signing out: someone who has seen the carousel does not
/// want it again just because their session expired.
struct FirstRun: Equatable {
    var welcomeSeen = false
    /// The "who it calls for" step. Skipping counts as seen — it is offered once.
    var profilePrompted = false
    var coachSeen = false
}

/// Reads and writes the handful of things the app remembers between launches.
///
/// The session token lives in the keychain rather than in defaults: it is a
/// credential, it is the only thing here that is worth stealing, and the
/// keychain is the one store on this platform that is not simply a file in the
/// app's container. Everything else is a preference and lives in defaults.
final class SettingsStore {
    private let defaults = UserDefaults.standard

    private enum Key {
        static let language = "language"
        static let onboarded = "onboarded"
        static let profilePrompted = "profile_prompted"
        static let coachSeen = "coach_seen"
        static let token = "api_token"
    }

    func settings() -> ServerSettings {
        ServerSettings(apiToken: Keychain.read(Key.token) ?? "")
    }

    func language() -> Language { Language.of(defaults.string(forKey: Key.language)) }

    func firstRun() -> FirstRun {
        FirstRun(
            welcomeSeen: defaults.bool(forKey: Key.onboarded),
            profilePrompted: defaults.bool(forKey: Key.profilePrompted),
            coachSeen: defaults.bool(forKey: Key.coachSeen)
        )
    }

    func saveToken(_ token: String) {
        let trimmed = token.trimmed
        if trimmed.isEmpty { Keychain.delete(Key.token) } else { Keychain.write(Key.token, trimmed) }
    }

    func saveLanguage(_ language: Language) {
        defaults.set(language.rawValue, forKey: Key.language)
    }

    func markOnboarded() { defaults.set(true, forKey: Key.onboarded) }
    func markProfilePrompted() { defaults.set(true, forKey: Key.profilePrompted) }
    func markCoachSeen() { defaults.set(true, forKey: Key.coachSeen) }
}

/// The smallest keychain wrapper that does the job: one generic-password item
/// per key, readable only once the device has been unlocked since boot.
enum Keychain {
    private static let service = Bundle.main.bundleIdentifier ?? "com.voicecall.mynah"

    private static func query(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    static func read(_ key: String) -> String? {
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ key: String, _ value: String) {
        let data = Data(value.utf8)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(query(key) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query(key)
            insert.merge(attributes) { current, _ in current }
            SecItemAdd(insert as CFDictionary, nil)
        }
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}
