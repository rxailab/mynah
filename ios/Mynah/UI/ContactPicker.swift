import ContactsUI
import SwiftUI

/// The system's own contact picker, for filling in a number without typing it.
///
/// Picking one number this way needs no contacts permission: the sheet runs out
/// of process and hands back only what was chosen, which is the whole reason to
/// use it rather than reading the address book.
struct ContactPicker: UIViewControllerRepresentable {
    let onPicked: (String) -> Void

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let picker = CNContactPickerViewController()
        picker.displayedPropertyKeys = [CNContactPhoneNumbersKey]
        picker.predicateForEnablingContact = NSPredicate(format: "phoneNumbers.@count > 0")
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: CNContactPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPicked: onPicked) }

    final class Coordinator: NSObject, CNContactPickerDelegate {
        private let onPicked: (String) -> Void

        init(onPicked: @escaping (String) -> Void) { self.onPicked = onPicked }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            guard let number = contact.phoneNumbers.first?.value.stringValue else { return }
            onPicked(number.filter { !" -()".contains($0) })
        }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect property: CNContactProperty) {
            guard let number = (property.value as? CNPhoneNumber)?.stringValue else { return }
            onPicked(number.filter { !" -()".contains($0) })
        }
    }
}
