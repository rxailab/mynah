import SwiftUI
import UIKit

/// Puts the edge swipe back where an iOS user reaches for it.
///
/// Every screen in this app draws its own header — the design has no system
/// navigation bar anywhere — and hiding that bar takes the interactive pop
/// gesture with it, because the gesture is normally owned by the back button
/// that is no longer there. This hands the recogniser a delegate of its own so
/// the swipe works again.
///
/// Placed inside the stack rather than around it: the navigation controller is
/// found by walking up from a view that is actually in it. If a future SwiftUI
/// stops being UIKit underneath, this finds nothing and does nothing, and the
/// back arrows every screen already draws still work.
struct EdgeSwipeBack: UIViewControllerRepresentable {

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        weak var navigation: UINavigationController?

        func gestureRecognizerShouldBegin(_ recogniser: UIGestureRecognizer) -> Bool {
            // Nothing to go back to at the root — and a swipe started there
            // leaves the stack in a state it does not come out of.
            (navigation?.viewControllers.count ?? 0) > 1
        }

        /// Lets the swipe start on top of a scroll view rather than losing to it.
        func gestureRecognizer(
            _ recogniser: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIViewController(context: Context) -> UIViewController {
        let controller = UIViewController()
        controller.view.backgroundColor = .clear
        // It is a handle on the navigation controller, not a view: it must
        // never take a touch from the screen it is sitting behind.
        controller.view.isUserInteractionEnabled = false
        return controller
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {
        // The ancestor only exists once this is in a window, which is after the
        // current layout pass.
        DispatchQueue.main.async {
            guard let navigation = controller.navigationAncestor else { return }
            context.coordinator.navigation = navigation
            // The recogniser holds its delegate weakly, so the coordinator has
            // to outlive this call — it does: SwiftUI keeps it for as long as
            // the view is on screen, which is as long as the stack exists.
            navigation.interactivePopGestureRecognizer?.delegate = context.coordinator
            navigation.interactivePopGestureRecognizer?.isEnabled = true
        }
    }
}

private extension UIViewController {
    var navigationAncestor: UINavigationController? {
        if let navigationController { return navigationController }
        return sequence(first: self, next: \.parent)
            .compactMap { $0 as? UINavigationController }
            .first
    }
}

extension View {
    /// Restores the edge swipe for the stack this view is the root of.
    func edgeSwipeBack() -> some View {
        background(EdgeSwipeBack().frame(width: 0, height: 0).allowsHitTesting(false))
    }
}
