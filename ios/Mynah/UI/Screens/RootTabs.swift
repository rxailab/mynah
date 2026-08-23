import SwiftUI

/// The two screens that are not somewhere you go, but somewhere you are.
///
/// History used to be pushed: it arrived from the right, wore a back arrow, and
/// put the tab bar out of reach until you had dismissed it. That is the shape
/// for a place you visit and leave — a call's detail, a settings page — and the
/// wrong shape for the other half of the app. Tasks and History are the same
/// rank, so they swap in place and the bar stays under both.
///
/// What that buys, concretely: two taps to compare "what is happening" with
/// "what happened", and the plus button never more than one tap away. What it
/// costs: the edge-swipe gesture no longer means anything here, which is
/// correct — there is nothing behind these to go back to. The gesture keeps
/// working on everything that is genuinely pushed.
struct RootTabs: View {
    @ObservedObject var model: CallsViewModel
    let onOpenCall: (String) -> Void
    let onOpenDetail: (String) -> Void
    let onCompose: () -> Void
    let onComposeWith: (String) -> Void
    let onSearch: () -> Void
    let onUsage: () -> Void
    let onSettings: () -> Void

    @State private var tab: TaskTabBar.Tab = .tasks

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                switch tab {
                case .tasks:
                    HomeScreen(
                        model: model,
                        onOpenCall: onOpenCall,
                        onOpenDetail: onOpenDetail,
                        onCompose: onCompose,
                        onComposeWith: onComposeWith,
                        onSearch: onSearch,
                        onUsage: onUsage,
                        onSettings: onSettings,
                        onHistory: { show(.history) }
                    )
                case .history:
                    HistoryScreen(
                        model: model,
                        onSearch: onSearch,
                        onOpen: { id, live in live ? onOpenCall(id) : onOpenDetail(id) }
                    )
                }
            }
            // A cross-fade, not a slide. Sliding says one of these came from
            // somewhere and can be gone back to, which is the idea this screen
            // exists to drop.
            .transition(.opacity)
            .animation(.easeOut(duration: 0.18), value: tab)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            TaskTabBar(
                selected: tab,
                onSelect: { show($0) },
                onCompose: onCompose
            )
        }
        .background(Ink.canvas)
    }

    private func show(_ next: TaskTabBar.Tab) {
        guard next != tab else { return }
        withAnimation(.easeOut(duration: 0.18)) { tab = next }
    }
}
