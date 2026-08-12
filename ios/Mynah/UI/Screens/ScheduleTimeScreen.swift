import SwiftUI

/// The hours worth one tap. Anything else goes through the custom picker.
private let quickHours = [8, 9, 10, 12, 14, 16, 18]

/// When to make the call — a date and an hour, and nothing else.
///
/// There is no repeat option on this screen and there is no room for one. A
/// standing rule that rings a stranger every morning is a robocall from their
/// end whatever it was set up for, and the server refuses to store one, so
/// offering it here would only be a way to reach an error message.
///
/// Chips rather than wheels: seven hours cover almost every real answer, and the
/// two that do not open the platform pickers. The pale green card restates what
/// "scheduled" means here, because it is not what the word usually means — the
/// assistant does not dial when the time comes, it asks.
struct ScheduleTimeScreen: View {
    @ObservedObject var model: CallsViewModel
    let onBack: () -> Void
    let onScheduled: () -> Void

    // Day and hour are held apart until the button is pressed: picking "today"
    // and then an hour that has gone is a mistake worth catching at the point of
    // booking rather than by silently moving the date.
    @State private var day = Calendar.current.startOfDay(for: Date())
    @State private var hour: Int?
    @State private var minute = 0
    @State private var saving = false
    @State private var error: String?
    @State private var pickingDate = false
    @State private var pickingTime = false
    @State private var customDate = Date()
    @State private var customTime = Date()

    private let today = Calendar.current.startOfDay(for: Date())
    private var tomorrow: Date { today.addingTimeInterval(86_400) }

    private var runAt: Date? {
        hour.map { day.addingTimeInterval(Double($0) * 3600 + Double(minute) * 60) }
    }

    var body: some View {
        if let brief = model.parse.brief {
            content(brief)
        } else {
            // The brief is gone (a cleared parse) — go back rather than show a
            // screen with nothing to schedule.
            Color.clear.onAppear(perform: onBack)
        }
    }

    private func content(_ brief: Brief) -> some View {
        VStack(spacing: 0) {
            ScreenHeader(t("schedule_title"), onBack: onBack)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    WiseCard {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(t("schedule_date").uppercased())
                                .wise(Type.labelSmall)
                                .foregroundStyle(Ink.mute)
                            Spacer().frame(height: 10)
                            HStack(spacing: 8) {
                                Chip(label: t("schedule_today"), selected: day == today) {
                                    day = today
                                    error = nil
                                }
                                Chip(
                                    label: t("schedule_tomorrow", shortDay(tomorrow)),
                                    selected: day == tomorrow
                                ) {
                                    day = tomorrow
                                    error = nil
                                }
                                let custom = day != today && day != tomorrow
                                Chip(
                                    label: custom ? shortDay(day) : t("schedule_pick_date"),
                                    selected: custom
                                ) {
                                    customDate = day
                                    pickingDate = true
                                }
                            }

                            Spacer().frame(height: 16)
                            Rule()
                            Spacer().frame(height: 16)

                            Text(t("schedule_time").uppercased())
                                .wise(Type.labelSmall)
                                .foregroundStyle(Ink.mute)
                            Spacer().frame(height: 10)
                            FlowLayout {
                                ForEach(quickHours, id: \.self) { option in
                                    Chip(
                                        label: String(format: "%02d:00", option),
                                        selected: hour == option && minute == 0,
                                        mono: true
                                    ) {
                                        hour = option
                                        minute = 0
                                        error = nil
                                    }
                                }
                                let custom = hour != nil && (minute != 0 || !quickHours.contains(hour!))
                                Chip(
                                    label: custom
                                        ? String(format: "%02d:%02d", hour ?? 0, minute)
                                        : t("schedule_custom_time"),
                                    selected: custom
                                ) {
                                    customTime = Calendar.current.date(
                                        bySettingHour: hour ?? 9, minute: minute, second: 0, of: Date()
                                    ) ?? Date()
                                    pickingTime = true
                                }
                            }
                        }
                        .padding(20)
                    }

                    Spacer().frame(height: 12)
                    Text(t("schedule_note"))
                        .wise(Type.caption)
                        .foregroundStyle(Ink.deep)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Ink.limePale, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                    if let error {
                        Spacer().frame(height: 12)
                        Text(error)
                            .wise(Type.caption)
                            .foregroundStyle(Ink.negativeDeep)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 6)
                    }

                    Spacer().frame(height: 24)
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
            }

            PrimaryButton(
                label: runAt.map { t("schedule_confirm", whenLabel($0)) } ?? t("schedule_no_time"),
                action: { book(brief) },
                enabled: runAt != nil && !saving,
                leading: { Icon(Wise.clock, size: 16) }
            )
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .navigationBarBackButtonHidden()
        .sheet(isPresented: $pickingDate) {
            // Yesterday is never a valid answer here.
            PickerSheet(title: t("schedule_date")) {
                DatePicker("", selection: $customDate, in: today..., displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .tint(Ink.deep)
            } onDone: {
                day = Calendar.current.startOfDay(for: customDate)
                error = nil
                pickingDate = false
            }
            .presentationDetents([.height(460)])
        }
        .sheet(isPresented: $pickingTime) {
            PickerSheet(title: t("schedule_time")) {
                DatePicker("", selection: $customTime, displayedComponents: .hourAndMinute)
                    .datePickerStyle(.wheel)
                    .labelsHidden()
            } onDone: {
                let parts = Calendar.current.dateComponents([.hour, .minute], from: customTime)
                hour = parts.hour
                minute = parts.minute ?? 0
                error = nil
                pickingTime = false
            }
            .presentationDetents([.height(320)])
        }
    }

    private func book(_ brief: Brief) {
        guard let at = runAt else { return }
        // Caught here rather than at the server, which would say the same thing
        // a round trip later.
        if at <= Date() {
            error = t("schedule_past")
            return
        }
        saving = true
        error = nil
        model.scheduleCall(
            brief.toScheduledRequest(runAt: Int(at.timeIntervalSince1970 * 1000)),
            onDone: {
                saving = false
                model.clearParse()
                onScheduled()
            },
            onError: { reason in
                saving = false
                error = reason
            }
        )
    }

    private func shortDay(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.month, .day], from: date)
        return "\(parts.month ?? 0)/\(parts.day ?? 0)"
    }

    /// "09:00" for today, "12/8 09:00" for anything further out.
    private func whenLabel(_ at: Date) -> String {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: at)
        let clock = String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
        let start = Calendar.current.startOfDay(for: at)
        return start == today || start == tomorrow ? clock : "\(shortDay(at)) \(clock)"
    }
}

private struct Chip: View {
    let label: String
    let selected: Bool
    var mono = false
    let action: () -> Void

    var body: some View {
        Text(label)
            .wise(mono ? Type.mono : Type.chip)
            .lineLimit(1)
            .foregroundStyle(selected ? Ink.lime : Ink.text)
            .padding(.horizontal, 13)
            .padding(.vertical, 7)
            .background(selected ? Ink.text : Ink.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(selected ? .clear : Ink.hairline, lineWidth: 1)
            )
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
    }
}

/// The system's date and time wheels, wrapped in the app's own card so they do
/// not arrive looking like a different application.
private struct PickerSheet<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    let onDone: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased()).wise(Type.labelSmall).foregroundStyle(Ink.mute)
            content
            PrimaryButton(t("action_done"), height: 48, style: Type.buttonSmall, action: onDone)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Ink.card)
    }
}
