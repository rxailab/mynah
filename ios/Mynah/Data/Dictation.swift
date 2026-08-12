import AVFoundation
import Foundation
import Speech

/// Press and hold to talk, transcribed on the device where it can be.
///
/// The iOS counterpart of Android's `SpeechRecognizer`: same contract — hold to
/// start, release to stop, partial results as you go — over `SFSpeechRecognizer`
/// and an audio tap. Nothing is uploaded by this app; whether the recognition
/// itself happens on the phone is Apple's decision per language and device, and
/// ``requiresOnDeviceRecognition`` is left alone rather than forced, because
/// forcing it silently fails on a language the phone has no local model for.
@MainActor
final class Dictation: ObservableObject {
    @Published private(set) var listening = false
    /// Everything heard since ``start(from:)``, appended to the text that was
    /// already in the box.
    @Published private(set) var text = ""

    private var recogniser: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()
    private var base = ""

    /// Whether the phone can transcribe the interface language at all. False
    /// hides the microphone rather than offering a button that does nothing.
    func available(for language: Language) -> Bool {
        SFSpeechRecognizer(locale: language.locale ?? Locale.current)?.isAvailable ?? false
    }

    /// - Parameter existing: what is already in the box. Dictation adds to it
    ///   rather than replacing it, the way the Android composer does.
    func start(from existing: String, language: Language) {
        guard !listening else { return }
        base = existing.isBlank ? "" : existing.trimmed + " "
        text = existing

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard status == .authorized else { return }
            AVAudioApplication.requestRecordPermission { granted in
                guard granted else { return }
                Task { @MainActor [weak self] in self?.begin(language: language) }
            }
        }
    }

    private func begin(language: Language) {
        guard !listening else { return }
        let recogniser = SFSpeechRecognizer(locale: language.locale ?? Locale.current)
        guard let recogniser, recogniser.isAvailable else { return }
        self.recogniser = recogniser

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        self.request = request

        let input = engine.inputNode
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            teardown()
            return
        }
        listening = true

        task = recogniser.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let result {
                    text = (base + result.bestTranscription.formattedString)
                        .trimmingCharacters(in: .whitespaces)
                }
                if error != nil || result?.isFinal == true { stop() }
            }
        }
    }

    func stop() {
        guard listening || task != nil else { return }
        request?.endAudio()
        task?.finish()
        teardown()
    }

    private func teardown() {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request = nil
        task = nil
        listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
