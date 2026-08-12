import Photos
import SwiftUI

/// The result of a call as a picture worth sending to somebody.
///
/// What is deliberately not in it: the phone number and the transcript. A card
/// shared into a group chat is out of the sharer's hands the moment it lands,
/// and the transcript is a recording of a stranger at work — it belongs to the
/// person who placed the call, not to whoever they show the good news to. So the
/// card carries the outcome and the facts the assistant wrote down, and nothing
/// that identifies the line it happened on. The caption says so, because a
/// promise nobody can see is not one anybody can rely on.
///
/// Rendered from the same view that is on screen, so the image is the card
/// rather than a second implementation of it that could drift.
struct ShareCardScreen: View {
    @ObservedObject var model: CallsViewModel
    let callId: String
    let onBack: () -> Void

    @State private var notice: String?
    @State private var sharing: UIImage?

    private var call: Call? { model.calls.first { $0.id == callId } }

    var body: some View {
        Group {
            if let call {
                content(call)
            } else {
                // Gone from the list (a cleared history) — nothing to share.
                Color.clear.onAppear(perform: onBack)
            }
        }
        .navigationBarBackButtonHidden()
    }

    private func content(_ call: Call) -> some View {
        VStack(spacing: 0) {
            ScreenHeader(t("share_title"), onBack: onBack)

            VStack(spacing: 12) {
                ShareCard(call: call)
                Text(notice ?? t("share_no_number"))
                    .wise(Type.fine)
                    .foregroundStyle(notice != nil ? Ink.positiveDeep : Ink.mute)
                    .multilineTextAlignment(.center)
            }
            .frame(maxHeight: .infinity)
            .padding(20)

            VStack(spacing: 10) {
                PrimaryButton(t("share_image")) {
                    guard let image = render(call) else {
                        notice = t("share_failed")
                        return
                    }
                    notice = nil
                    sharing = image
                }
                OutlineButton(t("share_save")) { save(call) }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .sheet(item: $sharing) { image in
            // The sheet is where the person picks who gets it — this only ever
            // offers.
            ActivitySheet(items: [image])
        }
    }

    /// Draws the card at three times its size, which is what makes it readable
    /// when it lands in somebody's chat app.
    @MainActor
    private func render(_ call: Call) -> UIImage? {
        let renderer = ImageRenderer(content: ShareCard(call: call).environment(\.locale, model.language.locale ?? Locale.current))
        renderer.scale = 3
        return renderer.uiImage
    }

    /// Into the photo library. Add-only access, so the app never gains the right
    /// to read what is already there.
    private func save(_ call: Call) {
        guard let image = render(call) else {
            notice = t("share_failed")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                Task { @MainActor in notice = t("share_failed") }
                return
            }
            PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            } completionHandler: { saved, _ in
                Task { @MainActor in notice = saved ? t("share_saved") : t("share_failed") }
            }
        }
    }
}

/// The home screen's live card, holding a finished result instead.
private struct ShareCard: View {
    let call: Call

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                HStack(alignment: .center, spacing: 1) {
                    ForEach([8.0, 16.0, 10.0], id: \.self) { height in
                        Capsule().fill(Ink.lime).frame(width: 4, height: height)
                    }
                }
                Text("Mynah").wise(Type.listTitle).foregroundStyle(Ink.onDark)
                Spacer(minLength: 8)
                if call.outcome != nil {
                    Text(t("status_done"))
                        .wise(Type.labelSmall)
                        .foregroundStyle(Ink.lime)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 5)
                        .background(Ink.onDarkWash, in: Capsule())
                }
            }

            Spacer().frame(height: 16)
            Text(call.summary?.nilIfBlank ?? call.goal)
                .wise(Type.title)
                .foregroundStyle(Ink.onDark)
                .fixedSize(horizontal: false, vertical: true)
            Spacer().frame(height: 6)
            // The business and the date — never the number it was reached on.
            Text([call.businessName.nilIfBlank, shortDay(call.createdAt)]
                .compactMap { $0 }
                .joined(separator: " · "))
                .wise(Type.fine)
                .foregroundStyle(Ink.onDarkMute)

            if !call.results.isEmpty {
                Spacer().frame(height: 16)
                Ink.onDarkWash.frame(height: 1)
                Spacer().frame(height: 16)
                VStack(spacing: 10) {
                    ForEach(call.results.sorted(by: { $0.key < $1.key }).prefix(5), id: \.key) { key, value in
                        HStack(spacing: 12) {
                            Text(key.replacingOccurrences(of: "_", with: " "))
                                .wise(Type.caption)
                                .foregroundStyle(Ink.onDarkMute)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(value).wise(Type.caption).foregroundStyle(Ink.onDark)
                        }
                    }
                }
            }

            Spacer().frame(height: 18)
            Text(t("share_card_footer")).wise(Type.tiny).foregroundStyle(Ink.lime)
        }
        .padding(22)
        .frame(width: 320, alignment: .leading)
        .background(Ink.text, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func shortDay(_ at: Int) -> String {
        let date = Date(timeIntervalSince1970: Double(at) / 1000)
        let parts = Calendar.current.dateComponents([.month, .day], from: date)
        return "\(parts.month ?? 0)/\(parts.day ?? 0)"
    }
}

/// The system share sheet.
struct ActivitySheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

extension UIImage: @retroactive Identifiable {
    public var id: String { String(describing: ObjectIdentifier(self)) }
}
