import SwiftUI

/// Say what needs doing, in one sentence.
///
/// This used to be the home screen. In the redesign home is the feed of what the
/// assistant has been doing, and composing a call is a thing you go and do — so
/// the composer moved here, behind the bar at the foot of the feed.
///
/// Nothing is dialled from here: the sentence goes to the server to be turned
/// into a brief, and the brief is checked on the next screen before anything
/// rings.
struct ComposeScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onParsed: () -> Void
    var onVerifyNumber: () -> Void = {}
    /// Measured here, drawn by the app shell. The first-run tour is about the
    /// composer, so it followed the composer to this screen.
    var onCoachTargets: (CoachTargets) -> Void = { _ in }

    @State private var text = ""
    @State private var navigatedFor: Brief?
    @State private var targets = CoachTargets()
    @StateObject private var dictation = Dictation()

    private var parsing: Bool { model.parse == .running }
    private var canParse: Bool { text.trimmed.count >= 5 && !parsing }

    /// Calls go out under your own number or not at all, so there is no point
    /// letting someone write a brief the server will refuse to dial. Said here,
    /// at the top, rather than as an error after they have done the work.
    private var blocked: Bool {
        guard let profile = model.profile else { return false }
        return !profile.canCall
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("compose_title"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if blocked {
                        VerifyFirstCard(onVerify: onVerifyNumber)
                        Spacer().frame(height: 14)
                    }

                    composer

                    Spacer().frame(height: 12)
                    HStack(spacing: 7) {
                        OutlineChip(label: t("home_example_1")) { text = t("home_example_1") }
                        OutlineChip(label: t("home_example_2")) { text = t("home_example_2") }
                    }

                    if case let .failed(reason) = model.parse {
                        Spacer().frame(height: 14)
                        ErrorCard(message: reason) { model.clearParse() }
                    }
                    if let error = model.error {
                        Spacer().frame(height: 14)
                        ErrorCard(message: error) { model.clearError() }
                    }

                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
            }
            .scrollDismissesKeyboard(.interactively)

            PrimaryButton(
                label: t(parsing ? "action_parsing" : "action_next_check"),
                action: { model.parseRequest(text.trimmed) },
                enabled: canParse && !blocked,
                leading: {
                    if parsing { Spinner(colour: Ink.onLime, size: 15) }
                }
            )
            .trackFrame(track(\.action))
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        // A template or a saved business left something for us. Taken once and
        // cleared, so coming back to this screen does not retype it over an edit.
        .onAppear { takeSeed() }
        .onChange(of: model.composerSeed) { _, _ in takeSeed() }
        // Dictation adds to whatever is in the box, so it drives the field
        // while it is running and lets go the moment it stops.
        .onChange(of: dictation.text) { _, heard in
            if dictation.listening { text = heard }
        }
        // A parse that succeeds moves on; the confirm screen reads the same
        // state. Guarded, because coming back from Confirm re-evaluates this
        // while the state is still ready — without it you bounce straight
        // forward again.
        .onChange(of: model.parse) { _, state in
            guard let ready = state.brief else {
                navigatedFor = nil
                return
            }
            if ready != navigatedFor {
                navigatedFor = ready
                onParsed()
            }
        }
    }

    private var composer: some View {
        WiseCard(radius: 16) {
            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(t("home_placeholder"))
                            .wise(Type.body)
                            .foregroundStyle(Ink.mute)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                    }
                    TextEditor(text: $text)
                        .wise(Type.body)
                        .foregroundStyle(Ink.text)
                        .tint(Ink.text)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 96)
                        .onChange(of: text) { _, _ in
                            if model.parse != .idle { model.clearParse() }
                        }
                }

                Spacer().frame(height: 8)
                Rule()
                Spacer().frame(height: 8)

                // The promise and the microphone share a line: the reason to
                // keep talking sits right next to the way to do it.
                HStack(spacing: 0) {
                    if dictation.listening {
                        Waveform(barCount: 4, period: 0.9, stagger: 0.15, colour: Ink.deep)
                            .frame(height: 13)
                        Spacer().frame(width: 9)
                        Text(t("mic_release"))
                            .wise(Type.tiny)
                            .foregroundStyle(Ink.deep)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        Text(t("compose_no_guessing"))
                            .wise(Type.tiny)
                            .foregroundStyle(Ink.mute)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if dictation.available(for: model.language) {
                        Spacer().frame(width: 10)
                        micButton
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 12)
        }
        .trackFrame(track(\.composer))
    }

    private var micButton: some View {
        ZStack {
            if dictation.listening {
                PulseRings(colour: Ink.lime, period: 1.4).frame(width: 40, height: 40)
            }
            Icon(Wise.mic, size: 17)
                .foregroundStyle(Ink.text)
                .frame(width: 36, height: 36)
                .background(dictation.listening ? Ink.lime : Ink.canvasSoft, in: Circle())
                .trackFrame(track(\.mic))
        }
        .frame(width: 40, height: 40)
        .accessibilityLabel(t("mic_hold"))
        // Press and hold: a drag gesture with no distance is the only way to
        // learn about the release as well as the press.
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !dictation.listening {
                        dictation.start(from: text, language: model.language)
                    }
                }
                .onEnded { _ in dictation.stop() }
        )
    }

    private func takeSeed() {
        guard let seed = model.composerSeed else { return }
        text = seed
        model.clearComposerSeed()
    }

    /// Reported as a set so the overlay never sees a half-measured screen.
    private func track(_ field: WritableKeyPath<CoachTargets, CGRect>) -> (CGRect) -> Void {
        { rect in
            var next = targets
            next[keyPath: field] = rect
            guard next != targets else { return }
            targets = next
            onCoachTargets(next)
        }
    }
}

/// Shown when the account has no verified number.
///
/// Amber rather than red: nothing has gone wrong, there is simply a step
/// missing, and it explains why the step exists rather than just demanding it.
/// Under this design there is no shared number to fall back on — a business rung
/// by the assistant has to be able to ring back and reach a person.
private struct VerifyFirstCard: View {
    let onVerify: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(t("compose_needs_callerid_title"))
                .wise(Type.rowTitle)
                .foregroundStyle(Ink.warningInk)
            Spacer().frame(height: 4)
            Text(t("compose_needs_callerid_body"))
                .wise(Type.rowSub)
                .foregroundStyle(Ink.warningInk)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 12)
            Text(t("callerid_start"))
                .wise(Type.chipStrong)
                .foregroundStyle(Ink.warningInk)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Ink.warningInk, lineWidth: 1.5)
                )
                .contentShape(Rectangle())
                .onTapGesture(perform: onVerify)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Ink.warning, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

extension View {
    /// Reports this view's frame in screen coordinates, for the tour to point at.
    func trackFrame(_ report: @escaping (CGRect) -> Void) -> some View {
        background(
            GeometryReader { geometry in
                Color.clear
                    .onAppear { report(geometry.frame(in: .global)) }
                    .onChange(of: geometry.frame(in: .global)) { _, frame in report(frame) }
            }
        )
    }
}
