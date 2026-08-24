import SwiftUI
import UIKit

/// Everything that can be pushed over Home. Home itself is the root, so it is
/// not in here — there is no tab bar in this design and no second root.
enum Route: Hashable {
    case compose
    case search
    case notifications
    case templates
    case businesses
    case usage
    case help
    case scheduled
    case whoFor
    case changePassword
    case resetCode
    case newPassword
    case scheduleTime
    case settings
    case confirm
    case verifyNumber
    case call(String)
    case detail(String)
    case share(String)
    case feedback(String)
}

/// The screens before there is a session. A stack of its own, because crossing
/// the sign-in gate replaces everything rather than pushing over it.
private enum SignInRoute: Hashable {
    case email
    case resetCode
    case newPassword
}

struct VoiceCallApp: View {
    @ObservedObject var model: CallsViewModel

    /// Introduce, then sign in, then the one question the assistant cannot work
    /// without.
    private enum Gate {
        case welcome, signIn, profile, app
    }

    @State private var gate: Gate
    @State private var path: [Route] = []
    @State private var signInPath: [SignInRoute] = []
    @State private var coachTargets = CoachTargets()

    /// The opening screen is decided here rather than in `onAppear`, because
    /// the first frame is already drawn by then: a feed built for one frame
    /// asks for the notification permission, and that question over the welcome
    /// slide is a question with no reason attached.
    init(model: CallsViewModel) {
        self.model = model
        _gate = State(initialValue: {
            if !model.firstRun.welcomeSeen { return .welcome }
            if !model.settings.isSignedIn { return .signIn }
            if !model.firstRun.profilePrompted { return .profile }
            return .app
        }())
    }

    var body: some View {
        content
            .onAppear {
                if model.settings.isSignedIn { model.loadAccount() }
            }
            // Crossing the gate in either direction moves the whole stack.
            // Signing in is obvious; signing out is not always a button — a
            // session expires, or is ended elsewhere, and whatever is on screen
            // then is showing somebody's calls that the app can no longer prove
            // belong to them.
            .onChange(of: model.settings.isSignedIn) { _, signedIn in
                path = []
                signInPath = []
                if signedIn {
                    model.loadAccount()
                    gate = model.firstRun.profilePrompted ? .app : .profile
                } else {
                    gate = .signIn
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch gate {
        case .welcome:
            WelcomeScreen {
                model.finishWelcome()
                gate = model.settings.isSignedIn ? .app : .signIn
            }
            .background(Ink.canvas)

        case .signIn:
            NavigationStack(path: $signInPath) {
                SignInScreen(model: model) { signInPath.append(.email) }
                    .edgeSwipeBack()
            // A phrase said to Siri lands here. Claimed on appear and again
            // when the app comes back to the front: the first covers a cold
            // launch, the second covers the app having been in the background,
            // where onAppear does not fire again.
            .onAppear { claimSiriErrand() }
            .onReceive(
                NotificationCenter.default.publisher(
                    for: UIApplication.didBecomeActiveNotification
                )
            ) { _ in claimSiriErrand() }
                    .navigationDestination(for: SignInRoute.self) { route in
                        signInScreen(route)
                    }
            }

        case .profile:
            ProfileSetupScreen(model: model) { savedNumber in
                model.finishProfilePrompt()
                gate = .app
                // Nothing to verify for someone who skipped the number; that
                // step is offered again in Settings.
                if savedNumber { path = [.verifyNumber] }
            }

        case .app:
            main
        }
    }

    @ViewBuilder
    private func signInScreen(_ route: SignInRoute) -> some View {
        switch route {
        case .email:
            EmailSignInScreen(
                model: model,
                onBack: {
                    signInPath.removeLast()
                    model.clearSignInError()
                },
                onForgot: { signInPath.append(.resetCode) }
            )
        case .resetCode:
            ResetCodeScreen(
                model: model,
                onBack: {
                    signInPath.removeLast()
                    model.clearReset()
                },
                onEntered: { signInPath.append(.newPassword) }
            )
        case .newPassword:
            // Already signed in by the time this finishes, and the gate change
            // clears the stack behind it.
            NewPasswordScreen(
                model: model,
                onBack: { signInPath.removeLast() },
                onDone: {}
            )
        }
    }

    /// Takes whatever Siri parked and opens the composer on it.
    ///
    /// Straight to the composer rather than dialling: the sentence still has to
    /// go through parsing and the check step, which is where a misheard number
    /// or a wrong day gets caught. Siri saves the typing, not the checking.
    private func claimSiriErrand() {
        guard let errand = PendingSiriCall.shared.claim() else { return }
        guard model.settings.isSignedIn else { return }
        model.seedComposer(errand)
        // Replace rather than append: arriving from Siri should not leave a
        // stack of screens behind the composer for someone who was never in
        // the app to begin with.
        path = [.compose]
    }

    private var main: some View {
        NavigationStack(path: $path) {
            RootTabs(
                model: model,
                onOpenCall: { path.append(.call($0)) },
                onOpenDetail: { path.append(.detail($0)) },
                onCompose: { path.append(.compose) },
                // Same door as a template: the composer opens with the sentence
                // already in it, so the first screen is a thing to edit rather
                // than a blank box asking you to think of something.
                onComposeWith: { seed in
                    model.seedComposer(seed)
                    path.append(.compose)
                },
                onSearch: { path.append(.search) },
                onUsage: { path.append(.usage) },
                onSettings: { path.append(.settings) }
            )
            .edgeSwipeBack()
            .navigationDestination(for: Route.self) { route in
                screen(route)
                    .toolbar(.hidden, for: .navigationBar)
                    .background(Ink.canvas)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .background(Ink.canvas)
        .overlay {
            // The tour explains the composer, so it runs the first time the
            // composer is opened rather than on first sight of the feed. Drawn
            // above the stack because the scrim covers the whole screen.
            if path.last == .compose, !model.firstRun.coachSeen {
                HomeCoach(targets: coachTargets, onFinished: model.finishCoach)
            }
        }
    }

    @ViewBuilder
    private func screen(_ route: Route) -> some View {
        switch route {
        case .compose:
            ComposeScreen(
                model: model,
                onBack: {
                    pop()
                    model.clearParse()
                },
                onParsed: { path.append(.confirm) },
                onVerifyNumber: { path.append(.verifyNumber) },
                onCoachTargets: { coachTargets = $0 }
            )

        case .search:
            SearchScreen(
                model: model,
                onBack: pop,
                onOpenCall: { path.append(.call($0)) },
                onOpenDetail: { path.append(.detail($0)) }
            )

        case .notifications:
            NotificationsScreen(
                model: model,
                onBack: pop,
                onOpenCall: { path.append(.call($0)) },
                onOpenDetail: { path.append(.detail($0)) }
            )

        case .templates:
            TemplatesScreen(model: model, onBack: pop, onCompose: {
                // Replace this screen rather than stack on it: going back from
                // the composer belongs at the feed, not at the list you picked
                // from.
                path.removeLast()
                path.append(.compose)
            })

        case .businesses:
            BusinessesScreen(model: model, onBack: pop, onCompose: {
                path.removeLast()
                path.append(.compose)
            })

        case .usage:
            UsageScreen(model: model, onBack: pop)

        case .help:
            HelpScreen(onBack: pop, onContact: openSupportEmail)

        case .scheduled:
            ScheduledScreen(
                model: model,
                onBack: pop,
                onCompose: { path.append(.compose) },
                // "Check and call" is the ordinary path, not a shortcut past it:
                // the task's brief goes into the composer and the check step
                // happens as always.
                onConfirm: { task in
                    model.seedComposer(task.goal)
                    model.dismissScheduled(task.id)
                    path.append(.compose)
                }
            )

        case .whoFor:
            WhoForScreen(model: model, onBack: pop, onVerifyNumber: { path.append(.verifyNumber) })

        case .changePassword:
            ChangePasswordScreen(model: model, onBack: pop, onForgot: {
                // Signed in but unable to remember the current one. The emailed
                // code proves the address just as well, and it is the account's
                // own address either way.
                if let address = model.account?.email {
                    model.sendResetCode(address) { path.append(.resetCode) }
                }
            })

        case .resetCode:
            ResetCodeScreen(
                model: model,
                onBack: {
                    pop()
                    model.clearReset()
                },
                onEntered: { path.append(.newPassword) }
            )

        case .newPassword:
            // Already signed in, so this only sets the password: back to the
            // feed rather than through the sign-in gate.
            NewPasswordScreen(model: model, onBack: pop, onDone: { path = [] })

        case .scheduleTime:
            ScheduleTimeScreen(model: model, onBack: pop, onScheduled: {
                // Straight to the list it was just added to, with the composer
                // and check steps left behind.
                path = [.scheduled]
            })

        case .settings:
            SettingsScreen(
                model: model,
                onBack: pop,
                onVerifyNumber: { path.append(.verifyNumber) },
                onTemplates: { path.append(.templates) },
                onBusinesses: { path.append(.businesses) },
                onUsage: { path.append(.usage) },
                onHelp: { path.append(.help) },
                onScheduled: { path.append(.scheduled) },
                onWhoFor: { path.append(.whoFor) },
                onChangePassword: { path.append(.changePassword) }
            )

        case .confirm:
            ConfirmScreen(
                model: model,
                // Pop first, then drop the brief: clearing it while this screen
                // is still on the stack makes it ask to go back a second time.
                onBack: {
                    pop()
                    model.clearParse()
                },
                onPlaced: { id in path = [.call(id)] },
                // Out of calls. The brief is left exactly as it is, so topping
                // up and coming back dials what they already wrote rather than
                // making them write it again.
                onNeedsTopUp: { path.append(.usage) },
                onCallLater: { path.append(.scheduleTime) }
            )

        // Offered once the number is known, since it is that number being
        // verified. Skipping only defers it: no call can be placed until this
        // is done.
        case .verifyNumber:
            VerifyNumberScreen(model: model, onDone: pop)

        case let .call(id):
            CallScreen(
                model: model,
                callId: id,
                onFinished: { finished in path = [.detail(finished)] },
                onClose: { path = [] }
            )

        case let .detail(id):
            DetailScreen(
                model: model,
                callId: id,
                onBack: pop,
                onRedialled: { path.append(.call($0)) },
                onShare: { path.append(.share(id)) },
                onFeedback: { path.append(.feedback(id)) }
            )

        case let .share(id):
            ShareCardScreen(model: model, callId: id, onBack: pop)

        case let .feedback(id):
            FeedbackScreen(model: model, callId: id, onBack: pop, onSent: pop)
        }
    }

    private func pop() {
        if path.isEmpty { return }
        path.removeLast()
    }
}

/// Hands the support address to whatever the phone uses for email. Silently
/// does nothing when there is no mail app — a crash is a worse answer to
/// "contact us" than no answer.
private func openSupportEmail() {
    guard let url = URL(string: "mailto:\(t("support_email"))") else { return }
    UIApplication.shared.open(url)
}
