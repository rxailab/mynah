import SwiftUI

private let slideCount = 3

/// Three slides before the sign-in screen.
///
/// The illustrations are the app's own call screen and confirm card, rebuilt at
/// a smaller size — the design is explicit that onboarding must not introduce a
/// graphic language the rest of the app then fails to live up to. What you are
/// shown here is what you get.
struct WelcomeScreen: View {
    let onDone: () -> Void

    @State private var page = 0

    private var last: Bool { page == slideCount - 1 }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                BrandMark()
                Spacer()
                // Gone on the last slide: there is nothing left to skip past.
                if !last {
                    LinkText(t("action_skip"), style: Type.linkSmall, action: onDone)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)

            TabView(selection: $page) {
                ForEach(0..<slideCount, id: \.self) { index in
                    slide(index).tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            HStack(spacing: 7) {
                ForEach(0..<slideCount, id: \.self) { index in
                    // The active dot stretches into a bar rather than a new
                    // shape appearing, so the row never jumps.
                    Capsule()
                        .fill(index == page ? Ink.text : Ink.rim)
                        .frame(width: index == page ? 20 : 7, height: 7)
                        .animation(.easeOut(duration: 0.2), value: page)
                }
            }
            .padding(.top, 24)
            .padding(.bottom, 20)

            PrimaryButton(t(last ? "action_get_started" : "action_next")) {
                if last {
                    onDone()
                } else {
                    withAnimation { page += 1 }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
    }

    @ViewBuilder
    private func slide(_ page: Int) -> some View {
        VStack(spacing: 0) {
            Group {
                switch page {
                case 0: LiveCallSample()
                case 1: ConfirmSample()
                default: BilingualSample()
                }
            }
            .frame(maxHeight: .infinity)
            .padding(.horizontal, 28)
            .padding(.vertical, 10)

            VStack(alignment: .leading, spacing: 14) {
                Text(t("welcome_title_\(page + 1)"))
                    .wise(Type.display)
                    .foregroundStyle(Ink.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text(t("welcome_body_\(page + 1)"))
                    .wise(Type.body)
                    .foregroundStyle(Ink.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 28)
        }
    }
}

// MARK: - the three illustrations

private struct LiveCallSample: View {
    var body: some View {
        DarkPanel {
            HStack(spacing: 7) {
                PulsingDot(colour: Ink.lime, size: 7)
                Text(t("status_on_the_call")).wise(Type.chip).foregroundStyle(Ink.onDark)
                Text("02:41").wise(Type.monoBody).foregroundStyle(Ink.onDarkMute)
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 7)
            .background(Ink.onDarkWash, in: Capsule())
            .frame(maxWidth: .infinity)

            Spacer().frame(height: 16)
            SampleBubble(
                speaker: t("speaker_assistant"),
                text: t("welcome_line_assistant_1"),
                translation: t("welcome_line_assistant_1_sub"),
                fromAssistant: true
            )
            Spacer().frame(height: 10)
            SampleBubble(
                speaker: "THE IVY",
                text: t("welcome_line_business_1"),
                translation: t("welcome_line_business_1_sub"),
                fromAssistant: false
            )
        }
    }
}

private struct BilingualSample: View {
    var body: some View {
        DarkPanel {
            Text(t("welcome_subtitle_pill"))
                .wise(Type.fine)
                .foregroundStyle(Ink.onDark)
                .padding(.horizontal, 15)
                .padding(.vertical, 7)
                .background(Ink.onDarkWash, in: Capsule())
                .frame(maxWidth: .infinity)

            Spacer().frame(height: 16)
            SampleBubble(
                speaker: "THE IVY",
                text: t("welcome_line_business_2"),
                translation: t("welcome_line_business_2_sub"),
                fromAssistant: false
            )
            Spacer().frame(height: 10)
            SampleBubble(
                speaker: t("speaker_assistant"),
                text: t("welcome_line_assistant_2"),
                translation: t("welcome_line_assistant_2_sub"),
                fromAssistant: true
            )
        }
    }
}

/// The confirm screen's card, shrunk: three rows and the one lime action.
private struct ConfirmSample: View {
    var body: some View {
        WiseCard {
            SampleRow(label: t("field_who"), value: "The Ivy", bold: true)
            Rule()
            SampleRow(label: t("field_when"), value: t("welcome_sample_when"), bold: true)
            Rule()
            SampleRow(label: t("field_phone"), value: "+44 20 7836 4751", mono: true)
            PrimaryButton(
                t("action_dial"),
                enabled: false,
                height: 46,
                // Inert, but it must not look disabled — this is a picture of
                // the real button, not a dead one.
                disabledContainer: Ink.lime,
                disabledContent: Ink.onLime,
                style: Type.buttonSmall
            ) {}
                .padding(.horizontal, 18)
                .padding(.top, 6)
                .padding(.bottom, 18)
        }
    }
}

private struct DarkPanel<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity)
            .padding(20)
            .background(Ink.text, in: cardShape)
    }
}

private struct SampleRow: View {
    let label: String
    let value: String
    var bold = false
    var mono = false

    var body: some View {
        HStack(spacing: 12) {
            Text(label).wise(Type.body).foregroundStyle(Ink.body)
            Spacer(minLength: 0)
            Text(value)
                .wise(mono ? Type.monoBody : (bold ? Type.value : Type.body))
                .foregroundStyle(Ink.text)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }
}

private struct SampleBubble: View {
    let speaker: String
    let text: String
    let translation: String
    let fromAssistant: Bool

    var body: some View {
        VStack(alignment: fromAssistant ? .trailing : .leading, spacing: 3) {
            Text(speaker)
                .wise(Type.speaker)
                .foregroundStyle(Ink.onDarkMute)
                .padding(.horizontal, 8)
            VStack(alignment: .leading, spacing: 5) {
                Text(text)
                    .wise(Type.bubble)
                    .foregroundStyle(fromAssistant ? Ink.onLime : Ink.onDark)
                    .fixedSize(horizontal: false, vertical: true)
                Rule(fromAssistant ? Ink.onLime.opacity(0.15) : Ink.onDarkRim)
                Text(translation)
                    .wise(Type.bubbleTranslation)
                    .foregroundStyle(fromAssistant ? Ink.deep : Ink.onDarkMute)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 11)
            .frame(maxWidth: 270, alignment: .leading)
            .background(
                fromAssistant ? Ink.lime : Ink.onDarkBubble,
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
        }
        .frame(maxWidth: .infinity, alignment: fromAssistant ? .trailing : .leading)
    }
}
