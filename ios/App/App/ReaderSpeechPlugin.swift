import AVFoundation
import Capacitor

@objc(ReaderSpeechPlugin)
public class ReaderSpeechPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "ReaderSpeechPlugin"
    public let jsName = "ReaderSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]
    private let synthesizer = AVSpeechSynthesizer()
    private var pending: CAPPluginCall?
    private var active: AVSpeechUtterance?
    private var activeID = ""
    private var observers: [NSObjectProtocol] = []
    private var pendingAudioRelease: DispatchWorkItem?
    private var audioReleaseGeneration = 0

    public override func load() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.synthesizer.delegate = self
            self.synthesizer.usesApplicationAudioSession = true
            self.observers.append(NotificationCenter.default.addObserver(forName: NativeAudioSession.willStart, object: nil, queue: .main) { [weak self] note in
                guard let self = self, note.object as AnyObject? !== self else { return }
                self.cancelCurrent()
            })
            self.observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
                if let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                   type == AVAudioSession.InterruptionType.began.rawValue { self?.cancelCurrent(deactivateAudioSession: false) }
            })
        }
    }

    @objc public func prepare(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if AVSpeechSynthesisVoice.speechVoices().isEmpty { call.reject("No speech voices available", "MISSING_ENGINE") }
            else { call.resolve() }
        }
    }

    @objc public func speak(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Reader closed", "CLOSED"); return }
            let text = call.getString("text") ?? ""
            let id = call.getString("id") ?? ""
            guard !id.isEmpty, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.count <= 4000 else {
                call.reject("Invalid speech text", "INVALID_TEXT"); return
            }
            let language = call.getString("language") ?? "vi-VN"
            guard let voice = AVSpeechSynthesisVoice(language: language) else {
                call.reject("Voice is not installed for this language", "MISSING_VOICE"); return
            }
            self.cancelCurrent(deactivateAudioSession: false)
            do { try NativeAudioSession.activate(self) }
            catch { NativeAudioSession.deactivate(self); call.reject("Cannot activate speech audio", "AUDIO_SESSION", error); return }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = voice
            let rate = call.getDouble("rate") ?? 1
            utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, max(AVSpeechUtteranceMinimumSpeechRate,
                AVSpeechUtteranceDefaultSpeechRate * Float(rate.isFinite ? min(2, max(0.3, rate)) : 1)))
            self.active = utterance
            self.activeID = id
            self.pending = call
            self.synthesizer.speak(utterance)
        }
    }

    private func cancelAudioRelease() {
        audioReleaseGeneration += 1
        pendingAudioRelease?.cancel()
        pendingAudioRelease = nil
    }

    private func scheduleAudioRelease() {
        cancelAudioRelease()
        let generation = audioReleaseGeneration
        // Giữ owner đến lúc nhả session, kể cả khi bridge đóng trong khoảng chờ ngắn này.
        let release = DispatchWorkItem { [self] in
            guard self.audioReleaseGeneration == generation, self.active == nil else { return }
            self.pendingAudioRelease = nil
            self.activeID = ""
            NativeAudioSession.deactivate(self)
        }
        pendingAudioRelease = release
        // JS nhận completion rồi mới gửi chunk kế; tránh nhả/chiếm session giữa hai lượt bridge.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: release)
    }

    private func cancelCurrent(deactivateAudioSession: Bool = true) {
        cancelAudioRelease()
        let call = pending
        pending = nil; active = nil; activeID = ""
        synthesizer.stopSpeaking(at: .immediate)
        call?.resolve(["canceled": true])
        if deactivateAudioSession { NativeAudioSession.deactivate(self) }
    }

    @objc public func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if call.getString("id") == nil || call.getString("id") == self?.activeID { self?.cancelCurrent() }
            call.resolve()
        }
    }

    @objc public func openSettings(_ call: CAPPluginCall) {
        // iOS không cung cấp URL công khai để mở thẳng trang tải giọng đọc.
        call.reject("Open Settings > Accessibility > Spoken Content to install voices", "SETTINGS_UNAVAILABLE")
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, utterance === self.active else { return }
            self.notifyListeners("speechStart", data: ["id": self.activeID])
        }
    }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, utterance === self.active else { return }
            let call = self.pending
            self.pending = nil; self.active = nil
            self.scheduleAudioRelease()
            call?.resolve()
        }
    }
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, utterance === self.active else { return }
            self.cancelCurrent()
        }
    }
    deinit {
        pendingAudioRelease?.cancel()
        observers.forEach(NotificationCenter.default.removeObserver)
    }
}
