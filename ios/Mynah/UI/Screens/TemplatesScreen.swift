import SwiftUI

/// The kinds of call the assistant already knows the shape of.
///
/// Nothing is stored for these: a template is an example sentence and the
/// server-side template note that goes with it. Picking one fills the composer
/// and leaves you to edit it, which is the point — the sentence is still yours.
private struct Template: Identifiable {
    let title: String
    let blurb: String
    let seed: String
    let icon: VectorIcon

    var id: String { title }
}

private var templates: [Template] {
    [
        Template(title: t("tpl_booking"), blurb: t("tpl_booking_blurb"),
                 seed: t("tpl_booking_seed"), icon: Wise.phone),
        Template(title: t("tpl_appointment"), blurb: t("tpl_appointment_blurb"),
                 seed: t("tpl_appointment_seed"), icon: Wise.clock),
        Template(title: t("tpl_parcel"), blurb: t("tpl_parcel_blurb"),
                 seed: t("tpl_parcel_seed"), icon: Wise.search),
        Template(title: t("tpl_bank"), blurb: t("tpl_bank_blurb"),
                 seed: t("tpl_bank_seed"), icon: Wise.person),
    ]
}

struct TemplatesScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onCompose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("templates_title"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(t("templates_intro"))
                        .wise(Type.caption)
                        .foregroundStyle(Ink.body)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 14)

                    ForEach(templates) { template in
                        WiseCard(radius: 16, onTap: {
                            model.seedComposer(template.seed)
                            onCompose()
                        }) {
                            HStack(alignment: .top, spacing: 13) {
                                Icon(template.icon, size: 18)
                                    .foregroundStyle(Ink.deep)
                                    .frame(width: 38, height: 38)
                                    .background(Ink.limePale, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(template.title).wise(Type.rowTitle).foregroundStyle(Ink.text)
                                    Text(template.blurb)
                                        .wise(Type.rowSub)
                                        .foregroundStyle(Ink.mute)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                Icon(Wise.chevronRight, size: 14)
                                    .foregroundStyle(Ink.mute)
                                    .padding(.top, 3)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 15)
                        }
                        Spacer().frame(height: 10)
                    }

                    // Ringed rather than filled, because it is the absence of a
                    // template rather than one more of them.
                    HStack(spacing: 13) {
                        Icon(Wise.plus, size: 17)
                            .foregroundStyle(Ink.body)
                            .frame(width: 38, height: 38)
                            .background(Ink.canvasSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(t("tpl_custom")).wise(Type.rowTitle).foregroundStyle(Ink.text)
                            Text(t("tpl_custom_blurb"))
                                .wise(Type.rowSub)
                                .foregroundStyle(Ink.mute)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 15)
                    .background(Ink.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(Ink.rim, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
                    .onTapGesture {
                        model.clearComposerSeed()
                        onCompose()
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }
        }
        .navigationBarBackButtonHidden()
    }
}
