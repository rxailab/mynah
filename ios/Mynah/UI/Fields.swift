import SwiftUI

/// A number in the shape Twilio will dial and the server will accept. Checked
/// on the phone as well as there so a screen can say what is wrong before
/// anything is sent.
func isE164(_ phone: String) -> Bool {
    phone.wholeMatch(of: /\+[1-9]\d{6,14}/) != nil
}

func looksLikeEmail(_ text: String) -> Bool {
    text.wholeMatch(of: /[^@\s]+@[^@\s]+\.[^@\s]+/) != nil
}

/// The design's text input: the placeholder is drawn in the same size as the
/// value so the row does not change height when you start typing, and the box
/// itself is drawn by whatever contains it — several screens join two fields
/// into one outlined card with a rule between them.
struct WiseTextField: View {
    let placeholder: String
    @Binding var text: String
    var style: TypeStyle = Type.bodyLarge
    var keyboard: UIKeyboardType = .default
    var content: UITextContentType?
    var autocapitalisation: TextInputAutocapitalization = .sentences
    var secure = false
    var submitLabel: SubmitLabel = .done
    var onSubmit: () -> Void = {}
    var onChange: () -> Void = {}

    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder).wise(style).foregroundStyle(Ink.mute)
            }
            Group {
                if secure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                }
            }
            .wise(style)
            .foregroundStyle(Ink.text)
            .tint(Ink.text)
            .keyboardType(keyboard)
            .textContentType(content)
            .textInputAutocapitalization(autocapitalisation)
            .autocorrectionDisabled(keyboard == .emailAddress || secure)
            .submitLabel(submitLabel)
            .onSubmit(onSubmit)
            .onChange(of: text) { _, _ in onChange() }
        }
    }
}

/// A password field with the eye that reveals it. Kept together here because
/// the two states have to share one binding, and SwiftUI will not let a single
/// view be secure some of the time.
struct PasswordField: View {
    let placeholder: String
    @Binding var text: String
    @Binding var visible: Bool
    var content: UITextContentType = .password
    var onChange: () -> Void = {}

    var body: some View {
        HStack(spacing: 12) {
            WiseTextField(
                placeholder: placeholder,
                text: $text,
                content: content,
                autocapitalisation: .never,
                secure: !visible,
                onChange: onChange
            )
            .frame(maxWidth: .infinity)

            Icon(visible ? Wise.eyeOff : Wise.eye, size: 19)
                .foregroundStyle(Ink.mute)
                .contentShape(Rectangle())
                .onTapGesture { visible.toggle() }
                .accessibilityLabel(visible ? t("action_hide_password") : t("action_show_password"))
        }
    }
}

/// The small spinner the design uses inside a button or under one.
struct Spinner: View {
    var colour: Color = Ink.text
    var size: CGFloat = 18

    var body: some View {
        ProgressView()
            .progressViewStyle(.circular)
            .tint(colour)
            .scaleEffect(size / 20)
            .frame(width: size, height: size)
    }
}

/// The lime bars and the wordmark, as the design's top-left brand row.
struct BrandMark: View {
    var body: some View {
        HStack(spacing: 8) {
            HStack(alignment: .center, spacing: 1) {
                ForEach([8.0, 16.0, 10.0], id: \.self) { height in
                    Capsule().fill(Ink.lime).frame(width: 4, height: height)
                }
            }
            .frame(height: 18)
            Text(t("app_name").uppercased()).wise(Type.label).foregroundStyle(Ink.mute)
        }
    }
}
