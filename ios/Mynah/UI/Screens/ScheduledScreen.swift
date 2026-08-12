import SwiftUI

/// Calls set to happen later.
///
/// Note what the primary action on a due task is: "check and call", not "calling
/// now". Nothing on this screen dials — the server marks a task ready when its
/// time comes and it waits here until a person walks it through the same check
/// step as any other call. The line at the top says so, because a screen full of
/// timers is exactly where someone would assume otherwise.
struct ScheduledScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onCompose: () -> Void
    let onConfirm: (ScheduledCall) -> Void

    @State private var now = Int(Date().timeIntervalSince1970 * 1000)

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(t("scheduled_title"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(t("scheduled_intro"))
                        .wise(Type.caption)
                        .foregroundStyle(Ink.body)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer().frame(height: 12)

                    if model.scheduled.isEmpty {
                        Text(t("scheduled_empty"))
                            .wise(Type.caption)
                            .foregroundStyle(Ink.mute)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        GroupedCard {
                            ForEach(model.scheduled) { task in
                                TaskRow(
                                    task: task,
                                    now: now,
                                    language: model.language,
                                    onToggle: { model.setScheduledEnabled(task.id, !task.enabled) },
                                    onConfirm: { onConfirm(task) },
                                    onSkip: { model.dismissScheduled(task.id) }
                                )
                            }
                        }
                    }

                    Spacer().frame(height: 14)
                    OutlineButton(
                        label: t("scheduled_new"),
                        action: onCompose,
                        leading: { Icon(Wise.plus, size: 15) }
                    )
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }
        }
        .navigationBarBackButtonHidden()
        .onAppear { model.loadScheduled() }
    }
}

private struct TaskRow: View {
    let task: ScheduledCall
    let now: Int
    let language: Language
    let onToggle: () -> Void
    let onConfirm: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    Text(formatClock(task.runAt)).wise(Type.monoBody).foregroundStyle(Ink.text)
                    Text(dayLabel(task.runAt, now: now, language: language))
                        .wise(Type.tiny)
                        .foregroundStyle(Ink.mute)
                        .lineLimit(1)
                }
                .frame(width: 48)
                Spacer().frame(width: 12)
                Ink.divider.frame(width: 1, height: 34)
                Spacer().frame(width: 12)
                VStack(alignment: .leading, spacing: 0) {
                    Text(task.goal)
                        .wise(Type.rowTitle)
                        .foregroundStyle(Ink.text)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text(subtitle).wise(Type.rowSub).foregroundStyle(Ink.mute)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Spacer().frame(width: 10)
                PillSwitch(on: task.enabled, action: onToggle)
            }

            // Its time has come. The only way forward is the check step.
            if task.isReady {
                Spacer().frame(height: 12)
                HStack(spacing: 10) {
                    Text(t("scheduled_check_and_call"))
                        .wise(Type.chipStrong)
                        .foregroundStyle(Ink.onLime)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(Ink.lime, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .contentShape(Rectangle())
                        .onTapGesture(perform: onConfirm)
                    Text(t("scheduled_skip"))
                        .wise(Type.chip)
                        .foregroundStyle(Ink.body)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 9)
                        .contentShape(Rectangle())
                        .onTapGesture(perform: onSkip)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        // A paused task stays legible but stops asking for attention.
        .opacity(task.enabled ? 1 : 0.55)
    }

    /// Repeat labels are still read because rows written before repeats were
    /// removed still carry them, and a task that says "daily" should keep saying
    /// so until it retires. Nothing can create one any more — see
    /// ``NewScheduledRequest``.
    private var subtitle: String {
        if !task.enabled { return t("scheduled_paused") }
        if task.isReady { return t("scheduled_ready") }
        if task.repeatDays == 1 { return t("scheduled_daily") }
        if task.repeatDays == 7 { return t("scheduled_weekly") }
        if task.repeatDays > 0 { return t("scheduled_every_days", task.repeatDays) }
        if task.businessName.isNotBlank { return task.businessName }
        return t("scheduled_once")
    }
}
