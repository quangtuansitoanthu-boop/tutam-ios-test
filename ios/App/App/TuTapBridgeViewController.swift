import UIKit
import Capacitor
import WebKit
#if DEBUG
import CoreFoundation

private enum TuTapQANativeStartupPhase: String, Encodable, Sendable {
    case configurationBefore = "configuration.before"
    case configurationAfter = "configuration.after"
    case capacitorEntry = "capacitorDidLoad.entry"
    case dharmaAudioReturned = "plugin.DharmaAudio.returned"
    case readerSpeechReturned = "plugin.ReaderSpeech.returned"
    case practiceHapticsReturned = "plugin.PracticeHaptics.returned"
    case appSystemBarsReturned = "plugin.AppSystemBars.returned"
    case buddhistCalendarWidgetReturned = "plugin.BuddhistCalendarWidget.returned"
    case practiceWidgetReturned = "plugin.PracticeWidget.returned"
    case externalLinksReturned = "plugin.ExternalLinks.returned"
    case imageExportReturned = "plugin.ImageExport.returned"
    case qaInstallBefore = "qa.install.before"
    case qaInstallAfter = "qa.install.after"
    case capacitorExit = "capacitorDidLoad.exit"
    case viewDidLoadBeforeSuper = "viewDidLoad.beforeSuper"
    case viewDidLoadAfterSuper = "viewDidLoad.afterSuper"
}

private struct TuTapQANativeStartupEvent: Encodable, Sendable {
    let type = "native-startup"
    let phase: TuTapQANativeStartupPhase
    let pid: Int
    let uptime: TimeInterval
    let hasBridge: Bool
    let hasWebView: Bool
    let isLoading: Bool
    let hasURL: Bool
}

private enum TuTapQANativeLifecyclePhase: String, Encodable, Sendable {
    case didBecomeActive, willResignActive
}

private struct TuTapQANativeLifecycleEvent: Encodable, Sendable {
    let type = "native-lifecycle"
    let phase: TuTapQANativeLifecyclePhase
    let pid: Int
    let uptime: TimeInterval
    let epochMilliseconds: TimeInterval
    let mainThread: Bool
    let appState: Int
}

private struct TuTapQANotificationSDKEvent: Encodable, Sendable {
    let type = "native-notification-sdk"
    let phase: String
    let pid: Int
    let uptime: TimeInterval
    let status: Int
    let domain: String
    let errorCode: Int
}

private struct TuTapQANavigationEvent: Encodable, Sendable {
    let type = "native-navigation"
    let phase: String
    let pid: Int
    let uptime: TimeInterval
    let schemeClass: String
    let pathClass: String
    let domain: String
    let errorCode: Int
}

fileprivate enum TuTapQAImageExportPhase: String, Encodable, Sendable {
    case begin, presenterUnavailable, fileWritten, writeFailed, presentBefore, presentCompletion
    case delegatePick, delegateCancel, delegateDismiss, finishSaved, finishCancelled, finishFailed
}

fileprivate struct TuTapQAImageExportEvent: Encodable, Sendable {
    let type = "native-image-export"
    let phase: TuTapQAImageExportPhase
    let operationId: String
    let pid: Int
    let uptime: TimeInterval
    let mainThread: Bool
    let fileExists: Bool
    let fileBytes: Int
    let inputHasPNGSignature: Bool
    let presenterClass: String
    let presenterBeingPresented: Bool
    let presenterBeingDismissed: Bool
    let presenterHasPresentedController: Bool
    let presenterHasWindow: Bool
    let appState: Int
    let sceneActivation: Int
    let pickerHasPresenter: Bool
    let domain: String
    let errorCode: Int
}

private final class TuTapQAEventsHandler: NSObject, WKScriptMessageHandler {
    private let eventsQueue = DispatchQueue(label: "vn.quangtu.tutam.qa-events", qos: .utility)

    private func diagnosticInteger(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              ["c", "s", "i", "l", "q", "C", "S", "I", "L", "Q"].contains(String(cString: number.objCType)) else { return nil }
        return Int(number.stringValue)
    }

    private func diagnosticUptime(_ value: Any?) -> Double? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              ["f", "d"].contains(String(cString: number.objCType)),
              number.doubleValue.isFinite, number.doubleValue >= 0 else { return nil }
        return number.doubleValue
    }

    func recordNativeDiagnostic(_ payload: [AnyHashable: Any]?) {
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events"), let payload,
              let type = payload["type"] as? String, let phase = payload["phase"] as? String,
              let domain = payload["domain"] as? String,
              let pid = diagnosticInteger(payload["pid"]), pid > 0,
              let uptime = diagnosticUptime(payload["uptime"]),
              let code = diagnosticInteger(payload["errorCode"]), (-999999...999999).contains(code) else { return }
        let keys = Set(payload.keys.compactMap { $0 as? String })
        guard keys.count == payload.count else { return }
        if type == "native-notification-sdk" {
            guard keys == Set(["type", "phase", "pid", "uptime", "status", "domain", "errorCode"]),
                  ["check_entry", "check_settings_callback", "check_resolve", "schedule_entry",
                   "schedule_invalid_batch", "schedule_invalid_id", "schedule_content_reject",
                   "schedule_past_reject", "schedule_trigger_reject", "schedule_pending_start",
                   "schedule_pending_callback", "schedule_add_error", "schedule_callbacks_complete",
                   "schedule_restore_error", "schedule_rollback_expired", "schedule_rollback_reject",
                   "schedule_rollback_incomplete", "schedule_reject", "schedule_resolve"].contains(phase),
                  ["UNErrorDomain", "NSCocoaErrorDomain", "NSPOSIXErrorDomain", "NSURLErrorDomain",
                   "TuTapLocalNotifications", "other", "none"].contains(domain),
                  let status = diagnosticInteger(payload["status"]), (-1...4).contains(status) else { return }
            queueNativeDiagnostic(TuTapQANotificationSDKEvent(phase: phase, pid: pid, uptime: uptime,
                                                            status: status, domain: domain, errorCode: code))
        } else if type == "native-navigation" {
            guard keys == Set(["type", "phase", "pid", "uptime", "schemeClass", "pathClass", "domain", "errorCode"]),
                  ["didStart", "didCommit", "didFinish", "didFail", "didFailProvisional", "processTerminate"].contains(phase),
                  ["none", "WKErrorDomain", "NSURLErrorDomain", "NSCocoaErrorDomain", "NSPOSIXErrorDomain", "other"].contains(domain),
                  let scheme = payload["schemeClass"] as? String,
                  ["capacitor", "file", "http", "https", "other", "none"].contains(scheme),
                  let path = payload["pathClass"] as? String,
                  ["root", "copy", "other", "none"].contains(path) else { return }
            queueNativeDiagnostic(TuTapQANavigationEvent(phase: phase, pid: pid, uptime: uptime,
                                                       schemeClass: scheme, pathClass: path, domain: domain, errorCode: code))
        }
    }

    private func queueNativeDiagnostic<Event: Encodable & Sendable>(_ event: Event) {
        eventsQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            guard let data = try? encoder.encode(event),
                  let serialized = String(data: data, encoding: .utf8) else { return }
            self.appendEvent(serialized)
        }
    }

    func recordNativeStartup(_ event: TuTapQANativeStartupEvent) {
        eventsQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            guard let data = try? encoder.encode(event),
                  let serialized = String(data: data, encoding: .utf8) else { return }
            NSLog("[TutamQA] %@", serialized)
            self.appendEvent(serialized)
        }
    }

    func recordImageExport(_ event: TuTapQAImageExportEvent) {
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events") else { return }
        eventsQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            guard let data = try? encoder.encode(event),
                  let serialized = String(data: data, encoding: .utf8) else { return }
            NSLog("[TutamQA] %@", serialized)
            self.appendEvent(serialized)
        }
    }

    func recordNativeLifecycle(_ event: TuTapQANativeLifecycleEvent) {
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events") else { return }
        eventsQueue.async {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            guard let data = try? encoder.encode(event),
                  let serialized = String(data: data, encoding: .utf8) else { return }
            NSLog("[TutamQA] %@", serialized)
            self.appendEvent(serialized)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "tutamQAEvents", message.frameInfo.isMainFrame,
              let body = message.body as? String, body.utf8.count <= 4096 else { return }
        // UIKit reads stay on the main callback; only primitive values cross to the I/O queue.
        var footerState: [String: Double]? = nil
        var footerEvent: String? = nil
        var libraryInputScope = false
        if Thread.isMainThread, let data = body.data(using: .utf8),
           let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           event["phase"] as? String == "capture",
           let eventType = event["type"] as? String,
           ["pointerdown", "pointerup", "pointercancel"].contains(eventType),
           let webView = message.webView {
            let footerScope = event["footer"] as? Bool == true
                && ["/", "/kinh-sach", "/tu-tap", "/phap-thoai", "/ca-nhan"].contains(event["anchorPath"] as? String ?? "")
            let libraryScope = event["scope"] as? String == "library-search"
                && event["path"] as? String == "/kinh-sach"
                && event["tag"] as? String == "INPUT" && event["inputType"] as? String == "search"
            if footerScope || libraryScope {
                libraryInputScope = libraryScope && !footerScope
                let scroll = webView.scrollView
                let pan = scroll.panGestureRecognizer
                let translation = pan.translation(in: webView)
                let velocity = pan.velocity(in: webView)
                let inset = scroll.contentInset
                let adjustedInset = scroll.adjustedContentInset
                footerEvent = eventType
                footerState = [
                    "sourceTime": (event["time"] as? NSNumber)?.doubleValue ?? -1,
                    "panState": Double(pan.state.rawValue),
                    "translationX": Double(translation.x), "translationY": Double(translation.y),
                    "velocityX": Double(velocity.x), "velocityY": Double(velocity.y),
                    "offsetX": Double(scroll.contentOffset.x), "offsetY": Double(scroll.contentOffset.y),
                    "isTracking": scroll.isTracking ? 1 : 0,
                    "insetTop": Double(inset.top), "insetBottom": Double(inset.bottom),
                    "insetLeft": Double(inset.left), "insetRight": Double(inset.right),
                    "adjustedInsetTop": Double(adjustedInset.top), "adjustedInsetBottom": Double(adjustedInset.bottom),
                    "adjustedInsetLeft": Double(adjustedInset.left), "adjustedInsetRight": Double(adjustedInset.right),
                    "isDragging": scroll.isDragging ? 1 : 0,
                    "isDecelerating": scroll.isDecelerating ? 1 : 0
                ]
            }
        }
        let capturedFooterState = footerState
        let capturedFooterEvent = footerEvent
        let capturedLibraryInputScope = libraryInputScope
        // Diagnostic disk/console I/O must not stall UIKit touch delivery.
        eventsQueue.async {
            NSLog("[TutamQA] %@", body)
            self.appendEvent(body)
            if let state = capturedFooterState, let sourceType = capturedFooterEvent {
                let record: [String: Any] = ["type": capturedLibraryInputScope ? "native-library-search-state" : "native-footer-state", "sourceType": sourceType, "state": state]
                if let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
                   let serialized = String(data: data, encoding: .utf8) {
                    NSLog("[TutamQA] %@", serialized)
                    self.appendEvent(serialized)
                }
            }
        }
    }

    private func appendEvent(_ body: String) {
        // JSON serialization keeps one physical line per sanitized script event.
        guard let input = body.data(using: .utf8),
              let event = try? JSONSerialization.jsonObject(with: input) as? [String: Any],
              let serialized = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]),
              let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
        let url = caches.appendingPathComponent("tutam-qa-events.jsonl")
        var line = serialized
        line.append(0x0A)
        let limit: UInt64 = 256 * 1024
        do {
            try FileManager.default.createDirectory(at: caches, withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: url.path) {
                guard FileManager.default.createFile(atPath: url.path, contents: nil) else { return }
            }
            let handle = try FileHandle(forWritingTo: url)
            defer { try? handle.close() }
            let size = try handle.seekToEnd()
            // Preserve earlier evidence across relaunches; never truncate or rotate at the cap.
            guard size <= limit, UInt64(line.count) <= limit - size else { return }
            try handle.write(contentsOf: line)
        } catch {
            // Diagnostic storage failures must not affect app interaction or auth.
        }
    }
}
#endif

@objc(TuTapBridgeViewController)
class TuTapBridgeViewController: CAPBridgeViewController {
#if DEBUG
    private var qaEventsInstalled = false
    private var qaEventsHandler: TuTapQAEventsHandler?
    private var qaNativeDiagnosticObserver: NSObjectProtocol?
    private var qaLifecycleObservers: [NSObjectProtocol] = []
#endif

#if DEBUG && targetEnvironment(simulator)
    // Chỉ quan sát recognizer sẵn có trong lượt QA; không thay đổi phân xử chạm.
    private final class QAWeakGesture {
        weak var recognizer: UIGestureRecognizer?
        let index: Int
        init(_ recognizer: UIGestureRecognizer, index: Int) {
            self.recognizer = recognizer
            self.index = index
        }
    }
    private struct QAGestureChangedSignature: Equatable {
        let touchCount: Int
        let cancelsTouchesInView: Bool
        let delaysTouchesBegan: Bool
        let delaysTouchesEnded: Bool
        let bounds: CGRect
    }
    private var qaExistingGestures: [QAWeakGesture] = []
    private var qaGestureLastChangedSignatures: [Int: QAGestureChangedSignature] = [:]
    private var qaGestureRecordCount = 0

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events"),
              let webView else { return }
        removeQAExistingGestureTargets()
        // BFS hữu hạn qua subviews công khai, không chọn theo tên lớp WebKit nội bộ.
        var views: [UIView] = [webView, webView.scrollView]
        var viewIDs = Set(views.map { ObjectIdentifier($0) })
        var cursor = 0
        while cursor < views.count {
            let current = views[cursor]
            cursor += 1
            for child in current.subviews {
                guard views.count < 16 else { break }
                if viewIDs.insert(ObjectIdentifier(child)).inserted { views.append(child) }
            }
        }
        var ancestor = webView.superview
        var ancestorCount = 0
        while let current = ancestor, ancestorCount < 8 {
            if viewIDs.insert(ObjectIdentifier(current)).inserted { views.append(current) }
            ancestor = current.superview
            ancestorCount += 1
        }
        var seen = Set<ObjectIdentifier>()
        for current in views {
            for recognizer in current.gestureRecognizers ?? [] {
                guard qaExistingGestures.count < 32 else { break }
                guard seen.insert(ObjectIdentifier(recognizer)).inserted else { continue }
                let observed = QAWeakGesture(recognizer, index: qaExistingGestures.count)
                qaExistingGestures.append(observed)
                recognizer.addTarget(self, action: #selector(qaExistingGestureChanged(_:)))
                recordQAExistingGesture(recognizer, index: observed.index, phase: "installed")
            }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        removeQAExistingGestureTargets()
        super.viewWillDisappear(animated)
    }

    private func removeQAExistingGestureTargets() {
        for observed in qaExistingGestures {
            observed.recognizer?.removeTarget(self, action: #selector(qaExistingGestureChanged(_:)))
        }
        qaExistingGestures.removeAll()
        qaGestureLastChangedSignatures.removeAll()
    }

    @objc private func qaExistingGestureChanged(_ recognizer: UIGestureRecognizer) {
        guard let observed = qaExistingGestures.first(where: { $0.recognizer === recognizer }) else { return }
        recordQAExistingGesture(recognizer, index: observed.index, phase: "action")
    }

    private func recordQAExistingGesture(_ recognizer: UIGestureRecognizer, index: Int, phase: String) {
        guard Thread.isMainThread, ProcessInfo.processInfo.arguments.contains("-tutam-qa-events"),
              qaGestureRecordCount < 512, let observedView = recognizer.view else { return }
        let bounds = observedView.bounds
        let geometry = [bounds.origin.x, bounds.origin.y, bounds.width, bounds.height]
        guard geometry.allSatisfy({ $0.isFinite }) else { return }
        let state = recognizer.state
        let signature = QAGestureChangedSignature(
            touchCount: recognizer.numberOfTouches,
            cancelsTouchesInView: recognizer.cancelsTouchesInView,
            delaysTouchesBegan: recognizer.delaysTouchesBegan,
            delaysTouchesEnded: recognizer.delaysTouchesEnded,
            bounds: bounds
        )
        if phase == "action" && state == .changed {
            // Chỉ gộp mẫu changed liên tiếp giống nhau của cùng recognizer.
            guard qaGestureLastChangedSignatures[index] != signature else { return }
        } else {
            // Mỗi began/ended/cancelled/failed là sự kiện riêng, kể cả lặp giống nhau.
            qaGestureLastChangedSignatures.removeValue(forKey: index)
        }
        let process = ProcessInfo.processInfo
        let event: [String: Any] = [
            "type": "native-gesture-state", "phase": phase, "index": index,
            "pid": Int(process.processIdentifier), "uptime": process.systemUptime,
            "recognizerClass": NSStringFromClass(type(of: recognizer)),
            "viewClass": NSStringFromClass(type(of: observedView)),
            "state": state.rawValue, "touchCount": signature.touchCount,
            "cancelsTouchesInView": signature.cancelsTouchesInView,
            "delaysTouchesBegan": signature.delaysTouchesBegan,
            "delaysTouchesEnded": signature.delaysTouchesEnded,
            "boundsX": Double(bounds.origin.x), "boundsY": Double(bounds.origin.y),
            "boundsWidth": Double(bounds.width), "boundsHeight": Double(bounds.height)
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]),
              data.count <= 4096, let serialized = String(data: data, encoding: .utf8) else { return }
        if phase == "action" && state == .changed {
            qaGestureLastChangedSignatures[index] = signature
        }
        qaGestureRecordCount += 1
        NSLog("[TutamQA] %@", serialized)
    }
#endif
    override func capacitorDidLoad() {
#if DEBUG
        recordNativeStartup(.capacitorEntry)
#endif
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView?.scrollView.showsHorizontalScrollIndicator = false
        bridge?.registerPluginInstance(DharmaAudioPlugin.shared)
#if DEBUG
        recordNativeStartup(.dharmaAudioReturned)
#endif
        bridge?.registerPluginInstance(ReaderSpeechPlugin())
#if DEBUG
        recordNativeStartup(.readerSpeechReturned)
#endif
        bridge?.registerPluginInstance(PracticeHapticsPlugin())
#if DEBUG
        recordNativeStartup(.practiceHapticsReturned)
#endif
        bridge?.registerPluginInstance(AppSystemBarsPlugin())
#if DEBUG
        recordNativeStartup(.appSystemBarsReturned)
#endif
        bridge?.registerPluginInstance(BuddhistCalendarWidgetPlugin())
#if DEBUG
        recordNativeStartup(.buddhistCalendarWidgetReturned)
#endif
        bridge?.registerPluginInstance(PracticeWidgetPlugin())
#if DEBUG
        recordNativeStartup(.practiceWidgetReturned)
#endif
        bridge?.registerPluginInstance(ExternalLinksPlugin())
#if DEBUG
        recordNativeStartup(.externalLinksReturned)
#endif
        bridge?.registerPluginInstance(ImageExportPlugin())
#if DEBUG
        recordNativeStartup(.imageExportReturned)
#endif
        bridge?.registerPluginInstance(ScreenWakeLockPlugin())
        bridge?.registerPluginInstance(DivinationHistoryPlugin())
#if DEBUG
#if targetEnvironment(simulator)
        TuTapQADivinationRemovalProbe.schedule(bridge)
#endif
        recordNativeStartup(.qaInstallBefore)
        installQAEventsIfRequested()
        recordNativeStartup(.qaInstallAfter)
        recordNativeStartup(.capacitorExit)
#endif
    }

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
#if DEBUG
        recordNativeStartup(.configurationBefore)
#endif
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        configuration.ignoresViewportScaleLimits = false
#if DEBUG
        recordNativeStartup(.configurationAfter)
#endif
        return configuration
    }

#if DEBUG
    override func viewDidLoad() {
        recordNativeStartup(.viewDidLoadBeforeSuper)
        super.viewDidLoad()
        recordNativeStartup(.viewDidLoadAfterSuper)
    }

    private func qaEventsHandlerIfRequested() -> TuTapQAEventsHandler? {
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events") else { return nil }
        if let handler = qaEventsHandler { return handler }
        let handler = TuTapQAEventsHandler()
        qaEventsHandler = handler
        qaNativeDiagnosticObserver = NotificationCenter.default.addObserver(
            forName: Notification.Name("TuTapQANativeDiagnostic"), object: nil, queue: nil
        ) { [weak self] notification in
            self?.qaEventsHandler?.recordNativeDiagnostic(notification.userInfo)
        }
        qaLifecycleObservers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.recordNativeLifecycle(.didBecomeActive)
        })
        qaLifecycleObservers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.recordNativeLifecycle(.willResignActive)
        })
        return handler
    }

    deinit {
        if let observer = qaNativeDiagnosticObserver { NotificationCenter.default.removeObserver(observer) }
        for observer in qaLifecycleObservers { NotificationCenter.default.removeObserver(observer) }
    }

    private func recordNativeStartup(_ phase: TuTapQANativeStartupPhase) {
        guard let handler = qaEventsHandlerIfRequested() else { return }
        let process = ProcessInfo.processInfo
        let event = TuTapQANativeStartupEvent(phase: phase, pid: Int(process.processIdentifier),
                                            uptime: process.systemUptime, hasBridge: bridge != nil,
                                            hasWebView: webView != nil, isLoading: webView?.isLoading ?? false,
                                            hasURL: webView?.url != nil)
        handler.recordNativeStartup(event)
    }

    fileprivate func recordImageExportDiagnostic(_ event: TuTapQAImageExportEvent) {
        qaEventsHandlerIfRequested()?.recordImageExport(event)
    }

    private func recordNativeLifecycle(_ phase: TuTapQANativeLifecyclePhase) {
        guard let handler = qaEventsHandler else { return }
        let process = ProcessInfo.processInfo
        let event = TuTapQANativeLifecycleEvent(
            phase: phase, pid: Int(process.processIdentifier), uptime: process.systemUptime,
            epochMilliseconds: Date().timeIntervalSince1970 * 1000,
            mainThread: Thread.isMainThread, appState: UIApplication.shared.applicationState.rawValue
        )
        handler.recordNativeLifecycle(event)
    }

    private func installQAEventsIfRequested() {
        guard !qaEventsInstalled, let handler = qaEventsHandlerIfRequested(),
              let webView = webView else { return }
        qaEventsInstalled = true
        webView.configuration.userContentController.add(handler, name: "tutamQAEvents")
        let source = """
        (() => {
          const log = (detail) => {
            const body = JSON.stringify(detail);
            const handler = window.webkit?.messageHandlers?.tutamQAEvents;
            if (handler) handler.postMessage(body);
            else console.info('[TutamQA]', body);
          };
          const logLifecycle = (phase) => log({ type: 'web-lifecycle', phase, time: performance.now(), epochMilliseconds: Date.now(), hidden: document.hidden, focused: document.hasFocus() });
          document.addEventListener('visibilitychange', () => logLifecycle('visibilitychange'), { passive: true });
          window.addEventListener('focus', (event) => { if (event.target === window) logLifecycle('focus'); }, { passive: true });
          window.addEventListener('blur', (event) => { if (event.target === window) logLifecycle('blur'); }, { passive: true });
          const context = () => ({ path: location.pathname, readyState: document.readyState, time: performance.now(), activeTag: document.activeElement?.tagName || null, activeSelect: document.activeElement instanceof HTMLSelectElement });
          const describe = (event) => {
            const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
            const target = origin?.closest('a,button,select,input');
            const detail = { ...context(), type: event.type, tag: target?.tagName || origin?.tagName || 'NON_ELEMENT', defaultPrevented: event.defaultPrevented };
            if (target?.closest('.qts-bottom-nav')) detail.footer = true;
            detail.cancelable = event.cancelable;
            if (typeof event.pointerId === 'number') detail.pointerId = event.pointerId;
            if (target?.id) detail.id = target.id.slice(0, 80);
            const label = target?.getAttribute('aria-label');
            if (label) detail.label = label.slice(0, 80);
            else if (target?.tagName === 'BUTTON') detail.buttonText = (target.textContent || '').trim().slice(0, 80);
            if (target?.tagName === 'A') {
              try { detail.anchorPath = new URL(target.getAttribute('href') || '', location.href).pathname; } catch {}
            }
            const point = event.changedTouches?.[0] || event;
            if (typeof point.identifier === 'number') detail.touchIdentifier = point.identifier;
            if (typeof point.clientX === 'number' && typeof point.clientY === 'number') {
              detail.x = point.clientX; detail.y = point.clientY;
            }
            return detail;
          };
          let footerContact = false;
          let footerMoveCount = 0;
          const numericRect = (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
          const libraryInputTokens = new WeakMap();
          let nextLibraryInputToken = 0;
          let libraryInputSamples = 0;
          const logLibraryInput = (event) => {
            if (libraryInputSamples >= 32 || location.pathname !== '/kinh-sach'
              || !['pointerdown', 'pointerup', 'pointercancel', 'focusin', 'focusout'].includes(event.type)) return;
            const input = event.target;
            if (!(input instanceof HTMLInputElement) || input.type !== 'search') return;
            let token = libraryInputTokens.get(input);
            if (!token && !input.matches('.kinh-sach-container .search-input')) return;
            if (!token) { token = ++nextLibraryInputToken; libraryInputTokens.set(input, token); }
            const panel = input.closest('.library-top-bar');
            const shell = input.closest('.qts-shell');
            const root = document.scrollingElement;
            const viewport = window.visualViewport;
            const number = value => Number.isFinite(value) ? value : 0;
            libraryInputSamples += 1;
            log({ type: event.type, phase: 'capture', scope: 'library-search', path: '/kinh-sach', tag: 'INPUT', inputType: 'search',
              time: performance.now(), targetToken: token, connected: input.isConnected, active: document.activeElement === input,
              inputRect: numericRect(input.getBoundingClientRect()), panelRect: panel ? numericRect(panel.getBoundingClientRect()) : null,
              chromeHidden: shell?.classList.contains('qts-shell--chrome-hidden') === true,
              panelScrollTop: number(panel?.scrollTop), panelScrollHeight: number(panel?.scrollHeight), panelClientHeight: number(panel?.clientHeight),
              scrollX: number(window.scrollX), scrollY: number(window.scrollY),
              documentScrollTop: number(root?.scrollTop), documentScrollHeight: number(root?.scrollHeight), documentClientHeight: number(root?.clientHeight),
              innerWidth: number(window.innerWidth), innerHeight: number(window.innerHeight),
              visualViewport: viewport ? { offsetLeft: number(viewport.offsetLeft), offsetTop: number(viewport.offsetTop),
                pageLeft: number(viewport.pageLeft), pageTop: number(viewport.pageTop), width: number(viewport.width),
                height: number(viewport.height), scale: number(viewport.scale) } : null });
          };
          for (const type of ['focusin', 'focusout']) window.addEventListener(type, logLibraryInput, { capture: true, passive: true });
          for (const type of ['pointermove', 'touchmove']) {
            window.addEventListener(type, (event) => {
              const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
              const anchor = origin?.closest('.qts-bottom-nav a');
              if (!footerContact || !anchor || footerMoveCount >= 4) return;
              footerMoveCount += 1;
              const point = event.changedTouches?.[0] || event;
              const detail = { type, phase: 'capture', footer: true, time: performance.now(), x: point.clientX, y: point.clientY, cancelable: event.cancelable, defaultPrevented: event.defaultPrevented, sample: footerMoveCount };
              if (typeof event.pointerId === 'number') detail.pointerId = event.pointerId;
              if (typeof point.identifier === 'number') detail.touchIdentifier = point.identifier;
              log(detail);
            }, { capture: true, passive: true });
          }
          const dialogNodeTokens = new WeakMap();
          let nextDialogNodeToken = 0;
          let dialogNodeSamples = 0;
          let lastDialog = null;
          let lastButton = null;
          let dialogNodeUntil = 0;
          const dialogNodeIdentity = (node) => {
            if (!(node instanceof Node)) return null;
            let token = dialogNodeTokens.get(node);
            if (!token) { token = ++nextDialogNodeToken; dialogNodeTokens.set(node, token); }
            return { token, tag: node instanceof Element ? node.tagName.slice(0, 40) : node.nodeType === 3 ? '#TEXT' : '#NODE' };
          };
          const dialogNodeSnapshot = (node) => {
            const identity = dialogNodeIdentity(node);
            if (!identity) return null;
            const snapshot = { ...identity, connected: node.isConnected };
            if (node instanceof Element) {
              const rect = node.getBoundingClientRect();
              const finite = value => Number.isFinite(value) ? value : 0;
              snapshot.rect = { x: finite(rect.x), y: finite(rect.y), width: finite(rect.width), height: finite(rect.height) };
            }
            if (node instanceof HTMLDialogElement) {
              snapshot.open = node.open;
              try { snapshot.modal = node.matches(':modal'); } catch { snapshot.modal = null; }
            }
            return snapshot;
          };
          const logDialogEventNode = (event, capture) => {
            if (dialogNodeSamples >= 256) { lastDialog = null; lastButton = null; return; }
            const time = performance.now();
            if (time > dialogNodeUntil) { lastDialog = null; lastButton = null; }
            const raw = event.target;
            const origin = raw instanceof Element ? raw : raw?.parentElement;
            const dialog = origin?.closest('dialog[data-app-message]') || null;
            const button = dialog ? origin?.closest('button') || null : null;
            if (capture && event.type === 'pointerdown') {
              lastDialog = dialog;
              lastButton = button;
              dialogNodeUntil = dialog ? time + 500 : 0;
            }
            if (!dialog && !lastDialog) return;
            dialogNodeSamples += 1;
            log({ type: 'dialog-event-node', eventType: event.type, phase: capture ? 'capture' : 'bubble', time,
              target: dialogNodeSnapshot(raw), button: dialogNodeSnapshot(button), dialog: dialogNodeSnapshot(dialog),
              lastButton: dialogNodeSnapshot(lastButton), lastDialog: dialogNodeSnapshot(lastDialog),
              activeElement: dialogNodeIdentity(document.activeElement) });
          };
          for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'click', 'mouseover']) {
            for (const capture of [true, false]) {
              window.addEventListener(type, (event) => {
                const detail = describe(event);
                logDialogEventNode(event, capture);
                if (!detail) return;
                if (capture && ['pointerdown', 'pointerup', 'pointercancel'].includes(type)) logLibraryInput(event);
                if (capture && detail.footer) {
                  if (type === 'pointerdown' || (type === 'touchstart' && !footerContact)) {
                    footerContact = true; footerMoveCount = 0;
                  }
                  if (type === 'pointercancel') {
                    const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
                    const anchor = origin?.closest('.qts-bottom-nav a');
                    const footer = anchor?.closest('.qts-bottom-nav');
                    if (anchor && footer) {
                      detail.anchorRect = numericRect(anchor.getBoundingClientRect());
                      detail.footerRect = numericRect(footer.getBoundingClientRect());
                      detail.scrollX = window.scrollX; detail.scrollY = window.scrollY;
                      detail.scrollTop = document.scrollingElement?.scrollTop ?? 0;
                      const viewport = window.visualViewport;
                      if (viewport) detail.visualViewport = { offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop, pageLeft: viewport.pageLeft, pageTop: viewport.pageTop, width: viewport.width, height: viewport.height, scale: viewport.scale };
                    }
                  }
                  if (['pointerup', 'pointercancel', 'touchend', 'touchcancel'].includes(type)) footerContact = false;
                }
                log({ ...detail, phase: capture ? 'capture' : 'bubble' });
                if (type === 'click' && capture) queueMicrotask(() => {
                  log({ ...detail, ...context(), phase: 'final', defaultPrevented: event.defaultPrevented });
                });
              }, { capture, passive: true });
            }
          }
          let previousPath = location.pathname;
          new MutationObserver(() => {
            if (location.pathname !== previousPath) {
              previousPath = location.pathname;
              log({ ...context(), type: 'pathname-change' });
            }
          }).observe(document, { childList: true, subtree: true });
          window.addEventListener('error', (event) => {
            const names = ['Error', 'TypeError', 'SyntaxError', 'ReferenceError', 'RangeError', 'URIError', 'EvalError'];
            const name = event.error?.name;
            // Never include error messages, stacks, source URLs, or rejected values.
            log({ ...context(), type: 'error', kind: names.includes(name) ? name : 'resource-or-module-error' });
          }, { capture: true, passive: true });
          log({ ...context(), type: 'installed' });
        })();
        """
        webView.configuration.userContentController.addUserScript(WKUserScript(
            source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
    }
#endif
}

@objc(ImageExportPlugin)
public class ImageExportPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    public let identifier = "ImageExportPlugin"
    public let jsName = "ImageExport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareImage", returnType: CAPPluginReturnPromise)
    ]
    private let exportQueue = DispatchQueue(label: "vn.quangtu.tutam.image-export", qos: .userInitiated)
    private var pendingCall: CAPPluginCall?
    private var picker: UIDocumentPickerViewController?
    private var exportDirectory: URL?
    private var shareCall: CAPPluginCall?
    private var shareController: UIActivityViewController?
    private var shareDirectory: URL?
#if DEBUG
    private var qaExportOperationId = "none"
    private var qaExportFile: URL?

    private func recordQAExport(_ phase: TuTapQAImageExportPhase, presenter: UIViewController? = nil,
                                file: URL? = nil, error: Error? = nil) {
        guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events") else { return }
        if phase == .begin {
            qaExportOperationId = UUID().uuidString
            qaExportFile = nil
        }
        if let file = file { qaExportFile = file }
        let onMain = Thread.isMainThread
        let attributes = qaExportFile.flatMap { try? FileManager.default.attributesOfItem(atPath: $0.path) }
        let nativeError = error as NSError?
        let allowedDomains = ["NSCocoaErrorDomain", "NSPOSIXErrorDomain", "NSURLErrorDomain"]
        let domain = nativeError.map { allowedDomains.contains($0.domain) ? $0.domain : "other" } ?? "none"
        let code = nativeError?.code ?? 0
        let window = onMain ? (presenter?.viewIfLoaded?.window ?? bridge?.viewController?.viewIfLoaded?.window) : nil
        let event = TuTapQAImageExportEvent(
            phase: phase, operationId: qaExportOperationId, pid: Int(ProcessInfo.processInfo.processIdentifier),
            uptime: ProcessInfo.processInfo.systemUptime, mainThread: onMain,
            fileExists: qaExportFile.map { FileManager.default.fileExists(atPath: $0.path) } ?? false,
            fileBytes: (attributes?[.size] as? NSNumber)?.intValue ?? -1,
            inputHasPNGSignature: true,
            presenterClass: presenter.map { NSStringFromClass(type(of: $0)) } ?? "none",
            presenterBeingPresented: onMain ? (presenter?.isBeingPresented ?? false) : false,
            presenterBeingDismissed: onMain ? (presenter?.isBeingDismissed ?? false) : false,
            presenterHasPresentedController: onMain ? (presenter?.presentedViewController != nil) : false,
            presenterHasWindow: onMain ? (presenter?.viewIfLoaded?.window != nil) : false,
            appState: onMain ? UIApplication.shared.applicationState.rawValue : -2,
            sceneActivation: window?.windowScene?.activationState.rawValue ?? -2,
            pickerHasPresenter: onMain ? (picker?.presentingViewController != nil) : false,
            domain: domain, errorCode: (-999999...999999).contains(code) ? code : 0)
        (bridge?.viewController as? TuTapBridgeViewController)?.recordImageExportDiagnostic(event)
    }
#endif

    private func findTopViewController(from root: UIViewController?) -> UIViewController? {
        guard let root = root else { return nil }
        if let presented = root.presentedViewController, !presented.isBeingDismissed {
            return findTopViewController(from: presented)
        }
        return root
    }

    @objc public func saveImage(_ call: CAPPluginCall) {
        let maximumBytes = 8 * 1024 * 1024
        let signature: [UInt8] = [137, 80, 78, 71, 13, 10, 26, 10]
        guard let name = call.getString("fileName"), name.utf8.count <= 100,
              name.range(of: "\\A[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.png\\z", options: .regularExpression) != nil,
              let encoded = call.getString("base64"), encoded.utf8.count <= ((maximumBytes + 2) / 3) * 4,
              let data = Data(base64Encoded: encoded), (signature.count...maximumBytes).contains(data.count),
              data.prefix(signature.count).elementsEqual(signature) else {
            call.reject("Invalid PNG image", "INVALID_IMAGE")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Image export closed", "SAVE_FAILED"); return }
            guard self.pendingCall == nil, self.shareCall == nil else { call.reject("Image export is already open", "EXPORT_BUSY"); return }
            guard let presenter = self.findTopViewController(from: self.bridge?.viewController),
                  presenter.viewIfLoaded?.window != nil,
                  !presenter.isBeingDismissed,
                  UIApplication.shared.applicationState != .background else {
                call.reject("Cannot open image destination", "SAVE_FAILED")
                return
            }
            self.pendingCall = call
#if DEBUG
            self.recordQAExport(.begin, presenter: presenter)
#endif
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("tu-tap-export-" + UUID().uuidString, isDirectory: true)
            self.exportDirectory = directory
            let file = directory.appendingPathComponent(name)
            // Chuẩn bị ảnh ngoài main thread; chỉ trình bộ chọn sau khi file đã ghi xong.
            self.exportQueue.async { [weak self] in
                do {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
                    try data.write(to: file, options: .atomic)
                } catch {
                    try? FileManager.default.removeItem(at: directory)
                    DispatchQueue.main.async { [weak self] in
                        guard let self = self, self.pendingCall === call else { return }
#if DEBUG
                        self.recordQAExport(.writeFailed, file: file, error: error)
#endif
                        self.finishExport(saved: nil, error: error)
                    }
                    return
                }
                DispatchQueue.main.async { [weak self] in
                    guard let self = self, self.pendingCall === call else {
                        try? FileManager.default.removeItem(at: directory)
                        return
                    }
#if DEBUG
                    self.recordQAExport(.fileWritten, file: file)
#endif
                    guard let presenter = self.findTopViewController(from: self.bridge?.viewController),
                          presenter.viewIfLoaded?.window != nil,
                          !presenter.isBeingDismissed,
                          UIApplication.shared.applicationState != .background else {
#if DEBUG
                        self.recordQAExport(.presenterUnavailable, file: file)
#endif
                        self.finishExport(saved: nil)
                        return
                    }
                    let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                    picker.delegate = self
                    picker.presentationController?.delegate = self
                    self.picker = picker
#if DEBUG
                    self.recordQAExport(.presentBefore, presenter: presenter, file: file)
#endif
                    presenter.present(picker, animated: true) { [weak self, weak picker] in
                        guard let self = self, let picker = picker, self.picker === picker else { return }
#if DEBUG
                        self.recordQAExport(.presentCompletion, presenter: picker.presentingViewController, file: file)
#endif
                        // UIKit chỉ hoàn tất quan hệ trình bày tại completion; không dọn file trong lúc mở picker.
                        guard picker.presentingViewController != nil else {
                            self.finishExport(saved: nil)
                            return
                        }
                        picker.presentationController?.delegate = self
                    }
                }
            }
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard controller === picker else { return }
#if DEBUG
        recordQAExport(.delegatePick, presenter: controller.presentingViewController)
#endif
        finishExport(saved: urls.isEmpty ? nil : true)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard controller === picker else { return }
#if DEBUG
        recordQAExport(.delegateCancel, presenter: controller.presentingViewController)
#endif
        finishExport(saved: false)
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard presentationController.presentedViewController === picker else { return }
#if DEBUG
        recordQAExport(.delegateDismiss, presenter: presentationController.presentingViewController)
#endif
        finishExport(saved: false)
    }

    private func finishExport(saved: Bool?, error: Error? = nil) {
#if DEBUG
        recordQAExport(saved == true ? .finishSaved : saved == false ? .finishCancelled : .finishFailed,
                       presenter: picker?.presentingViewController, error: error)
        qaExportFile = nil
#endif
        let call = pendingCall
        pendingCall = nil
        picker?.delegate = nil
        picker?.presentationController?.delegate = nil
        picker = nil
        if let directory = exportDirectory { try? FileManager.default.removeItem(at: directory) }
        exportDirectory = nil
        // Xóa owner trước callback để kết quả muộn không hoàn tất lượt xuất tiếp theo.
        if let saved = saved { call?.resolve(["saved": saved]) }
        else { call?.reject("Cannot save PNG image", "SAVE_FAILED", error) }
    }

    @objc public func shareImage(_ call: CAPPluginCall) {
        let maximumBytes = 8 * 1024 * 1024
        let signature: [UInt8] = [137, 80, 78, 71, 13, 10, 26, 10]
        guard let name = call.getString("fileName"), name.utf8.count <= 100,
              name.range(of: "\\A[A-Za-z0-9_-][A-Za-z0-9_.-]*\\.png\\z", options: .regularExpression) != nil,
              let encoded = call.getString("base64"), encoded.utf8.count <= ((maximumBytes + 2) / 3) * 4,
              let data = Data(base64Encoded: encoded), (signature.count...maximumBytes).contains(data.count),
              data.prefix(signature.count).elementsEqual(signature) else {
            call.reject("Invalid PNG image", "INVALID_IMAGE")
            return
        }
        let text = call.getString("text")
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Image export closed", "SHARE_FAILED"); return }
            guard self.pendingCall == nil, self.shareCall == nil else { call.reject("Image export is already open", "EXPORT_BUSY"); return }
            guard let presenter = self.findTopViewController(from: self.bridge?.viewController),
                  presenter.viewIfLoaded?.window != nil,
                  !presenter.isBeingDismissed,
                  UIApplication.shared.applicationState != .background else {
                call.reject("Cannot open share sheet", "SHARE_FAILED")
                return
            }
            self.shareCall = call
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("tu-tap-share-" + UUID().uuidString, isDirectory: true)
            self.shareDirectory = directory
            let file = directory.appendingPathComponent(name)
            self.exportQueue.async { [weak self] in
                do {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
                    try data.write(to: file, options: .atomic)
                } catch {
                    try? FileManager.default.removeItem(at: directory)
                    DispatchQueue.main.async { [weak self] in
                        guard let self = self, self.shareCall === call else { return }
                        self.finishShare(shared: nil, error: error)
                    }
                    return
                }
                DispatchQueue.main.async { [weak self] in
                    guard let self = self, self.shareCall === call else {
                        try? FileManager.default.removeItem(at: directory)
                        return
                    }
                    guard let presenter = self.findTopViewController(from: self.bridge?.viewController),
                          presenter.viewIfLoaded?.window != nil,
                          !presenter.isBeingDismissed,
                          UIApplication.shared.applicationState != .background else {
                        self.finishShare(shared: nil)
                        return
                    }
                    var items: [Any] = [file]
                    if let text = text, !text.isEmpty { items.append(text) }
                    let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
                    if let popover = controller.popoverPresentationController {
                        popover.sourceView = presenter.view
                        popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
                        popover.permittedArrowDirections = []
                    }
                    self.shareController = controller
                    controller.completionWithItemsHandler = { [weak self] _, completed, _, error in
                        DispatchQueue.main.async { [weak self] in
                            guard let self = self, self.shareCall === call else { return }
                            self.finishShare(shared: completed, error: error)
                        }
                    }
                    presenter.present(controller, animated: true) { [weak self, weak controller] in
                        guard let self = self, let controller = controller, self.shareController === controller else { return }
                        guard controller.presentingViewController != nil else {
                            self.finishShare(shared: nil)
                            return
                        }
                    }
                }
            }
        }
    }

    private func finishShare(shared: Bool?, error: Error? = nil) {
        let call = shareCall
        shareCall = nil
        shareController?.completionWithItemsHandler = nil
        shareController?.presentationController?.delegate = nil
        shareController = nil
        if let directory = shareDirectory { try? FileManager.default.removeItem(at: directory) }
        shareDirectory = nil
        if let error = error { call?.reject("Cannot share PNG image", "SHARE_FAILED", error) }
        else if let shared = shared { call?.resolve(["shared": shared]) }
        else { call?.reject("Cannot open share sheet", "SHARE_FAILED") }
    }

    deinit {
        if let directory = exportDirectory { try? FileManager.default.removeItem(at: directory) }
        shareController?.completionWithItemsHandler = nil
        if let directory = shareDirectory { try? FileManager.default.removeItem(at: directory) }
        shareCall?.reject("Image export closed", "SHARE_FAILED")
        pendingCall?.reject("Image export closed", "SAVE_FAILED")
    }
}

@objc(DivinationHistoryPlugin)
public class DivinationHistoryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DivinationHistoryPlugin"
    public let jsName = "DivinationHistory"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private func historyFile(_ call: CAPPluginCall, createDirectory: Bool = true) throws -> URL {
        guard let key = call.getString("key"), !key.isEmpty, key.count <= 160 else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        let manager = FileManager.default
        let support = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                      appropriateFor: nil, create: createDirectory)
        var directory = support.appendingPathComponent("DivinationHistory", isDirectory: true)
        if createDirectory {
            try manager.createDirectory(at: directory, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try directory.setResourceValues(values)
        }
        let name = Data(key.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_")
        return directory.appendingPathComponent(name + ".json")
    }

    @objc public func read(_ call: CAPPluginCall) {
        do {
            let file = try historyFile(call)
            let value = try String(contentsOf: file, encoding: .utf8)
            call.resolve(["value": value])
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            call.resolve(["value": "[]"])
        } catch {
            call.reject("Unable to read local divination history")
        }
    }

    @objc public func write(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("Missing divination history")
            return
        }
        do {
            try Data(value.utf8).write(to: historyFile(call), options: .atomic)
            call.resolve()
        } catch {
            call.reject("Unable to write local divination history")
        }
    }

    @objc public func remove(_ call: CAPPluginCall) {
        do {
            let file = try historyFile(call, createDirectory: false)
            let manager = FileManager.default
            let attributes = try manager.attributesOfItem(atPath: file.path)
            guard (attributes[.type] as? FileAttributeType) == .typeRegular else {
                throw CocoaError(.fileWriteInvalidFileName)
            }
            try manager.removeItem(at: file)
            call.resolve()
        } catch let error as CocoaError where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {
            call.resolve()
        } catch {
            call.reject("Unable to remove local divination history")
        }
    }
}

@objc(ScreenWakeLockPlugin)
public class ScreenWakeLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenWakeLockPlugin"
    public let jsName = "ScreenWakeLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setKeepScreenOn", returnType: CAPPluginReturnPromise)
    ]

    @objc public func setKeepScreenOn(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled", false)
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
            call.resolve()
        }
    }
}

@objc(ExternalLinksPlugin)
public class ExternalLinksPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ExternalLinksPlugin"
    public let jsName = "ExternalLinks"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openBrowser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openStore", returnType: CAPPluginReturnPromise)
    ]

    @objc public func openBrowser(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString),
              url.scheme == "https" else {
            call.reject("Invalid URL")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("Unable to open browser") }
            }
        }
    }

    @objc public func openStore(_ call: CAPPluginCall) {
        guard call.getString("url") == "https://apps.apple.com/app/id6829182305",
              let url = URL(string: "itms-apps://apps.apple.com/app/id6829182305"),
              let fallback = URL(string: "https://apps.apple.com/app/id6829182305") else {
            call.reject("Invalid App Store URL")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else {
                    UIApplication.shared.open(fallback, options: [:]) { fallbackOpened in
                        if fallbackOpened { call.resolve() }
                        else { call.reject("Unable to open App Store") }
                    }
                }
            }
        }
    }
}

@objc(PracticeHapticsPlugin)
public class PracticeHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PracticeHapticsPlugin"
    public let jsName = "PracticeHaptics"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "rosaryBead", returnType: CAPPluginReturnPromise)]

    @MainActor private lazy var selection = UISelectionFeedbackGenerator()
    @MainActor private lazy var completion = UINotificationFeedbackGenerator()

    @objc public func rosaryBead(_ call: CAPPluginCall) {
        let completedCycle = call.getBool("completedCycle", false)
        DispatchQueue.main.async {
            if self.bridge?.webView?.window?.isKeyWindow == true,
               UIApplication.shared.applicationState == .active {
                if completedCycle {
                    self.completion.notificationOccurred(.success)
                } else {
                    self.selection.selectionChanged()
                }
                self.selection.prepare()
            }
            call.resolve()
        }
    }
}

// Keep the native bottom safe area in the same color as the active web surface.
@objc(AppSystemBarsPlugin)
public class AppSystemBarsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppSystemBarsPlugin"
    public let jsName = "AppSystemBars"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise)]

    @objc public func setStyle(_ call: CAPPluginCall) {
        guard let hex = call.getString("backgroundColor"), hex.count == 7, hex.first == "#",
              let value = UInt32(hex.dropFirst(), radix: 16) else {
            call.reject("Invalid system bar background")
            return
        }
        let color = UIColor(red: CGFloat((value >> 16) & 255) / 255,
                            green: CGFloat((value >> 8) & 255) / 255,
                            blue: CGFloat(value & 255) / 255, alpha: 1)
        DispatchQueue.main.async {
            self.bridge?.viewController?.view.backgroundColor = color
            self.bridge?.webView?.backgroundColor = color
            self.bridge?.webView?.scrollView.backgroundColor = color
            if #available(iOS 15.0, *) {
                self.bridge?.webView?.underPageBackgroundColor = color
            }
            call.resolve()
        }
    }
}
#if DEBUG && targetEnvironment(simulator)
private enum TuTapQADivinationRemovalProbe {
    private static var scheduled = false
    private struct Fixture {
        let owner: String
        let slot: String
        let key: String
        let value: String
        let file: URL
    }
    private enum Failure: Error { case check(String) }

    static func schedule(_ candidate: CAPBridgeProtocol?) {
        let args = ProcessInfo.processInfo.arguments
        guard !scheduled, args.contains("-tutam-qa-events"),
              let index = args.firstIndex(of: "-tutam-qa-r02-remove"), index + 1 < args.count,
              let nonce = UUID(uuidString: args[index + 1]),
              let bridge = candidate as? CapacitorBridge, bridge.isSimEnvironment else { return }
        scheduled = true
        // Public getter of the same serial queue used by installed CapacitorBridge.handleJSCall.
        bridge.dispatchQueue.async {
            run(bridge.plugin(withName: "DivinationHistory") as? DivinationHistoryPlugin,
                nonce: nonce.uuidString.lowercased())
        }
    }

    private static func require(_ condition: Bool, _ message: String) throws {
        if !condition { throw Failure.check(message) }
    }

    private static func existsRegular(_ file: URL) throws -> Bool {
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
            try require((attributes[.type] as? FileAttributeType) == .typeRegular, "Unexpected nonregular fixture path")
            return true
        } catch let error as CocoaError where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {
            return false
        }
    }

    private static func invoke(_ plugin: DivinationHistoryPlugin, _ method: String, key: String,
                               value: String? = nil, rejectExpected: Bool = false,
                               calls: inout [[String: Any]]) throws -> String? {
        var options: [String: Any] = ["key": key]
        if let value { options["value"] = value }
        var resolved = false, rejected = false, callbacks = 0
        var returned: String?
        guard let call = CAPPluginCall(callbackId: "qa-r02-" + UUID().uuidString, methodName: method,
            options: options, success: { result, _ in
                callbacks += 1; resolved = true; returned = result?.data?["value"] as? String
            }, error: { _ in callbacks += 1; rejected = true }) else {
            throw Failure.check("CAPPluginCall initializer failed")
        }
        switch method {
        case "write": plugin.write(call)
        case "read": plugin.read(call)
        case "remove": plugin.remove(call)
        default: throw Failure.check("Unsupported probe action")
        }
        calls.append(["method": method, "resolved": resolved, "rejected": rejected,
                      "callbackCount": callbacks, "rejectExpected": rejectExpected])
        try require(callbacks == 1 && resolved == !rejectExpected && rejected == rejectExpected,
                    "Public plugin completion did not match the expected result")
        return returned
    }

    private static func run(_ registered: DivinationHistoryPlugin?, nonce: String) {
        let manager = FileManager.default
        var calls: [[String: Any]] = [], observations: [[String: Any]] = []
        var owned: [Fixture] = [], cleanup: [[String: Any]] = []
        var report: [String: Any] = ["probe": "R02-native-remove", "version": 1, "nonce": nonce,
            "registeredPlugin": registered != nil, "simulatorOnly": true, "sdkSerialQueue": true,
            "actualAnonymousAccessed": false, "actualAccountAccessed": false,
            "networkCallsByProbe": 0, "pass": false,
            "scope": "Direct public CAPPluginCall on registered instance and SDK queue; not JS nativePromise marshalling",
            "errorScope": "Invalid-key rejection only; no iOS permission-fault matrix",
            "guestScope": "UUID-owned guest fixture; real anonymous namespace remains JS-unit coverage"]
        do {
            guard let plugin = registered else { throw Failure.check("Registered DivinationHistory plugin missing") }
            let support = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
                .appendingPathComponent("DivinationHistory", isDirectory: true)
            let slots = [("history", "tt_divination_history_v1"), ("bio", "tt_biorhythm_profile_v1"), ("dream", "tt_dream_journal_v1")]
            let fixtures = ["a", "b", "guest-fixture"].flatMap { owner in slots.map { item -> Fixture in
                let slot = item.0, suffix = item.1
                let key = "quangtu_principal_v1:qa-r02-\(owner)-\(nonce):\(suffix)"
                let name = Data(key.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_") + ".json"
                return Fixture(owner: owner, slot: slot, key: key, value: "[\"qa-r02-\(nonce)-\(owner)-\(slot)\"]",
                               file: support.appendingPathComponent(name))
            }}
            // No fixture data is read or written until all nine exact UUID paths are absent.
            for fixture in fixtures { try require(try !existsRegular(fixture.file), "UUID fixture preflight collided") }
            for fixture in fixtures {
                owned.append(fixture)
                _ = try invoke(plugin, "write", key: fixture.key, value: fixture.value, calls: &calls)
                try require(try existsRegular(fixture.file), "Native write did not create its expected regular file")
                try require(try Data(contentsOf: fixture.file) == Data(fixture.value.utf8), "Written fixture bytes differ")
                let read = try invoke(plugin, "read", key: fixture.key, calls: &calls)
                try require(read == fixture.value, "Public native read did not return owned fixture bytes")
                observations.append(["owner": fixture.owner, "slot": fixture.slot, "nativeWriteAndRead": true,
                                     "fileManagerRegularFile": true, "byteCount": fixture.value.utf8.count])
            }
            for fixture in fixtures where fixture.owner == "a" {
                _ = try invoke(plugin, "remove", key: fixture.key, calls: &calls)
                try require(try !existsRegular(fixture.file), "A fixture remained after public remove")
                observations.append(["owner": fixture.owner, "slot": fixture.slot, "fileManagerAbsentAfterRemove": true])
            }
            for fixture in fixtures where fixture.owner != "a" {
                try require(try existsRegular(fixture.file), "Other-principal fixture was removed")
                try require(try Data(contentsOf: fixture.file) == Data(fixture.value.utf8), "Other-principal fixture bytes changed")
                observations.append(["owner": fixture.owner, "slot": fixture.slot, "preservedBytesAfterARemoves": true])
            }
            guard let first = fixtures.first else { throw Failure.check("Missing A fixture") }
            _ = try invoke(plugin, "remove", key: first.key, calls: &calls)
            _ = try invoke(plugin, "remove", key: first.key, calls: &calls)
            _ = try invoke(plugin, "remove", key: String(repeating: "x", count: 161), rejectExpected: true, calls: &calls)
            report["assertionsCompleted"] = true
        } catch {
            report["assertionsCompleted"] = false
            report["fatal"] = String(describing: error)
        }
        // Exact tracked list only. Verify fixture identity; never enumerate/delete a directory or a symlink.
        for fixture in owned.reversed() {
            do {
                if try existsRegular(fixture.file) {
                    try require(try Data(contentsOf: fixture.file) == Data(fixture.value.utf8), "Cleanup fixture identity changed")
                    try manager.removeItem(at: fixture.file)
                }
                try require(try !existsRegular(fixture.file), "Fixture remained after cleanup")
                cleanup.append(["owner": fixture.owner, "slot": fixture.slot, "absent": true])
            } catch {
                cleanup.append(["owner": fixture.owner, "slot": fixture.slot, "absent": false,
                                "errorDomain": (error as NSError).domain, "errorCode": (error as NSError).code])
            }
        }
        report["calls"] = calls; report["observations"] = observations; report["cleanup"] = cleanup
        report["parentDirectoryRetained"] = true
        report["pass"] = (report["assertionsCompleted"] as? Bool) == true && owned.count == 9
            && cleanup.count == 9 && cleanup.allSatisfy { ($0["absent"] as? Bool) == true }
        report["finishedAt"] = ISO8601DateFormatter().string(from: Date())
        do {
            let caches = try manager.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
            let output = caches.appendingPathComponent("native-r02-divination-remove-\(nonce).json")
            // This UUID's output is never overwritten. Host waits for complete parseable JSON.
            try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
                .write(to: output, options: .withoutOverwriting)
        } catch {
            NSLog("[TutamQA] R02 probe report could not be written")
        }
    }
}
#endif
