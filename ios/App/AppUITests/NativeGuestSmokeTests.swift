import XCTest
import UIKit
import Vision

// Audit CI tách mỗi lớp trên runner mới; các phương thức cùng lớp vẫn dùng chung app/quyền.
// Không chỉnh storage hoặc quyền bằng test hook.
class NativeGuestUITestCase: XCTestCase {
    private var evidenceApplication: XCUIApplication?

    override func tearDown() async throws {
        await MainActor.run {
            if let app = evidenceApplication {
                evidence("final-" + name, app: app)
                evidence("system-final-" + name, app: XCUIApplication(bundleIdentifier: "com.apple.springboard"))
            }
            XCUIDevice.shared.orientation = .portrait
        }
        try await super.tearDown()
    }

    @MainActor
    func evidence(_ name: String, app: XCUIApplication) {
        // Lấy snapshot AX trước để WebKit kết thúc cập nhật layout trước ảnh hiển thị tương ứng.
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"
        tree.lifetime = .keepAlways
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        add(tree)
    }

    @MainActor
    func launchGuest(retryBlankWebView: Bool = false) -> XCUIApplication {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        evidenceApplication = app
        app.launchArguments = ["-tutam-qa-events", "1", "-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30), "Native WKWebView must load")
        if retryBlankWebView {
            let startupPrompt = startupNotificationPrompt(app)
            let visible = NSPredicate { _, _ in app.links["Cá nhân"].firstMatch.exists || startupPrompt.exists }
            let ready = XCTNSPredicateExpectation(predicate: visible, object: NSObject())
            if XCTWaiter.wait(for: [ready], timeout: 120) != .completed {
                evidence("audio-setup-before-relaunch", app: app)
                XCTAssertFalse(app.webViews.firstMatch.buttons.firstMatch.exists,
                               "A rendered page with unexpected controls must remain visible for diagnosis")
                app.terminate()
                app.launch()
                let retried = XCTNSPredicateExpectation(predicate: visible, object: NSObject())
                XCTAssertEqual(XCTWaiter.wait(for: [retried], timeout: 120), .completed,
                               "The simulator WebView must reach startup UI before testing playback")
            }
        }
        waitForStartupCoverToClear(app)
        deferStartupNotificationPrompt(app, timeout: 15)
        let personalTab = app.links["Cá nhân"].firstMatch
        if !personalTab.waitForExistence(timeout: 20) { deferStartupNotificationPrompt(app) }
        XCTAssertTrue(personalTab.waitForExistence(timeout: 10), "Native app must finish rendering its navigation")
        return app
    }

    @MainActor
    func waitUntil(_ message: String, timeout: TimeInterval = 15, _ condition: @escaping () -> Bool) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: NSObject())
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: timeout), .completed, message)
    }

    @MainActor
    func startupNotificationPrompt(_ app: XCUIApplication) -> XCUIElement {
        // iOS can change the generated dialog role's language after a cold deep link.
        // Match the app-owned name while keeping the role suffix outside the contract.
        return app.webViews.firstMatch.otherElements.matching(NSPredicate(
            format: "label BEGINSWITH %@ OR label BEGINSWITH %@",
            "Thông báo tu tập,", "Practice notifications,"
        )).firstMatch
    }

    @MainActor
    func waitForStartupCoverToClear(_ app: XCUIApplication) {
        let web = app.webViews.firstMatch
        let status = web.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Ứng dụng Tu tập Phật pháp")).firstMatch
        let loading = web.staticTexts.matching(NSPredicate(format: "label IN %@", ["Đang tải ứng dụng...", "Loading app..."] as NSArray)).firstMatch
        let prompt = startupNotificationPrompt(app)
        let personal = app.links["Cá nhân"].firstMatch
        waitUntil("The actual loading artwork must clear before touching the rendered app", timeout: 60) {
            app.state == .runningForeground && (personal.exists || prompt.exists) && !status.exists && !loading.exists
        }
    }

    @MainActor
    func deferStartupNotificationPrompt(_ app: XCUIApplication, timeout: TimeInterval = 0) {
        let prompt = startupNotificationPrompt(app)
        guard prompt.exists || (timeout > 0 && prompt.waitForExistence(timeout: timeout)) else { return }
        let later = prompt.buttons.matching(NSPredicate(
            format: "label IN %@", ["Để sau", "Maybe later"] as NSArray
        )).firstMatch
        XCTAssertTrue(later.waitForExistence(timeout: 5) && later.isHittable,
                      "The app's startup notification dialog must allow users to continue")
        var previousFrame: CGRect?
        waitUntil("The Later button must settle inside the foreground notification dialog") {
            let frame = later.frame
            let ready = app.state == .runningForeground && self.insideViewport(later, app: app)
                && prompt.frame.contains(frame) && previousFrame == frame
            previousFrame = frame
            return ready
        }
        later.tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in !prompt.exists }, object: NSObject())
        if XCTWaiter.wait(for: [dismissed], timeout: 3) == .timedOut && prompt.exists && later.isHittable {
            // WebKit can cancel the first touch before it generates a click.
            evidence("startup-notification-still-visible", app: app)
            later.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        waitUntil("The app's notification dialog must close after choosing later") { !prompt.exists }
    }

    @MainActor
    func openNativeLink(_ url: URL, app: XCUIApplication) {
        XCUIDevice.shared.system.open(url)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let prompt = springboard.alerts.firstMatch
        let open = prompt.buttons.matching(NSPredicate(format: "label IN %@", ["Open", "Mở"] as NSArray)).firstMatch
        if open.waitForExistence(timeout: 6) {
            let appName = NSPredicate(format: "label CONTAINS[cd] %@", "Tu tập")
            XCTAssertTrue(prompt.label.localizedCaseInsensitiveContains("Tu tập")
                          || prompt.staticTexts.matching(appName).firstMatch.exists,
                          "The Open action must belong to the system confirmation for Tu tập")
            XCTAssertTrue(open.isHittable)
            open.tap()
            waitUntil("The system confirmation for Tu tập must close after choosing Open") { !prompt.exists }
        }
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15), "The system must deliver the URL to Tu tập")
    }

    @MainActor
    func allowExpectedNotificationPermission(_ app: XCUIApplication, required: Bool = true) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let expected = NSPredicate(format: "label CONTAINS[cd] %@ AND (label CONTAINS[cd] %@ OR label CONTAINS[cd] %@)", "Tu tập", "notification", "thông báo")
        let system = springboard.alerts.matching(expected).firstMatch
        let local = app.alerts.matching(expected).firstMatch
        // Không cố định owner sau lần chờ đầu: iOS có thể xuất alert SpringBoard trễ hơn cây AX app.
        if required {
            waitUntil("Fresh install must expose this app's actual notification authorization alert", timeout: 30) { system.exists || local.exists }
        } else {
            let offered = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in system.exists || local.exists }, object: NSObject())
            guard XCTWaiter.wait(for: [offered], timeout: 6) == .completed else { return }
        }
        let alert = system.exists ? system : local
        let words = ([alert.label] + alert.staticTexts.allElementsBoundByIndex.map { $0.label }).joined(separator: " ").lowercased()
        XCTAssertTrue(words.contains("tu tập") && (words.contains("notification") || words.contains("thông báo")), "Only this app's notification permission may be granted")
        let allow = alert.buttons.matching(NSPredicate(format: "label IN %@", ["Allow", "Cho phép", "Cho Phép"] as NSArray)).firstMatch
        XCTAssertTrue(allow.waitForExistence(timeout: 5), "Expected exact affirmative notification permission button inside the verified alert")
        allow.tap()
        waitUntil("Accepted notification permission dialog must dismiss") { !alert.exists }
    }

    @MainActor
    func insideViewport(_ element: XCUIElement, viewport: CGRect) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame
        return frame.width > 0 && frame.height > 0 && viewport.contains(frame) && element.isHittable
    }

    @MainActor
    func insideViewport(_ element: XCUIElement, app: XCUIApplication) -> Bool {
        insideViewport(element, viewport: app.frame)
    }

    @MainActor
    func dismissPracticeSyncNotice(_ app: XCUIApplication) {
        // Chỉ xử lý banner công phu đã lưu, không chạm các nút Để sau của hướng dẫn/thông báo tài khoản.
        let message = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Đã lưu trên thiết bị. Đăng nhập lại để đồng bộ công phu.")).firstMatch
        guard message.exists else { return }
        let viewport = app.frame
        let noticeFrame = message.frame
        guard viewport.intersects(noticeFrame) else { return }
        let candidates = app.buttons.matching(identifier: "Để sau").allElementsBoundByIndex
        if let later = candidates.first(where: {
            let frame = $0.frame
            return frame.width > 0 && frame.height > 0 && viewport.contains(frame) &&
                frame.minY >= noticeFrame.minY && frame.minY <= noticeFrame.maxY + 100 &&
                frame.midX >= noticeFrame.minX && frame.midX <= noticeFrame.maxX && $0.isHittable
        }) {
            later.tap()
            waitUntil("Dismissed practice-sync notice must disappear") { !message.exists }
        }
    }

    @MainActor
    func reveal(_ element: XCUIElement, app: XCUIApplication) {
        // WKWebView có thể chưa đưa control ngoài màn hình vào AX; phải tìm bằng cuộn trước khi kết luận thiếu.
        var viewport = app.frame
        let dialog = app.otherElements.matching(NSPredicate(format: "label ENDSWITH %@ OR label ENDSWITH %@", "hộp thoại web", "web dialog")).firstMatch
        if dialog.exists {
            // aria-modal ẩn cây AX phía sau; chỉ dùng khung dialog, không truy vấn footer nền.
            viewport = viewport.intersection(dialog.frame)
        } else {
            let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Điều hướng nhanh", "Quick navigation")).firstMatch
            if navigation.exists {
                let frame = navigation.frame
                if frame.width > 0 && frame.minY > viewport.midY && frame.minY < viewport.maxY {
                    // WebKit có thể báo hittable cho nội dung nằm dưới thanh điều hướng fixed.
                    viewport.size.height = frame.minY - viewport.minY
                }
            }
        }
        let keyboard = app.keyboards.firstMatch
        if keyboard.exists {
            let frame = keyboard.frame
            if frame.width > 0 && frame.minY > viewport.minY {
                viewport.size.height = min(viewport.maxY, frame.minY) - viewport.minY
                let toolbar = app.toolbars.firstMatch
                if toolbar.exists {
                    let bar = toolbar.frame
                    if bar.height > 0 && bar.minY > viewport.minY && bar.maxY <= frame.minY {
                        viewport.size.height = min(viewport.maxY, bar.minY) - viewport.minY
                    }
                }
            }
        }
        for attempt in 0..<14 {
            if element.exists {
                let frame = element.frame
                if frame.width > 0 && frame.height > 0 {
                    if viewport.contains(frame) && element.isHittable { return }
                    if frame.midY < viewport.midY { app.swipeDown() }
                    else { app.swipeUp() }
                    continue
                }
            }
            if attempt < 7 {
                app.swipeUp()
            } else {
                app.swipeDown()
            }
        }
        evidence("unreachable-control", app: app)
        XCTAssertTrue(element.exists, "Expected actual native accessibility control after bounded scroll search")
        XCTAssertTrue(insideViewport(element, viewport: viewport), "Control must be visible and reachable inside the native viewport")
    }

    @MainActor
    func tap(_ element: XCUIElement, app: XCUIApplication) {
        reveal(element, app: app)
        element.tap()
    }

    @MainActor
    func homeLoginReady(_ element: XCUIElement, app: XCUIApplication) -> Bool {
        reveal(element, app: app)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        var capturedInterruption = false
        var previousFrame: CGRect?
        var ready = false
        waitUntil("Home login requires an unobstructed, stable native control") {
            let visibleBanner = springboard.descendants(matching: .any)
                .matching(identifier: "NotificationShortLookView").allElementsBoundByIndex.contains {
                    let frame = $0.frame
                    return frame.width > 0 && frame.height > 0 && app.frame.intersects(frame)
                }
            if visibleBanner {
                if !capturedInterruption {
                    self.evidence("home-login-system-interruption", app: springboard)
                    capturedInterruption = true
                }
                previousFrame = nil
                return false
            }
            guard self.insideViewport(element, app: app), element.isEnabled else {
                previousFrame = nil
                return false
            }
            let frame = element.frame
            ready = previousFrame == frame
            previousFrame = frame
            return ready
        }
        return ready
    }

    @MainActor
    func navigate(_ label: String, app: XCUIApplication, captureNavigationEvidence: Bool = true) {
        deferStartupNotificationPrompt(app)
        dismissPracticeSyncNotice(app)
        let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Điều hướng nhanh", "Quick navigation")).firstMatch
        XCTAssertTrue(navigation.waitForExistence(timeout: 20), "Bottom tab tap must belong to the actual navigation group")
        let links = navigation.links.matching(identifier: label)
        XCTAssertTrue(links.firstMatch.waitForExistence(timeout: 20), "Bottom navigation must expose \(label)")
        let viewport = app.frame
        let footer = navigation.frame
        let visible = links.allElementsBoundByIndex.compactMap { element -> (XCUIElement, CGRect)? in
            let frame = element.frame
            return frame.width > 0 && frame.height > 0 && viewport.contains(frame) && footer.contains(frame) ? (element, frame) : nil
        }
        guard visible.count == 1, let tab = visible.first?.0 else {
            evidence("missing-bottom-tab-" + label, app: app)
            XCTFail("Expected one visible link inside the actual bottom navigation: \(label)")
            return
        }
        if captureNavigationEvidence { evidence("navigation-before-" + label, app: app) }
        let targetViewport = app.frame
        let navigationFrame = navigation.frame
        let labelFrame = tab.frame
        let target = CGPoint(x: labelFrame.midX, y: (navigationFrame.minY + labelFrame.minY) / 2)
        guard navigationFrame.contains(labelFrame), navigationFrame.contains(target), targetViewport.contains(target) else {
            evidence("invalid-bottom-tab-icon-target-" + label, app: app)
            XCTFail("Visible footer icon target must lie inside its actual navigation group")
            return
        }
        // Một lần chạm bằng cử chỉ tap của SDK; không lặp tap để vượt kiểm tra đích đến.
        app.coordinate(withNormalizedOffset: CGVector(dx: (target.x - targetViewport.minX) / targetViewport.width, dy: (target.y - targetViewport.minY) / targetViewport.height)).tap()
        let marker: XCUIElement
        switch label {
        case "Trang chủ": marker = app.buttons["Tạo ảnh"].firstMatch
        case "Cá nhân": marker = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cài đặt ứng dụng ")).firstMatch
        case "Kinh sách": marker = app.staticTexts["Kho Kinh Sách"].firstMatch
        case "Pháp thoại": marker = app.searchFields["Tìm kiếm album..."].firstMatch
        case "Tu tập": marker = app.otherElements["Không gian Tu Tập"].firstMatch
        default:
            XCTFail("Missing destination contract for tested navigation tab \(label)")
            return
        }
        if !marker.waitForExistence(timeout: 30) {
            evidence("navigation-first-tap-failed-" + label, app: app)
            // Chỉ chẩn đoán touch/hover: dù lần hai tới đích, yêu cầu một lần chạm vẫn FAIL.
            let diagnosticViewport = app.frame
            let diagnosticFooter = navigation.frame
            let diagnosticLabel = tab.frame
            let diagnosticPoint = CGPoint(x: diagnosticLabel.midX, y: (diagnosticFooter.minY + diagnosticLabel.minY) / 2)
            if diagnosticLabel.width > 0 && diagnosticLabel.height > 0 &&
                diagnosticFooter.contains(diagnosticLabel) && diagnosticFooter.contains(diagnosticPoint) && diagnosticViewport.contains(diagnosticPoint) {
                app.coordinate(withNormalizedOffset: CGVector(dx: (diagnosticPoint.x - diagnosticViewport.minX) / diagnosticViewport.width,
                    dy: (diagnosticPoint.y - diagnosticViewport.minY) / diagnosticViewport.height)).tap()
                let reachedAfterDiagnosticTap = marker.waitForExistence(timeout: 10)
                evidence("navigation-diagnostic-second-tap-\(reachedAfterDiagnosticTap ? "reached" : "missing")-" + label, app: app)
            } else {
                evidence("navigation-diagnostic-second-tap-invalid-geometry-" + label, app: app)
            }
            XCTFail("Native tab must reach its actual destination after one tap; diagnostic second tap cannot satisfy this requirement")
            return
        }
        if captureNavigationEvidence { evidence("navigation-after-" + label, app: app) }
    }

    @MainActor
    func openSettings(_ app: XCUIApplication, captureNavigationEvidence: Bool = true) {
        let master = app.switches["Bật thông báo nhắc nhở tu tập"].firstMatch
        // Quay lại từ Notification Center vẫn ở settings; bấm lại tab hiện tại không xóa query tab=settings.
        if master.exists {
            let frame = master.frame
            if frame.width > 0 && frame.height > 0 { return }
        }
        navigate("Cá nhân", app: app, captureNavigationEvidence: captureNavigationEvidence)
        let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cài đặt ứng dụng")).firstMatch
        tap(settings, app: app)
        reveal(master, app: app)
        XCTAssertTrue(app.switches["Bật thông báo nhắc nhở tu tập"].firstMatch.waitForExistence(timeout: 20))
    }

    @MainActor
    func openAppearance(_ app: XCUIApplication) {
        let motion = app.switches["Hiệu ứng chuyển động"].firstMatch
        if !motion.exists || motion.frame.width == 0 || motion.frame.height == 0 {
            let summary = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label != %@", "Giao diện & ngôn ngữ ", "Giao diện & ngôn ngữ")).firstMatch
            tap(summary, app: app)
        }
        reveal(motion, app: app)
    }

    @MainActor
    func labelledToggle(_ label: String, app: XCUIApplication) -> XCUIElement {
        // WebKit exposes aria-pressed controls as Switch on some iOS versions.
        let toggle = app.switches[label].firstMatch
        return toggle.exists ? toggle : app.buttons[label].firstMatch
    }

    @MainActor
    func checked(_ element: XCUIElement) -> Bool? {
        let value = element.value
        if let text = value as? String {
            if ["1", "true"].contains(text.lowercased()) { return true }
            if ["0", "false"].contains(text.lowercased()) { return false }
        }
        return (value as? NSNumber)?.boolValue
    }

    @MainActor
    func setMotion(_ enabled: Bool, app: XCUIApplication) {
        let toggle = app.switches["Hiệu ứng chuyển động"].firstMatch
        reveal(toggle, app: app)
        XCTAssertNotNil(checked(toggle), "Actual motion switch must expose checked state")
        if checked(toggle) != enabled { toggle.tap() }
        waitUntil("Motion switch must reflect requested state") { self.checked(toggle) == enabled }
    }

    @MainActor
    func revealContentControl(_ card: XCUIElement, app: XCUIApplication) {
        func contentViewport(_ frame: CGRect) -> CGRect? {
            let chromeTolerance: CGFloat = 2
            guard frame.width.isFinite && frame.height.isFinite && frame.minX.isFinite && frame.minY.isFinite,
                  frame.width > 0 && frame.height > 0 else { return nil }
            let headers = app.otherElements.matching(NSPredicate(format: "label == %@ OR label == %@ OR label == %@ OR label == %@ OR label == %@ OR label == %@", "biểu ngữ", "banner", "Tu tập Phật pháp, điều hướng", "Tu Tập Phật Pháp, điều hướng", "Tu tập Phật pháp, navigation", "Tu Tập Phật Pháp, navigation")).allElementsBoundByIndex
            guard let headerFrame = headers.lazy.map({ $0.frame }).first(where: { bounds in
                return bounds.width > 0 && bounds.height > 0 && bounds.intersects(frame)
                    && bounds.minX >= frame.minX - chromeTolerance && bounds.maxX <= frame.maxX + chromeTolerance
                    && bounds.minY <= frame.minY + chromeTolerance && bounds.maxY > frame.minY && bounds.maxY < frame.midY
            }) else { return nil }
            let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Điều hướng nhanh", "Quick navigation")).firstMatch
            guard navigation.exists else { return nil }
            let footer = navigation.frame
            let clippedFooter = footer.intersection(frame)
            // Chỉ phần footer thật sự nhìn thấy giới hạn vùng kéo; đáy AX có thể vượt safe area của app.
            guard footer.width > 0 && footer.height > 0 && footer.intersects(frame),
                  footer.minX >= frame.minX - chromeTolerance && footer.maxX <= frame.maxX + chromeTolerance,
                  clippedFooter.width > 0 && clippedFooter.height >= 44,
                  clippedFooter.minY > frame.midY && clippedFooter.minY < frame.maxY else { return nil }
            let clippedHeader = headerFrame.intersection(frame)
            guard clippedHeader.width > 0 && clippedHeader.height > 0 else { return nil }
            let top = clippedHeader.maxY
            let bottom = clippedFooter.minY
            guard bottom > top else { return nil }
            return CGRect(x: frame.minX, y: top, width: frame.width, height: bottom - top)
        }
        for attempt in 0..<14 {
            // Chỉ dùng chung scalar trong lượt này; sau mỗi cử chỉ vòng lặp đọc AX mới.
            let frame = app.frame
            guard let viewport = contentViewport(frame) else {
                evidence("missing-content-control-chrome", app: app)
                XCTFail("Content control scrolling requires actual header and footer accessibility frames")
                return
            }
            let margin = min(CGFloat(12), viewport.height * 0.05)
            var delta: CGFloat
            let bounds = card.exists ? card.frame : .zero
            if bounds.width > 0 && bounds.height > 0 {
                guard viewport.height >= bounds.height && viewport.width >= bounds.width else {
                    evidence("oversized-content-control", app: app)
                    XCTFail("Whole control must fit the measured content viewport before scrolling")
                    return
                }
                if viewport.contains(bounds) && card.isHittable { return }
                if bounds.maxY > viewport.maxY { delta = bounds.maxY - viewport.maxY + margin }
                else if bounds.minY < viewport.minY { delta = bounds.minY - viewport.minY - margin }
                else { continue }
            } else {
                delta = viewport.height * (attempt < 7 ? 0.25 : -0.25)
            }
            // Kéo ngắn trong vùng nội dung thật; giữ cuối cử chỉ để không văng qua thẻ.
            let limit = viewport.height * 0.5
            delta = max(-limit, min(limit, delta))
            let x = bounds.width > 0 ? min(viewport.maxX - margin, max(viewport.minX + margin, bounds.midX)) : viewport.midX
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: (x - frame.minX) / frame.width, dy: (viewport.midY + delta / 2 - frame.minY) / frame.height))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: (x - frame.minX) / frame.width, dy: (viewport.midY - delta / 2 - frame.minY) / frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        if let viewport = contentViewport(app.frame), card.exists, viewport.contains(card.frame), card.isHittable { return }
        evidence("unreachable-content-control", app: app)
        XCTAssertTrue(card.exists, "Content control must exist after bounded content scrolling")
        if let viewport = contentViewport(app.frame) {
            XCTAssertTrue(insideViewport(card, viewport: viewport), "Whole control must fit between the actual header and footer")
            XCTAssertTrue(card.isHittable, "Content control must receive the single real tap")
        } else {
            XCTFail("Content chrome must remain measurable after scrolling")
        }
    }

    @MainActor
    func openRosaryFromCatalog(_ app: XCUIApplication) {
        dismissPracticeSyncNotice(app)
        let card = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Lần tràng hạt")).firstMatch
        revealContentControl(card, app: app)
        tap(card, app: app)
        let start = app.buttons["Bắt đầu 🙏"].firstMatch
        tap(start, app: app)
        XCTAssertTrue(app.buttons["Quay lại tu tập"].firstMatch.waitForExistence(timeout: 15))
    }

    @MainActor
    func rosaryCount(_ app: XCUIApplication) -> Int {
        let numbers = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+$"))
        XCTAssertEqual(numbers.count, 1, "Actual rosary counter must be uniquely exposed")
        guard let count = Int(numbers.firstMatch.label) else { XCTFail("Rosary counter must be numeric"); return -1 }
        return count
    }

    @MainActor
    func librarySearch(_ app: XCUIApplication) -> XCUIElement {
        let field = app.searchFields["Tìm kiếm bài viết"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        reveal(field, app: app)
        return field
    }

    @MainActor
    func rotate(_ orientation: UIDeviceOrientation, app: XCUIApplication) {
        XCUIDevice.shared.orientation = orientation
        waitUntil("Native viewport must complete rotation") {
            // UIKit can rotate while WebKit's remote accessibility snapshot is
            // being replaced. Wait on the physical screen before querying it.
            let size = XCUIScreen.main.screenshot().image.size
            return orientation == .portrait ? size.height > size.width : size.width > size.height
        }
    }
}

final class NativeGuestSmokeTests: NativeGuestUITestCase {
    private func normalizedQuoteFeedback(_ text: String) -> String {
        return text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .replacingOccurrences(of: "đ", with: "d")
            .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    private func containsQuoteSaveFeedback(_ text: String) -> Bool {
        let expected = ["Đã lưu ảnh PNG vào máy.", "Saved PNG image to your device."].map(normalizedQuoteFeedback)
        let lines = text.split(separator: "\n").map { normalizedQuoteFeedback(String($0)) }
        for start in lines.indices {
            var message = ""
            for line in lines[start...] {
                message += message.isEmpty ? line : " " + line
                if expected.contains(message) { return true }
                if !expected.contains(where: { $0.hasPrefix(message) }) { break }
            }
        }
        return false
    }

    @MainActor
    private func recognizeScreenTextObservations(_ screenshot: XCUIScreenshot) throws -> [VNRecognizedTextObservation] {
        guard let image = screenshot.image.cgImage else {
            throw NSError(domain: "NativeGuestSmokeTests.ScreenCapture", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "The screen capture has no image pixels"])
        }
        // Vision đọc pixel màn hình thật, độc lập với truy vấn AX từ xa của WebKit.
        // https://developer.apple.com/documentation/vision/recognizing-text-in-images
        let request = VNRecognizeTextRequest(completionHandler: nil)
        request.recognitionLevel = .accurate
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        return request.results ?? []
    }

    @MainActor
    private func recognizeScreenText(_ screenshot: XCUIScreenshot) throws -> String {
        return try recognizeScreenTextObservations(screenshot).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }

    private enum NativePickerSaveAction {
        case accessibility(XCUIElement)
        case recognizedText(CGRect)
    }

    @MainActor
    private func waitForNativePickerSave(_ app: XCUIApplication) -> NativePickerSaveAction? {
        let deadline = ProcessInfo.processInfo.systemUptime + 20
        let sheet = app.otherElements["Browse View (Picker)"].firstMatch
        let navigation = app.navigationBars["FullDocumentManagerViewControllerNavigationBar"].firstMatch
        let save = navigation.buttons.matching(NSPredicate(format: "label IN %@", ["Lưu", "Save"] as NSArray)).firstMatch
        var screenshot = XCUIScreen.main.screenshot()
        var recognizedText = ""
        var selectedNativeLocation = false
        repeat {
            if app.state == .runningForeground && sheet.exists && navigation.exists {
                let screen = app.frame
                let sheetFrame = sheet.frame
                let header = screen.intersection(sheetFrame).intersection(navigation.frame)
                if save.exists && save.isHittable && header.contains(save.frame) {
                    return .accessibility(save)
                }
                screenshot = XCUIScreen.main.screenshot()
                do {
                    let observations = try recognizeScreenTextObservations(screenshot)
                    recognizedText = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
                    let size = screenshot.image.size
                    guard screen.width > 0, screen.height > 0, size.width > 0, size.height > 0,
                          abs(size.width / size.height - screen.width / screen.height) < 0.01 else {
                        RunLoop.current.run(until: Date().addingTimeInterval(0.1))
                        continue
                    }
                    let recognizedControls = observations.compactMap { observation -> (label: String, frame: CGRect)? in
                        guard let text = observation.topCandidates(1).first?.string else { return nil }
                        // Vision trả tọa độ ảnh chuẩn hóa với gốc ở góc trái dưới.
                        // https://developer.apple.com/documentation/vision/vndetectedobjectobservation/boundingbox
                        let box = observation.boundingBox
                        let frame = CGRect(x: screen.minX + box.minX * screen.width,
                                           y: screen.minY + (1 - box.maxY) * screen.height,
                                           width: box.width * screen.width, height: box.height * screen.height)
                        return frame.width > 0 && frame.height > 0 ? (self.normalizedQuoteFeedback(text), frame) : nil
                    }
                    let candidates = recognizedControls.filter {
                        ["luu", "save"].contains($0.label) && header.contains($0.frame)
                    }.map { $0.frame }
                    if candidates.count == 1, let frame = candidates.first {
                        let image = XCTAttachment(screenshot: screenshot)
                        image.name = "quote-native-picker-visible-save-screen"
                        image.lifetime = .keepAlways
                        add(image)
                        let text = XCTAttachment(string: "Visible native Save bounds: \(frame)\n" + recognizedText)
                        text.name = "quote-native-picker-visible-save-recognized-text"
                        text.lifetime = .keepAlways
                        add(text)
                        return .recognizedText(frame)
                    }
                    // Bộ chọn mới có thể dừng ở Duyệt. Chọn vị trí thật một lần
                    // trong cùng ngân sách20giây, trước khi yêu cầu nút Lưu xuất hiện.
                    let browseHeaderVisible = recognizedControls.contains {
                        ["duyet", "browse"].contains($0.label) && header.contains($0.frame)
                    }
                    let locations = recognizedControls.filter {
                        ["tren iphone", "on my iphone"].contains($0.label) &&
                        screen.contains($0.frame) && sheetFrame.contains($0.frame) && $0.frame.minY >= header.maxY
                    }
                    let location = sheet.staticTexts.matching(NSPredicate(format: "label IN %@", ["Trên iPhone", "On My iPhone"] as NSArray)).firstMatch
                    if !selectedNativeLocation && browseHeaderVisible && locations.count == 1 && location.exists {
                        let frame = location.frame
                        if screen.contains(frame) && sheetFrame.contains(frame) &&
                            frame.intersects(locations[0].frame) && location.isHittable {
                            selectedNativeLocation = true
                            let image = XCTAttachment(screenshot: screenshot)
                            image.name = "quote-native-picker-before-location-selection"
                            image.lifetime = .keepAlways
                            add(image)
                            let text = XCTAttachment(string: "Selecting native location once: \(frame)\n" + recognizedText)
                            text.name = "quote-native-picker-location-recognized-text"
                            text.lifetime = .keepAlways
                            add(text)
                            location.tap()
                        }
                    }
                } catch {
                    recognizedText = "Vision text recognition failed: \(error)"
                }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while ProcessInfo.processInfo.systemUptime < deadline
        let image = XCTAttachment(screenshot: screenshot)
        image.name = "quote-native-picker-save-not-found-screen"
        image.lifetime = .keepAlways
        add(image)
        let text = XCTAttachment(string: recognizedText)
        text.name = "quote-native-picker-save-not-found-recognized-text"
        text.lifetime = .keepAlways
        add(text)
        return nil
    }

    @MainActor
    private func waitForVisibleQuoteSaveFeedback() {
        // Tiến trình Files có thể chặn AX lâu hơn thời gian toast hiện 2,8 giây.
        // Giữ ngân sách15giây cũ và kiểm tra đúng thông báo VI/EN đang hiển thị.
        let deadline = ProcessInfo.processInfo.systemUptime + 15
        var screenshot = XCUIScreen.main.screenshot()
        var recognizedText = ""
        var found = false
        repeat {
            screenshot = XCUIScreen.main.screenshot()
            do {
                recognizedText = try recognizeScreenText(screenshot)
                found = containsQuoteSaveFeedback(recognizedText)
            } catch {
                recognizedText = "Vision text recognition failed: \(error)"
            }
            if found { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        } while ProcessInfo.processInfo.systemUptime < deadline
        let image = XCTAttachment(screenshot: screenshot)
        image.name = "quote-native-save-feedback-screen"
        image.lifetime = .keepAlways
        add(image)
        let text = XCTAttachment(string: recognizedText)
        text.name = "quote-native-save-feedback-recognized-text"
        text.lifetime = .keepAlways
        add(text)
        XCTAssertTrue(found, "A completed native save must report its exact visible success message")
    }

    @MainActor
    func testQuoteImageUsesNativeSavePickerAndCancelKeepsDialogUsable() {
        let app = launchGuest()
        tap(app.buttons["Tạo ảnh"].firstMatch, app: app)
        let title = app.staticTexts["Tạo ảnh trích dẫn"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 15), "The home quote image dialog must open through its actual action")
        let saveImage = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Lưu ảnh")).firstMatch
        let loading = app.staticTexts["Đang tạo ảnh…"].firstMatch
        waitUntil("The bundled quote image must finish rendering before export", timeout: 30) {
            saveImage.exists && saveImage.isEnabled && !loading.exists
        }
        XCTAssertFalse(app.staticTexts["Không thể tải ảnh. Vui lòng thử lại."].firstMatch.exists)
        tap(saveImage, app: app)

        // iOS 26 exposes an off-sheet “Hủy” at the same screen position as the Files More button.
        let pickerNavigation = app.navigationBars["FullDocumentManagerViewControllerNavigationBar"].firstMatch
        let firstSaveAction = waitForNativePickerSave(app)
        XCTAssertNotNil(firstSaveAction, "PNG export must present the native Files destination picker instead of a blob navigation")
        guard let firstSaveAction = firstSaveAction else { return }
        XCTAssertTrue(pickerNavigation.exists, "The save action must belong to the native Files navigation")
        XCTAssertFalse(saveImage.isEnabled, "The export promise must remain pending while the native picker owns the file")
        evidence("quote-image-native-files-picker", app: app)
        let cancelLabels = NSPredicate(format: "label IN %@", ["Hủy", "Cancel"] as NSArray)
        let cancel = pickerNavigation.buttons.matching(cancelLabels).firstMatch
        if case .accessibility(_) = firstSaveAction, cancel.exists && cancel.isHittable {
            cancel.tap()
        } else {
            let sheet = app.otherElements["Browse View (Picker)"].firstMatch
            XCTAssertTrue(sheet.exists, "The Files sheet must be available for interactive dismissal")
            let handle = sheet.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.01))
            let bottom = sheet.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.94))
            handle.press(forDuration: 0.1, thenDragTo: bottom)
        }
        waitUntil("The native Files destination must dismiss when canceled") { !pickerNavigation.exists }
        waitUntil("Cancel must return to the existing quote dialog and settle its export state") {
            title.exists && saveImage.exists && saveImage.isEnabled
        }
        reveal(saveImage, app: app)
        XCTAssertTrue(insideViewport(saveImage, app: app), "Cancel must leave the quote image action reachable")
        let falseSuccess = app.staticTexts.matching(NSPredicate(format: "label IN %@", ["Đã lưu ảnh PNG vào máy.", "Đã bắt đầu tải ảnh PNG."] as NSArray)).firstMatch
        let unexpectedSuccess = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in falseSuccess.exists }, object: NSObject())
        unexpectedSuccess.isInverted = true
        XCTAssertEqual(XCTWaiter.wait(for: [unexpectedSuccess], timeout: 2), .completed, "Canceling the destination must not report a successful PNG save")
        evidence("quote-image-cancel-preserves-dialog", app: app)
        // Initialize Vision before saving so model startup cannot consume the short-lived toast.
        do {
            let canceledText = try recognizeScreenText(XCUIScreen.main.screenshot())
            XCTAssertFalse(containsQuoteSaveFeedback(canceledText), "Canceling must not display a successful native PNG save")
        } catch {
            XCTFail("Screen text recognition must be ready before the native save: \(error)")
            return
        }
        tap(saveImage, app: app)
        let secondSaveAction = waitForNativePickerSave(app)
        XCTAssertNotNil(secondSaveAction, "A second export must open a fresh native destination after cancellation")
        guard let secondSaveAction = secondSaveAction else { return }
        XCTAssertFalse(saveImage.isEnabled, "The second export must keep its source file until native completion")
        switch secondSaveAction {
        case .accessibility(let pickerSave):
            XCTAssertTrue(pickerSave.isHittable)
            pickerSave.tap()
        case .recognizedText(let frame):
            let viewport = app.frame
            let sheet = app.otherElements["Browse View (Picker)"].firstMatch
            guard app.state == .runningForeground && sheet.exists && pickerNavigation.exists && viewport.contains(frame) &&
                  sheet.frame.contains(frame) && pickerNavigation.frame.contains(frame) else {
                XCTFail("The recognized Save control must remain inside the foreground native picker header")
                return
            }
            app.coordinate(withNormalizedOffset: CGVector(dx: (frame.midX - viewport.minX) / viewport.width,
                dy: (frame.midY - viewport.minY) / viewport.height)).tap()
        }
        waitForVisibleQuoteSaveFeedback()
        waitUntil("Saving the native PNG must return to the usable quote dialog") {
            !pickerNavigation.exists && title.exists && saveImage.exists && saveImage.isEnabled
        }
        evidence("quote-image-native-save-completed", app: app)
        tap(app.buttons["Đóng"].firstMatch, app: app)
        waitUntil("The quote dialog must still close after canceling native export") { !title.exists }
        navigate("Cá nhân", app: app)
    }

    @MainActor
    func testRosaryBackPreservesCountInPortraitAndLandscape() {
        let app = launchGuest()
        navigate("Tu tập", app: app)
        openRosaryFromCatalog(app)
        for pass in 1...5 {
            for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
                rotate(orientation, app: app)
                let count = rosaryCount(app)
                tap(app.buttons["Niệm một hạt"].firstMatch, app: app)
                XCTAssertTrue(app.staticTexts[String(count + 1)].firstMatch.waitForExistence(timeout: 10))
                XCTAssertEqual(rosaryCount(app), count + 1, "One real tap must increase the rosary count exactly once")
                let back = app.buttons["Quay lại tu tập"].firstMatch
                reveal(back, app: app)
                XCTAssertGreaterThanOrEqual(back.frame.width, 44)
                XCTAssertGreaterThanOrEqual(back.frame.height, 44)
                evidence("rosary-pass-\(pass)-\(orientation == .portrait ? "portrait" : "landscape")", app: app)
                back.tap()
                waitUntil("Rosary back must close the tool") { !back.exists }
                openRosaryFromCatalog(app)
                XCTAssertEqual(rosaryCount(app), count + 1, "Real Back and catalog reopening must preserve the count")
            }
        }
    }

    @MainActor
    func testMotionSettingPersistsAcrossNativeDeepLinks() {
        let app = launchGuest()
        let homeLogin = app.buttons["Đăng nhập ngay"].firstMatch
        guard homeLoginReady(homeLogin, app: app) else { return }
        homeLogin.tap()
        XCTAssertFalse(app.buttons["Đăng nhập bằng Facebook"].exists)
        for label in ["Đăng nhập bằng Google", "Đăng nhập bằng Apple"] {
            let provider = app.buttons[label].firstMatch
            reveal(provider, app: app)
            XCTAssertTrue(insideViewport(provider, app: app), "Banner must open the real account page with a reachable provider: \(label)")
            XCTAssertTrue(provider.isEnabled)
        }
        evidence("home-login-banner-opens-native-account-providers", app: app)
        tap(app.buttons["Quay lại"].firstMatch, app: app)
        waitUntil("Account Back must leave the provider subpage before opening settings") {
            !app.buttons["Đăng nhập bằng Google"].firstMatch.exists
        }
        openSettings(app)
        openAppearance(app)
        XCTAssertEqual(checked(app.switches["Hiệu ứng chuyển động"].firstMatch), true, "Fresh install enables motion")
        setMotion(false, app: app)
        evidence("motion-off", app: app)
        // Một deep link ấm và một deep link lạnh kiểm chứng chính contract native, không dùng cho mọi bước điều hướng.
        openNativeLink(URL(string: "vn.quangtu.tutam:///tu-tap?action=rosary")!, app: app)
        deferStartupNotificationPrompt(app, timeout: 7)
        let startDialog = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Bắt Đầu Lần Hạt?")).firstMatch
        XCTAssertTrue(startDialog.waitForExistence(timeout: 20), "Warm rosary deep link must expose its actual confirmation dialog")
        let start = startDialog.buttons["Bắt đầu 🙏"].firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 15), "Rosary confirmation must expose its actual Start action")
        // Modal ẩn footer khỏi AX; không gọi reveal toàn trang trong lúc deep link đang mở modal.
        let viewport = app.frame
        let modalFrame = startDialog.frame
        let startFrame = start.frame
        guard startFrame.width >= 44 && startFrame.height >= 44 && viewport.contains(startFrame) &&
            modalFrame.contains(startFrame) && start.isHittable else {
            evidence("warm-rosary-start-invalid-geometry", app: app)
            XCTFail("Warm rosary Start must be visible and hittable inside the actual modal")
            return
        }
        app.coordinate(withNormalizedOffset: CGVector(dx: (startFrame.midX - viewport.minX) / viewport.width,
            dy: (startFrame.midY - viewport.minY) / viewport.height)).press(forDuration: 0.08)
        waitUntil("Warm rosary Start must close its confirmation dialog") { !startDialog.exists }
        evidence("rosary-motion-off", app: app)
        tap(app.buttons["Quay lại tu tập"].firstMatch, app: app)
        openSettings(app)
        openAppearance(app)
        XCTAssertEqual(checked(app.switches["Hiệu ứng chuyển động"].firstMatch), false)
        app.terminate()
        openNativeLink(URL(string: "vn.quangtu.tutam:///ca-nhan?tab=settings")!, app: app)
        deferStartupNotificationPrompt(app, timeout: 7)
        XCTAssertTrue(app.switches["Bật thông báo nhắc nhở tu tập"].firstMatch.waitForExistence(timeout: 30))
        openAppearance(app)
        XCTAssertEqual(checked(app.switches["Hiệu ứng chuyển động"].firstMatch), false, "Motion setting must survive native cold deep link")
        setMotion(true, app: app)
        evidence("motion-restored", app: app)
    }

    @MainActor
    func testExistingNotificationButtonDeliversToSystemNotificationCenter() {
        let app = launchGuest()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        openSettings(app)
        XCTAssertEqual(checked(app.switches["Bật thông báo nhắc nhở tu tập"].firstMatch), true)
        let sound = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Âm thanh & rung thông báo Âm thanh:")).firstMatch
        // Bấm summary thật sau khi đã cuộn nó vào viewport; không dựa vào exists của children mounted ẩn.
        reveal(sound, app: app)
        evidence("notification-sound-before", app: app)
        tap(sound, app: app)
        evidence("notification-sound-after", app: app)
        let send = app.buttons["🔔 Gửi thử thông báo mẫu"].firstMatch
        tap(send, app: app)
        allowExpectedNotificationPermission(app)
        // Nút trở lại tên thường sau promise schedule. Toast chỉ tồn tại 2.8s; bằng chứng cuối vẫn phải là iOS nhận thông báo.
        XCTAssertTrue(send.waitForExistence(timeout: 20), "Native test scheduling must finish before backgrounding")
        evidence("notification-scheduled", app: app)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(springboard.wait(for: .runningForeground, timeout: 10))
        let top = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.01))
        let bottom = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.80))
        top.press(forDuration: 0.1, thenDragTo: bottom)
        let title = "🔔 Kiểm tra thông báo Tu Tập Phật Pháp"
        let body = "Nhắc nhở tu tập hoạt động tốt!"
        let deliveredTitle = springboard.staticTexts[title].firstMatch
        let deliveredBody = springboard.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", body)).firstMatch
        let grouped = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", title, body)).firstMatch
        waitUntil("OS Notification Center must expose the exact test notification title and body", timeout: 25) {
            (deliveredTitle.exists && deliveredBody.exists) || grouped.exists
        }
        evidence("notification-system-received", app: springboard)
    }
}

final class NativeNotificationTypingTests: NativeGuestUITestCase {
    @MainActor
    func testNotificationPromptWaitsUntilUserFinishesTypingAfterResume() {
        let app = launchGuest()
        navigate("Kinh sách", app: app)
        let search = librarySearch(app)
        search.tap()
        search.typeText("kinh")
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 10))

        XCUIDevice.shared.press(.home)
        app.activate()
        let prompt = startupNotificationPrompt(app)
        XCTAssertFalse(prompt.waitForExistence(timeout: 3), "An automatic reminder must leave ongoing typing uninterrupted")
        search.typeText(" sach")
        XCTAssertEqual(search.value as? String, "kinh sach")
        evidence("notification-resume-with-real-keyboard", app: app)

        let filter = app.buttons["Lọc"].firstMatch
        XCTAssertTrue(filter.waitForExistence(timeout: 10) && filter.isHittable)
        filter.press(forDuration: 0.15)
        if keyboard.exists && !prompt.exists {
            let done = app.toolbars.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Xong", "Hoàn tất"] as NSArray)).firstMatch
            XCTAssertTrue(done.waitForExistence(timeout: 5) && done.isHittable)
            done.tap()
        }
        XCTAssertTrue(prompt.waitForExistence(timeout: 15), "After editing ends the pending notification dialog must appear")
        deferStartupNotificationPrompt(app)
        let categories = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Lọc theo danh mục")).firstMatch
        XCTAssertTrue(categories.waitForExistence(timeout: 10), "The held Filter tap must open the category control")
        XCTAssertEqual(search.value as? String, "kinh sach")
    }
}

final class NativeExtendedGuestTests: NativeGuestUITestCase {
    @MainActor
    private func reflectionGuidePercent(_ app: XCUIApplication) -> Int {
        let controls = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Chỉnh cỡ chữ hướng dẫn")).firstMatch
        let percent = controls.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]{2,3}%$")).firstMatch
        XCTAssertTrue(percent.waitForExistence(timeout: 10), "The actual guide font control must expose its percentage")
        guard let value = Int(percent.label.dropLast()) else {
            XCTFail("Guide font percentage must be numeric")
            return 0
        }
        return value
    }

    @MainActor
    private func reflectionGuideParagraphFrame(_ app: XCUIApplication) -> CGRect {
        let paragraph = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Sám là ăn năn lỗi trước, Hối là chừa bỏ lỗi sau")).firstMatch
        reveal(paragraph, app: app)
        var previous: CGRect?
        waitUntil("The same rendered guide paragraph must have stable, visible native text geometry") {
            guard paragraph.exists, app.frame.contains(paragraph.frame), paragraph.frame.height > 0 else { return false }
            let frame = paragraph.frame
            if previous == frame { return true }
            previous = frame
            return false
        }
        return paragraph.frame
    }

    @MainActor
    func testReflectionGuideFontButtonsResizeNativeTextAndPersistWithinLimits() {
        let app = launchGuest()
        navigate("Tu tập", app: app)
        tap(app.buttons["Quán chiếu việc thiện ác trong ngày"].firstMatch, app: app)
        let heading = app.staticTexts["Hướng Dẫn Quán Chiếu Thiện Ác & Sám Hối"].firstMatch
        if !heading.exists {
            tap(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Xem hướng dẫn quán chiếu")).firstMatch, app: app)
        }
        XCTAssertTrue(heading.waitForExistence(timeout: 15))
        let smaller = app.buttons["Giảm cỡ chữ"].firstMatch
        let larger = app.buttons["Tăng cỡ chữ"].firstMatch
        let viewportWidth = app.frame.width
        for _ in 0..<6 {
            reveal(smaller, app: app)
            if !smaller.isEnabled { break }
            let before = reflectionGuidePercent(app)
            smaller.tap()
            waitUntil("A− must lower the displayed guide percentage after one tap") { self.reflectionGuidePercent(app) < before }
        }
        XCTAssertEqual(reflectionGuidePercent(app), 85)
        XCTAssertFalse(smaller.isEnabled, "A− must stop at the saved 85% lower limit")
        let small = reflectionGuideParagraphFrame(app)
        evidence("reflection-guide-native-text-85-percent", app: app)
        for _ in 0..<6 {
            reveal(larger, app: app)
            if !larger.isEnabled { break }
            let before = reflectionGuidePercent(app)
            larger.tap()
            waitUntil("A+ must raise the displayed guide percentage after one tap") { self.reflectionGuidePercent(app) > before }
        }
        XCTAssertEqual(reflectionGuidePercent(app), 135)
        XCTAssertFalse(larger.isEnabled, "A+ must stop at the saved 135% upper limit")
        let large = reflectionGuideParagraphFrame(app)
        XCTAssertEqual(app.frame.width, viewportWidth, accuracy: 1, "Font comparisons must use the same viewport")
        XCTAssertGreaterThan(large.height, small.height + 1, "Guide text must actually grow; changing only the percentage is insufficient")
        evidence("reflection-guide-native-text-135-percent", app: app)
        tap(smaller, app: app)
        waitUntil("A− must reduce the large guide text to 125%") { self.reflectionGuidePercent(app) == 125 }
        let reduced = reflectionGuideParagraphFrame(app)
        XCTAssertLessThan(reduced.height, large.height, "A− must reduce rendered text geometry as well as its label")
        // Hide/show is a view-only action. Do not start writing or save a journal entry.
        tap(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Ẩn hướng dẫn")).firstMatch, app: app)
        waitUntil("Hiding the guide must remove its font controls") { !larger.exists }
        tap(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Xem hướng dẫn quán chiếu")).firstMatch, app: app)
        reveal(larger, app: app)
        XCTAssertEqual(reflectionGuidePercent(app), 125, "Reopened guide must retain its actual font preference")
        let reopened = reflectionGuideParagraphFrame(app)
        XCTAssertEqual(reopened.height, reduced.height, accuracy: 2, "Reopened text must retain the same rendered size")
        let geometry = XCTAttachment(string: "85%: \(small); 135%: \(large); 125%: \(reduced); reopened125%: \(reopened); viewportWidth: \(viewportWidth)")
        geometry.name = "reflection-guide-native-font-geometry"
        geometry.lifetime = .keepAlways
        add(geometry)
        evidence("reflection-guide-native-font-persisted-after-reopen", app: app)
    }

    @MainActor
    func testNativeScriptureCopyingReferenceAndGhost() {
        let app = launchGuest()
        evidence("copy-before-native-url-open", app: app)
        openNativeLink(URL(string: "vn.quangtu.tutam:///tu-tap/chep-kinh")!, app: app)
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 45), "Native WKWebView must load after opening scripture copying URL")
        deferStartupNotificationPrompt(app, timeout: 7)
        evidence("copy-after-native-url-open", app: app)
        let bookChoiceSwitch = app.switches.matching(NSPredicate(format: "label CONTAINS %@", "Kinh Địa Tạng Bồ Tát Bổn Nguyện")).firstMatch
        let bookChoiceButton = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Kinh Địa Tạng Bồ Tát Bổn Nguyện")).firstMatch
        waitUntil("The actual book selector must finish loading before selection", timeout: 45) {
            (bookChoiceSwitch.exists && bookChoiceSwitch.isEnabled) || (bookChoiceButton.exists && bookChoiceButton.isEnabled)
        }
        let bookChoice = bookChoiceSwitch.exists ? bookChoiceSwitch : bookChoiceButton
        tap(bookChoice, app: app)
        let begin = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Tôi đã đọc, tiếp tục chép")).firstMatch
        waitUntil("The selected book must expose its ready instruction action", timeout: 30) { begin.exists && begin.isEnabled }
        tap(begin, app: app)

        let ghost = app.switches["Chữ mờ"].firstMatch
        XCTAssertTrue(ghost.waitForExistence(timeout: 20))
        XCTAssertEqual(ghost.value as? String, "0")
        tap(ghost, app: app)
        XCTAssertEqual(ghost.value as? String, "1")

        let editor = app.textViews["Tự gõ bản chép của bạn"].firstMatch
        let reference = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Nội dung kinh mẫu")).firstMatch
        let header = app.buttons["Đổi kinh hoặc phẩm"].firstMatch
        tap(editor, app: app)
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(reference.exists)
        XCTAssertEqual(referenceContainsUniqueWord(reference, label: "GIỚI"), false, "The later word must start outside the reference viewport")
        evidence("copy-ghost-keyboard-before-typing", app: app)

        editor.typeText("TI")
        editor.typeText(XCUIKeyboardKey.delete.rawValue)
        editor.typeText("INH KHAU NGHIEP CHON NGON\n")
        editor.typeText("Tu ri tu ri, ma ha tu ri tu tu ri, ta ba ha. TINH TAM NGHIEP CHAN NGON An ta pha ba pha, truat da ta pha, dat ma ta pha, ba pha truat do ham. TINH PHAP GIOI")
        let typed = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        typed.name = "copy-ghost-keyboard-immediately-after-typing"
        typed.lifetime = .keepAlways
        add(typed)
        waitUntil("The reference must scroll the later word into view while typing", timeout: 20) {
            self.referenceContainsUniqueWord(reference, label: "GIỚI") == true
        }
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        XCTAssertEqual(ghost.value as? String, "1")
        XCTAssertTrue(insideViewport(header, app: app))
        let statusBar = app.statusBars.firstMatch
        if statusBar.exists && !statusBar.frame.isEmpty {
            XCTAssertGreaterThanOrEqual(header.frame.minY, statusBar.frame.maxY - 1)
        }
        let followed = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        followed.name = "copy-ghost-keyboard-reference-followed"
        followed.lifetime = .keepAlways
        add(followed)
        // Đóng bàn phím bằng accessory thật trước khi đọc AX value của contenteditable trên iOS.
        let done = app.toolbars.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Xong", "Hoàn tất"] as NSArray)).firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 5) && done.isHittable)
        done.tap()
        waitUntil("The native Done action must dismiss the keyboard") { !app.keyboards.firstMatch.exists }
        // AX của iOS có thể kẹt khi TextView còn chứa các span chữ mờ chưa gõ.
        // Đổi chế độ bằng UI thật; phần chữ đã gõ phải được giữ nguyên khi bỏ lớp chữ mờ.
        tap(ghost, app: app)
        XCTAssertEqual(ghost.value as? String, "0")
        let plainEditor = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        plainEditor.name = "copy-typed-text-after-disabling-ghost"
        plainEditor.lifetime = .keepAlways
        add(plainEditor)
        // Phân trang native chỉ đưa phần chữ trang hiện tại vào TextView.
        // Sau khi kiểm tra chế độ mặc định, dùng UI cuộn liên tục để kiểm tra cả đầu/cuối bản chép.
        tap(app.buttons["Tùy chọn"].firstMatch, app: app)
        let continuous = app.switches["Cuộn liên tục"].firstMatch
        XCTAssertTrue(continuous.waitForExistence(timeout: 10))
        XCTAssertEqual(continuous.value as? String, "0", "Native copying must initially keep its paged mode")
        tap(continuous, app: app)
        XCTAssertEqual(continuous.value as? String, "1")
        waitUntil("The editor must retain the corrected Vietnamese heading and follow the reference across lines", timeout: 20) {
            // TextView đã cache có thể trỏ vào AX của bàn phím vừa đóng.
            // Đọc snapshot app mới và giữ nguyên các điều kiện về nội dung thực trong editor.
            guard let snapshot = try? app.snapshot() else { return false }
            var pending = snapshot.children
            while let node = pending.popLast() {
                if node.elementType == .textView && node.label == "Tự gõ bản chép của bạn" {
                    guard let text = node.value as? String else { return false }
                    let words = text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
                    return words.contains("TỊNH KHẨU NGHIỆP CHƠN NGÔN")
                        && words.contains("GIỚI")
                        && !words.contains("(3 lần)")
                }
                pending.append(contentsOf: node.children)
            }
            return false
        }
        evidence("copy-ghost-text-retained-after-keyboard", app: app)
    }

    @MainActor
    private func referenceContainsUniqueWord(_ reference: XCUIElement, label: String) -> Bool? {
        guard let snapshot = try? reference.snapshot() else { return nil }
        var pending = snapshot.children
        var wordFrame: CGRect?
        while let node = pending.popLast() {
            if node.elementType == .staticText && node.label == label {
                guard wordFrame == nil else { return nil }
                wordFrame = node.frame
            }
            pending.append(contentsOf: node.children)
        }
        guard let wordFrame = wordFrame else { return nil }
        // Đo vùng tham chiếu và đúng một từ trong cùng snapshot AX.
        return snapshot.frame.contains(wordFrame)
    }

    @MainActor
    private func selectPracticePaper(_ label: String, app: XCUIApplication) {
        let toolbar = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "Tùy chỉnh chế độ tu tập")).firstMatch
        XCTAssertTrue(toolbar.waitForExistence(timeout: 15), "Practice must expose its actual customization toolbar")
        let display = toolbar.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Tùy chỉnh")).firstMatch
        if display.exists {
            // On phones the swatches live in the display sheet. The trigger may extend past the toolbar's right edge.
            let viewport = app.frame
            let target = display.frame.intersection(toolbar.frame).intersection(viewport)
            guard target.width >= 44 && target.height >= 44 && display.isHittable else {
                XCTFail("The practice display settings trigger must be reachable in the toolbar")
                return
            }
            app.coordinate(withNormalizedOffset: CGVector(dx: (target.midX - viewport.minX) / viewport.width,
                dy: (target.midY - viewport.minY) / viewport.height)).tap()
            let sheet = app.otherElements.matching(NSPredicate(
                format: "label BEGINSWITH %@ AND (label ENDSWITH %@ OR label ENDSWITH %@)",
                "Tùy chỉnh hiển thị & hành trì", "hộp thoại web", "web dialog"
            )).firstMatch
            XCTAssertTrue(sheet.waitForExistence(timeout: 10), "The practice display settings sheet must open")
            let toggle = sheet.switches[label].firstMatch
            let paper = toggle.exists ? toggle : sheet.buttons[label].firstMatch
            tap(paper, app: app)
            waitUntil("The named practice paper must be selected in the settings sheet") { self.checked(paper) == true }
            tap(sheet.buttons["Đóng bảng chọn"].firstMatch, app: app)
            waitUntil("Closing display settings must return to the active practice") { !sheet.exists && toolbar.exists }
            return
        }
        let initialPaper = labelledToggle(label, app: app)
        // WebKit may clamp offscreen-left AX frames to the toolbar's left edge.
        // Use that geometry only to prioritize a direction, then search both ways.
        let preferRight = initialPaper.exists && initialPaper.frame.minX <= toolbar.frame.minX
        for swipeRight in [preferRight, !preferRight] {
            for step in 0...8 {
                let paper = labelledToggle(label, app: app)
                let frame = paper.exists ? paper.frame : .zero
                if paper.exists && app.frame.contains(frame) && toolbar.frame.contains(frame) && paper.isHittable {
                    paper.tap()
                    XCTAssertEqual(checked(paper), true, "The named paper must become selected after one real tap")
                    return
                }
                if step < 8 {
                    let barFrame = toolbar.frame
                    let viewport = app.frame
                    // Stay in the verified bottom padding, clear of the native speed select.
                    let startPoint = CGPoint(x: barFrame.midX + (swipeRight ? -0.125 : 0.125) * barFrame.width, y: barFrame.maxY - 4)
                    let endPoint = CGPoint(x: barFrame.midX + (swipeRight ? 0.125 : -0.125) * barFrame.width, y: barFrame.maxY - 4)
                    guard barFrame.width > 0, barFrame.height > 8,
                          viewport.contains(barFrame),
                          barFrame.contains(startPoint), barFrame.contains(endPoint),
                          viewport.contains(startPoint), viewport.contains(endPoint) else {
                        evidence("invalid-practice-toolbar-geometry-" + label, app: app)
                        XCTFail("Practice toolbar must expose a safe contained drag path")
                        return
                    }
                    let start = toolbar.coordinate(withNormalizedOffset: CGVector(dx: (startPoint.x - barFrame.minX) / barFrame.width, dy: (startPoint.y - barFrame.minY) / barFrame.height))
                    let end = toolbar.coordinate(withNormalizedOffset: CGVector(dx: (endPoint.x - barFrame.minX) / barFrame.width, dy: (endPoint.y - barFrame.minY) / barFrame.height))
                    start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
                }
            }
        }
        evidence("unreachable-practice-paper-" + label, app: app)
        XCTFail("The actual horizontal toolbar must reveal the requested paper: \(label)")
    }

    @MainActor
    func testOfflineLibrarySearchChapterReadingAndLargeTextRotation() {
        let app = launchGuest()
        navigate("Kinh sách", app: app)
        let search = librarySearch(app)
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        let book = app.buttons["Đọc ngay Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải"].firstMatch
        tap(book, app: app)
        let chapter = app.buttons.matching(NSPredicate(format: "label CONTAINS[cd] %@", "Duyên Khởi Của Pháp Hội Giảng Kinh")).firstMatch
        tap(chapter, app: app)
        let body = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[cd] %@", "Tất cả mọi nơi đều là đạo tràng")).firstMatch
        XCTAssertTrue(body.waitForExistence(timeout: 30), "Bundled chapter body must render while production hosts are blocked")
        let larger = app.buttons["Chữ lớn hơn"].firstMatch
        reveal(larger, app: app)
        XCTAssertGreaterThanOrEqual(larger.frame.width, 44)
        XCTAssertGreaterThanOrEqual(larger.frame.height, 44)
        for _ in 0..<3 { larger.tap() }
        XCTAssertTrue(app.staticTexts["18px"].firstMatch.waitForExistence(timeout: 10), "Reader font control must reflect three real increments")
        var purplePaper = labelledToggle("Nền giấy Tím nhạt", app: app)
        if !purplePaper.exists || !insideViewport(purplePaper, viewport: app.frame) || !purplePaper.isHittable {
            tap(app.buttons["Công cụ"].firstMatch, app: app)
        }
        for _ in 0..<8 {
            purplePaper = labelledToggle("Nền giấy Tím nhạt", app: app)
            if purplePaper.exists && insideViewport(purplePaper, viewport: app.frame) && purplePaper.isHittable { break }
            let next = app.buttons["Cuộn thanh công cụ sang phải"].firstMatch
            guard next.exists && next.isEnabled else { break }
            tap(next, app: app)
        }
        purplePaper = labelledToggle("Nền giấy Tím nhạt", app: app)
        tap(purplePaper, app: app)
        XCTAssertEqual(checked(purplePaper), true, "The real reader must select its purple paper")
        evidence("offline-reader-purple-header-and-system-bars", app: app)
        for _ in 0..<8 {
            let automatic = labelledToggle("Nền giấy Tự động", app: app)
            if automatic.exists && insideViewport(automatic, viewport: app.frame) && automatic.isHittable { break }
            let previous = app.buttons["Cuộn thanh công cụ sang trái"].firstMatch
            guard previous.exists && previous.isEnabled else { break }
            tap(previous, app: app)
        }
        let automaticPaper = labelledToggle("Nền giấy Tự động", app: app)
        tap(automaticPaper, app: app)
        XCTAssertEqual(checked(automaticPaper), true, "Reader Auto must be selectable through the actual toolbar")
        evidence("offline-reader-auto-paper", app: app)
        let closeTools = app.buttons["Đóng công cụ"].firstMatch
        if closeTools.exists && closeTools.isHittable { closeTools.tap() }
        evidence("offline-reader-large-text-portrait", app: app)
        rotate(.landscapeLeft, app: app)
        let backToContents = app.buttons["Mục lục"].firstMatch
        reveal(backToContents, app: app)
        XCTAssertGreaterThanOrEqual(backToContents.frame.width, 44)
        XCTAssertGreaterThanOrEqual(backToContents.frame.height, 44)
        evidence("offline-reader-large-text-landscape", app: app)
        backToContents.tap()
        XCTAssertTrue(chapter.waitForExistence(timeout: 15), "Back from chapter must return to real table of contents")
        tap(app.buttons["Quay lại"].firstMatch, app: app)
        XCTAssertTrue(librarySearch(app).isHittable, "Closing table of contents must return to the searchable library")
        rotate(.portrait, app: app)
        openSettings(app)
        openAppearance(app)
        tap(labelledToggle("Tối", app: app), app: app)
        openNativeLink(URL(string: "vn.quangtu.tutam:///tu-tap?article=tt_1780910773084&chap=3")!, app: app)
        deferStartupNotificationPrompt(app, timeout: 7)
        let practice = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Vào chế độ tu tập")).firstMatch
        tap(practice, app: app)
        tap(app.buttons["Bắt đầu 🙏"].firstMatch, app: app)
        XCTAssertTrue(app.staticTexts["PHẨM 3: QUÁN CHÚNG SINH NGHIỆP DUYÊN"].firstMatch.waitForExistence(timeout: 20))
        selectPracticePaper("Tím nhạt", app: app)
        evidence("practice-purple-shared-theme-header-toolbar-footer", app: app)
        selectPracticePaper("Trắng", app: app)
        evidence("practice-white-shared-theme-header-toolbar-footer", app: app)
        selectPracticePaper("Tự động", app: app)
        evidence("practice-auto-shared-theme", app: app)
        let controls = app.otherElements.matching(NSPredicate(format: "label == %@", "Bảng điều khiển tu tập")).firstMatch
        let collapseControls = controls.buttons["Thu gọn công cụ tu tập"].firstMatch
        let increment = controls.buttons["+1"].firstMatch
        let decrement = controls.buttons["-1"].firstMatch
        let openControls = controls.buttons["Mở công cụ tu tập"].firstMatch
        func tapFloatingControl(_ button: XCUIElement, collapsed: Bool = false) {
            var previousFrame: CGRect?
            waitUntil("The chosen floating control must settle in its visible panel before tapping") {
                guard controls.exists && button.exists && button.isHittable else { return false }
                let frame = button.frame
                let panel = controls.frame
                guard frame.width >= 44 && frame.height >= 44 && app.frame.contains(frame)
                        && panel.insetBy(dx: -1, dy: -1).contains(frame) else { return false }
                if collapsed && controls.buttons.count != 1 { return false }
                let settled = previousFrame == frame
                previousFrame = frame
                return settled
            }
            let target = button.frame
            let viewport = app.frame
            app.coordinate(withNormalizedOffset: CGVector(dx: (target.midX - viewport.minX) / viewport.width,
                dy: (target.midY - viewport.minY) / viewport.height)).tap()
        }
        tapFloatingControl(collapseControls)
        waitUntil("Collapsed practice controls must disappear from accessibility") {
            !increment.exists && !decrement.exists && openControls.exists
        }
        XCTAssertTrue(insideViewport(openControls, app: app) && openControls.isHittable, "Collapsed practice controls must retain a reachable opener")
        // The accessibility group may extend above the actual 46 pt opener in WebKit.
        let aboveOpener = openControls.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0))
            .withOffset(CGVector(dx: 0, dy: -12))
        aboveOpener.tap()
        XCTAssertTrue(openControls.exists && !increment.exists, "A tap on the reading surface above the opener must leave the panel collapsed")
        evidence("practice-controls-collapsed-before-reopen", app: app)
        tapFloatingControl(openControls, collapsed: true)
        XCTAssertTrue(increment.waitForExistence(timeout: 15))
        XCTAssertTrue(controls.staticTexts["0"].firstMatch.exists, "Fresh practice counter must start at zero")
        tapFloatingControl(increment)
        waitUntil("One increment must increase the real practice counter to exactly one") { controls.staticTexts["1"].firstMatch.exists }
        tapFloatingControl(decrement)
        waitUntil("One decrement must restore the real practice counter to zero") { controls.staticTexts["0"].firstMatch.exists }
        tapFloatingControl(collapseControls)
        waitUntil("Reclosed practice controls must remain absent from accessibility") {
            !increment.exists && !decrement.exists && openControls.exists
        }
        XCTAssertTrue(insideViewport(openControls, app: app) && openControls.isHittable, "Reclosed practice controls must keep their opener reachable")
        evidence("practice-controls-collapsed-accessibility", app: app)
    }

    @MainActor
    func testNativeCatalogExcludesWebOnlyBookAndSearchCanBeCleared() {
        let app = launchGuest()
        navigate("Kinh sách", app: app)
        let search = librarySearch(app)
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        let book = app.buttons["Đọc ngay Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải"].firstMatch
        XCTAssertTrue(book.waitForExistence(timeout: 25))
        let clear = app.buttons["Xóa tìm kiếm"].firstMatch
        tap(clear, app: app)
        search.tap()
        search.typeText("Muôn Kiếp Nhân Sinh")
        XCTAssertTrue(app.staticTexts["Không tìm thấy bài viết phù hợp."].firstMatch.waitForExistence(timeout: 20))
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS[cd] %@", "Đọc ngay", "Muôn Kiếp Nhân Sinh")).count, 0)
        evidence("native-web-only-search-empty", app: app)
        tap(clear, app: app)
        search.tap()
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        XCTAssertTrue(book.waitForExistence(timeout: 20), "Normal offline catalog must recover after clearing the excluded title")
    }

    @MainActor
    func testLightDarkSettingsAndGuestDeepLinkNavigation() {
        let app = launchGuest()
        for (label, theme) in [("Tối", "dark"), ("Trắng", "light")] {
            openSettings(app, captureNavigationEvidence: false)
            openAppearance(app)
            let choice = labelledToggle(label, app: app)
            revealContentControl(choice, app: app)
            tap(choice, app: app)
            waitUntil("Selected theme must become active") { self.checked(self.labelledToggle(label, app: app)) == true }
            let summary = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Giao diện & ngôn ngữ " + label)).firstMatch
            XCTAssertTrue(summary.waitForExistence(timeout: 15), "Settings summary must render the selected theme before screenshot")
            evidence("settings-" + theme, app: app)
            navigate("Kinh sách", app: app, captureNavigationEvidence: false)
            let search = app.searchFields["Tìm kiếm bài viết"].firstMatch
            XCTAssertTrue(search.waitForExistence(timeout: 20), "Fresh library must expose its actual search field")
            let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Điều hướng nhanh", "Quick navigation")).firstMatch
            XCTAssertTrue(navigation.waitForExistence(timeout: 20), "Library search must be checked against the actual footer")
            let searchFrame = search.frame
            let footerFrame = navigation.frame
            guard searchFrame.width > 0 && searchFrame.height > 0 && app.frame.contains(searchFrame)
                && footerFrame.width > 0 && footerFrame.height > 0 && searchFrame.maxY <= footerFrame.minY
                && search.isHittable else {
                evidence("library-search-invalid-geometry-" + theme, app: app)
                XCTFail("Fresh library search must be fully visible and hittable above the actual footer")
                return
            }
            evidence("library-" + theme, app: app)
            navigate("Tu tập", app: app, captureNavigationEvidence: false)
            XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Lần tràng hạt")).firstMatch.waitForExistence(timeout: 20))
            evidence("practice-" + theme, app: app)
        }
        openSettings(app, captureNavigationEvidence: false)
        openAppearance(app)
        for label in ["Tự động", "Trắng", "Be nhạt", "Xám", "Tím nhạt", "Tối"] {
            XCTAssertTrue(labelledToggle(label, app: app).exists, "Settings must expose all six theme choices: \(label)")
        }
        let purple = labelledToggle("Tím nhạt", app: app)
        tap(purple, app: app)
        XCTAssertEqual(checked(purple), true)
        evidence("settings-purple-six-choice-grid", app: app)
        app.terminate()
        app.launch()
        deferStartupNotificationPrompt(app, timeout: 7)
        openSettings(app, captureNavigationEvidence: false)
        openAppearance(app)
        XCTAssertEqual(checked(labelledToggle("Tím nhạt", app: app)), true, "The selected app palette must survive a native relaunch")
        let automatic = labelledToggle("Tự động", app: app)
        tap(automatic, app: app)
        XCTAssertEqual(checked(automatic), true)
        tap(labelledToggle("Trắng", app: app), app: app)
    }

    @MainActor
    func testMeditationPauseResumeSurvivesNativeBackgrounding() {
        let app = launchGuest()
        navigate("Tu tập", app: app)
        tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Thiền định")).firstMatch, app: app)
        tap(app.buttons["Bắt đầu thiền"].firstMatch, app: app)
        tap(app.buttons["Tạm dừng"].firstMatch, app: app)
        let resume = app.buttons["Tiếp tục"].firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 10))
        evidence("meditation-paused", app: app)
        XCUIDevice.shared.press(.home)
        app.activate()
        deferStartupNotificationPrompt(app, timeout: 7)
        XCTAssertTrue(resume.waitForExistence(timeout: 15), "Explicit pause must remain after native background/foreground")
        tap(resume, app: app)
        XCTAssertTrue(app.buttons["Tạm dừng"].firstMatch.waitForExistence(timeout: 10))
        evidence("meditation-resumed", app: app)
    }
}

final class NativePersonalReminderTests: NativeGuestUITestCase {
    @MainActor
    private func waitPersonalUntil(_ message: String, timeout: TimeInterval = 15, _ condition: @escaping () -> Bool) {
        if condition() { return }
        waitUntil(message, timeout: timeout, condition)
    }

    @MainActor
    private func existsOrWait(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        element.exists || element.waitForExistence(timeout: timeout)
    }

    @MainActor
    private func allowPersonalNotificationPermission(_ app: XCUIApplication) {
        let sound = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Âm thanh & rung thông báo Âm thanh:")).firstMatch
        reveal(sound, app: app)
        tap(sound, app: app)
        let send = app.buttons["🔔 Gửi thử thông báo mẫu"].firstMatch
        tap(send, app: app)
        // Cả suite dùng cùng bản cài; ca gửi thử trước đó có thể đã xin quyền thành công.
        allowExpectedNotificationPermission(app, required: false)
        XCTAssertTrue(send.waitForExistence(timeout: 20), "Native test scheduling must finish before opening personal reminders")
    }

    @MainActor
    private func openPersonal(_ app: XCUIApplication, requestPermission: Bool = false) {
        if requestPermission { allowPersonalNotificationPermission(app) }
        let enabled = app.switches["Ngày Lễ Cá Nhân"].firstMatch
        let enabledExists = enabled.exists
        let enabledFrame = enabledExists ? enabled.frame : .zero
        if !enabledExists || enabledFrame.width == 0 || enabledFrame.height == 0 {
            let summary = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Ngày lễ cá nhân ")).firstMatch
            tap(summary, app: app)
        }
        reveal(enabled, app: app)
        XCTAssertEqual(checked(enabled), true, "Personal reminders must be enabled for these scenarios")
    }

    @MainActor
    private func relaunchPersonal(_ app: XCUIApplication, captureNavigationEvidence: Bool = true) {
        app.terminate()
        app.launch()
        waitForStartupCoverToClear(app)
        deferStartupNotificationPrompt(app, timeout: 7)
        XCTAssertTrue(existsOrWait(app.links["Cá nhân"].firstMatch, timeout: 30))
        openSettings(app, captureNavigationEvidence: captureNavigationEvidence)
        openPersonal(app)
    }

    @MainActor
    private func namedControl(_ caption: String, app: XCUIApplication) -> XCUIElement {
        dismissPersonalKeyboard(app)
        let matches = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", caption))
        // WebKit iOS có thể xuất HTML select thành Other có value, không nhất thiết PopUpButton.
        let findControl = { () -> XCUIElement? in
            var fallback: XCUIElement?
            for element in matches.allElementsBoundByIndex {
                // Một snapshot cho các thuộc tính cùng candidate; không giữ qua reveal/tap/wait.
                let type: XCUIElement.ElementType
                let frame: CGRect
                let value: String?
                let label: String
                if let snapshot = try? element.snapshot() {
                    type = snapshot.elementType
                    frame = snapshot.frame
                    value = snapshot.value as? String
                    label = snapshot.label
                } else {
                    // Nếu snapshot không có, giữ cả thứ tự short-circuit của đường đọc cũ.
                    type = element.elementType
                    guard type != .staticText else { continue }
                    frame = element.frame
                    guard frame.width > 0 && frame.height > 0 else { continue }
                    value = element.value as? String
                    guard value.map({ !$0.isEmpty }) ?? false else { continue }
                    label = element.label
                }
                // Caption Other không có value; select Other có value dù AX nội bộ chỉ cao 35pt.
                guard type != .staticText else { continue }
                guard frame.width > 0 && frame.height > 0 &&
                    (value.map { !$0.isEmpty } ?? false) else { continue }
                if fallback == nil { fallback = element }
                if label == caption { return element }
            }
            return fallback
        }
        var found = findControl()
        if found == nil {
            // Offscreen controls may be absent from AX until their caption is revealed.
            reveal(matches.firstMatch, app: app)
            found = findControl()
        }
        guard let control = found else {
            evidence("missing-labelled-control-" + caption, app: app)
            XCTFail("Expected a labelled interactive control for \(caption)")
            return matches.firstMatch
        }
        reveal(control, app: app)
        return control
    }

    @MainActor
    private func finishNativePicker(_ app: XCUIApplication) {
        let done = app.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Xong", "Hoàn tất"] as NSArray)).firstMatch
        XCTAssertTrue(existsOrWait(done, timeout: 10), "Native picker must expose its real Done action")
        done.tap()
    }

    @MainActor
    private func dismissPersonalKeyboard(_ app: XCUIApplication) {
        guard app.keyboards.firstMatch.exists else { return }
        // Nút Done của input accessory đóng bàn phím, không gửi form bằng phím Return.
        let done = app.toolbars.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Xong", "Hoàn tất"] as NSArray)).firstMatch
        XCTAssertTrue(existsOrWait(done, timeout: 5), "Focused personal-event field must expose keyboard Done")
        done.tap()
        waitPersonalUntil("Personal-event keyboard must dismiss before scrolling controls") { !app.keyboards.firstMatch.exists }
    }

    @MainActor
    private func selectPersonalSegment(_ label: String, app: XCUIApplication) {
        dismissPersonalKeyboard(app)
        // HTML button aria-pressed được WebKit iOS xuất thành Switch, không phải UIKit Button.
        let choice = labelledToggle(label, app: app)
        reveal(choice, app: app)
        let selected = checked(choice)
        XCTAssertNotNil(selected, "Personal segmented control must expose its actual pressed state")
        if selected != true { choice.tap() }
        waitPersonalUntil("Personal segmented control must retain selected state \(label)") { self.checked(app.switches[label].firstMatch) == true }
    }

    @MainActor
    private func selectWebDialogOption(_ dialog: XCUIElement, option: String, app: XCUIApplication) {
        let close = dialog.buttons["Đóng bảng chọn"].firstMatch
        XCTAssertTrue(existsOrWait(close, timeout: 5), "Actual web select dialog must expose its close control")
        let header = dialog.otherElements.matching(NSPredicate(format: "label IN %@", ["biểu ngữ", "banner"] as NSArray)).firstMatch
        XCTAssertTrue(existsOrWait(header, timeout: 5), "Web select must expose its complete fixed header")
        let choice = dialog.switches[option].firstMatch
        for _ in 0..<14 {
            let viewport = app.frame
            let bounds = dialog.frame.intersection(viewport)
            let headerFrame = header.frame
            guard headerFrame.width > 0 && headerFrame.height > 0 && bounds.contains(headerFrame) else {
                XCTFail("Actual web select header must remain fully visible")
                return
            }
            let contentTop = headerFrame.maxY
            if choice.exists {
                let frame = choice.frame
                if frame.width > 0 && frame.height > 0 && frame.minY >= contentTop
                    && bounds.contains(frame) && choice.isHittable {
                    choice.tap()
                    waitPersonalUntil("Selecting a web dialog option must close that dialog") { !dialog.exists }
                    return
                }
                // AX làm phẳng div overflow: chỉ kéo trong các hàng thực đang thấy và hittable,
                // không dùng toàn bộ backdrop làm khung cuộn. Bước nhỏ dần để không vượt hàng đích.
                let visibleRows = dialog.switches.allElementsBoundByIndex.compactMap { row -> CGRect? in
                    let rect = row.frame
                    return rect.width > 0 && rect.height > 0 && rect.minY >= contentTop &&
                        bounds.contains(rect) && row.isHittable ? rect : nil
                }
                let scrollArea = visibleRows.reduce(CGRect.null) { $0.union($1) }
                guard !scrollArea.isNull && scrollArea.height > 0 else {
                    evidence("missing-web-select-scroll-area", app: app)
                    XCTFail("Web select scrolling requires actual visible option rows below its fixed header")
                    return
                }
                if scrollArea.contains(frame) && choice.isHittable {
                    choice.tap()
                    waitPersonalUntil("Selecting a web dialog option must close that dialog") { !dialog.exists }
                    return
                }
                let movingUp: Bool
                if frame.maxY > scrollArea.maxY { movingUp = true }
                else if frame.minY < scrollArea.minY { movingUp = false }
                else {
                    XCTFail("Fully visible requested web select option must be hittable")
                    return
                }
                let delta = min(abs(frame.midY - scrollArea.midY), scrollArea.height / 2)
                guard delta > 0 else {
                    XCTFail("Centered requested web select option must be hittable")
                    return
                }
                let startY = scrollArea.midY + (movingUp ? delta / 2 : -delta / 2)
                let endY = scrollArea.midY + (movingUp ? -delta / 2 : delta / 2)
                let x = (scrollArea.midX - viewport.minX) / viewport.width
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: (startY - viewport.minY) / viewport.height))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: (endY - viewport.minY) / viewport.height))
                start.press(forDuration: 0.05, thenDragTo: end)
            } else {
                XCTFail("Requested option must exist inside the actual web select dialog")
                return
            }
        }
        evidence("unreachable-web-select-option-" + option, app: app)
        XCTFail("Requested web select option must become visible and hittable within bounded scrolling")
    }

    @MainActor
    private func select(_ caption: String, option: String, app: XCUIApplication) {
        if caption == "Chu kỳ:" {
            selectPersonalSegment(option, app: app)
            return
        }
        let control = namedControl(caption, app: app)
        if (control.value as? String) == option { return }
        control.tap()
        let webDialog = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@ AND (label CONTAINS %@ OR label CONTAINS %@)", caption, "hộp thoại web", "web dialog")).firstMatch
        if existsOrWait(webDialog, timeout: 2) {
            selectWebDialogOption(webDialog, option: option, app: app)
            waitPersonalUntil("Web select must retain the chosen option \(option)") { (control.value as? String) == option }
            return
        }
        let wheel = app.pickerWheels.firstMatch
        if existsOrWait(wheel, timeout: 2) {
            wheel.adjust(toPickerWheelValue: option)
            finishNativePicker(app)
        } else {
            // Chọn nút thật trong popover của UIKit; không chạm option Switch ẩn của WebKit.
            let choice = app.buttons.matching(identifier: option).firstMatch
            XCTAssertTrue(existsOrWait(choice, timeout: 10), "Native select popover must expose the requested option button")
            choice.tap()
        }
        waitPersonalUntil("Native select must retain the chosen option \(option)") { (control.value as? String) == option }
    }

    @MainActor
    private func replaceName(_ text: String, app: XCUIApplication, fieldLabel: String = "Tên ngày lễ *") {
        let field = app.textFields[fieldLabel].firstMatch
        // WebKit can report the input as hittable while it is behind the fixed header.
        if fieldLabel == "Tên ngày lễ *" { revealContentControl(field, app: app) }
        else { reveal(field, app: app) }
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(existsOrWait(app.keyboards.firstMatch, timeout: 10),
                      "Tapping the visible title field must open the native keyboard before typing")
        if let existing = field.value as? String, !existing.isEmpty, existing != (field.placeholderValue ?? "") {
            let bounds = field.frame
            let viewport = app.frame
            let keyboard = app.keyboards.firstMatch.frame
            guard bounds.width > 0 && bounds.height > 0 && viewport.contains(bounds)
                && bounds.maxY <= keyboard.minY && field.isHittable else {
                evidence("invalid-personal-title-selection-target", app: app)
                XCTFail("Title selection must target the visible field above the keyboard")
                return
            }
            // These short fixture titles fit the visible field. Tap the trailing
            // padding to place the caret at the end, then use real keyboard Delete.
            app.coordinate(withNormalizedOffset: CGVector(dx: (bounds.maxX - 16 - viewport.minX) / viewport.width,
                dy: (bounds.midY - viewport.minY) / viewport.height)).tap()
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count))
            let titleIsEmpty = { () -> Bool in
                guard let value = field.value as? String else { return false }
                if value.isEmpty { return true }
                guard let placeholder = field.placeholderValue, !placeholder.isEmpty else { return false }
                // WK AX may expose the placeholder as the value of an empty field.
                return value == placeholder
            }
            waitPersonalUntil("Real keyboard deletion must clear the complete existing title") { titleIsEmpty() }
            XCTAssertTrue(titleIsEmpty(), "Replacement cannot continue with any old title characters")
        }
        field.typeText(text)
        waitPersonalUntil("Personal-event title must settle to the exact full typed value") { (field.value as? String) == text }
        XCTAssertEqual(field.value as? String, text)
    }

    @MainActor
    private func saveEvent(_ title: String, app: XCUIApplication, expectsAddedDialog: Bool = true) {
        dismissPersonalKeyboard(app)
        let saveButton = app.buttons["Lưu ngày lễ"].firstMatch
        reveal(saveButton, app: app)
        let appFrame = app.frame
        var contentFrame = appFrame
        let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Điều hướng nhanh", "Quick navigation")).firstMatch
        if navigation.exists {
            let footer = navigation.frame
            if footer.minY > contentFrame.minY && footer.minY < contentFrame.maxY { contentFrame.size.height = footer.minY - contentFrame.minY }
        }
        let buttonFrame = saveButton.frame
        XCTAssertGreaterThanOrEqual(buttonFrame.width, 44, "Actual Save control must retain its minimum touch width")
        XCTAssertGreaterThanOrEqual(buttonFrame.height, 44, "Actual Save control must retain its minimum touch height")
        let keyboard = app.keyboards.firstMatch
        guard contentFrame.contains(buttonFrame), !keyboard.exists || !keyboard.frame.intersects(buttonFrame) else {
            evidence("personal-save-invalid-first-gesture-geometry", app: app)
            XCTFail("Actual Save control must be fully visible above the footer and clear of the keyboard")
            return
        }
        saveButton.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 0.08)
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            !app.textFields["Tên ngày lễ *"].firstMatch.exists
        }, object: NSObject())
        if XCTWaiter.wait(for: [closed], timeout: 15) != .completed {
            evidence("personal-save-first-tap-failed", app: app)
            // Lần chạm thứ hai chỉ lấy bằng chứng; không đổi thất bại lưu lần đầu thành PASS.
            let save = app.buttons["Lưu ngày lễ"].firstMatch
            if save.exists {
                var viewport = app.frame
                let navigation = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Điều hướng nhanh", "Quick navigation")).firstMatch
                if navigation.exists {
                    let footer = navigation.frame
                    if footer.minY > viewport.minY && footer.minY < viewport.maxY { viewport.size.height = footer.minY - viewport.minY }
                }
                let frame = save.frame
                if frame.width > 0 && frame.height > 0 && viewport.contains(frame) {
                    let appFrame = app.frame
                    app.coordinate(withNormalizedOffset: CGVector(dx: (frame.midX - appFrame.minX) / appFrame.width,
                        dy: (frame.midY - appFrame.minY) / appFrame.height)).tap()
                    let diagnosticClosed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                        !app.textFields["Tên ngày lễ *"].firstMatch.exists
                    }, object: NSObject())
                    let didClose = XCTWaiter.wait(for: [diagnosticClosed], timeout: 10) == .completed
                    evidence("personal-save-diagnostic-second-tap-\(didClose ? "closed" : "open")", app: app)
                } else {
                    evidence("personal-save-diagnostic-invalid-geometry", app: app)
                }
            }
            XCTFail("A valid save must close the draft after one tap; diagnostic second tap cannot satisfy this requirement")
            return
        }
        // Only adding shows this modal; editing updates the existing row and displays inline feedback.
        if expectsAddedDialog {
            let savedAlert = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Đã thêm ngày lễ cá nhân")).firstMatch
            XCTAssertTrue(savedAlert.waitForExistence(timeout: 15), "One Save tap must show the actual success dialog")
            XCTAssertTrue(savedAlert.staticTexts["Ngày lễ đã được lưu trên thiết bị."].firstMatch.exists)
            let acknowledge = savedAlert.buttons["Đóng"].firstMatch
            XCTAssertTrue(acknowledge.isHittable)
            acknowledge.tap()
            waitPersonalUntil("Acknowledging Save must restore the saved list") { !savedAlert.exists }
        }
        XCTAssertFalse(app.textFields["Tên ngày lễ *"].firstMatch.exists, "The saved draft must remain closed after acknowledgement")
        XCTAssertTrue(existsOrWait(app.staticTexts[title].firstMatch, timeout: 15))
    }

    @MainActor
    private func addEvent(_ title: String, solar: Bool, day: Int, month: Int, app: XCUIApplication) {
        evidence("personal-before-add-event-tap", app: app)
        tap(app.buttons["+ Thêm ngày lễ kỷ niệm"].firstMatch, app: app)
        evidence("personal-after-add-event-tap", app: app)
        replaceName(title, app: app)
        if solar { selectPersonalSegment("Dương lịch", app: app) }
        select("Chu kỳ:", option: "Hàng năm", app: app)
        select(solar ? "Ngày Dương:" : "Ngày Âm lịch:", option: String(day), app: app)
        select(solar ? "Tháng Dương:" : "Tháng Âm lịch:", option: "Tháng \(month)", app: app)
        saveEvent(title, app: app)
    }

    @MainActor
    private func editEvent(_ title: String, app: XCUIApplication) {
        let name = app.textFields["Tên ngày lễ *"].firstMatch
        if name.exists && (name.value as? String) == title { return }
        let summary = app.staticTexts[title].firstMatch
        reveal(summary, app: app)
        let titleFrame = summary.frame
        let viewport = app.frame
        let edits = app.buttons.matching(identifier: "Sửa").allElementsBoundByIndex
        let matchingEdits = edits.filter {
            let frame = $0.frame
            return frame.width > 0 && frame.height > 0 && viewport.contains(frame) &&
                frame.minY < titleFrame.maxY && frame.maxY > titleFrame.minY &&
                frame.midX > titleFrame.midX && $0.isHittable
        }
        guard matchingEdits.count == 1, let edit = matchingEdits.first else {
            XCTFail("Expected Edit action beside the named QA event \(title)")
            return
        }
        revealContentControl(edit, app: app)
        let revealedTitleFrame = summary.frame
        let revealedEditFrame = edit.frame
        guard summary.exists && edit.exists && revealedTitleFrame.width > 0 && revealedTitleFrame.height > 0
            && revealedEditFrame.minY < revealedTitleFrame.maxY && revealedEditFrame.maxY > revealedTitleFrame.minY
            && revealedEditFrame.midX > revealedTitleFrame.midX && edit.isHittable else {
            evidence("lost-personal-edit-row-association", app: app)
            XCTFail("Revealed Edit must remain beside the named QA event \(title)")
            return
        }
        // Tap the measured row after scrolling. A WebKit accessibility tap can scroll
        // again while resolving a repeated button label.
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: revealedEditFrame.midX - viewport.minX,
                                   dy: revealedEditFrame.midY - viewport.minY)).tap()
        guard existsOrWait(name, timeout: 15) else {
            evidence("personal-edit-did-not-open", app: app)
            XCTFail("One tap must open the editor for \(title)")
            return
        }
        XCTAssertEqual(name.value as? String, title)
    }

    @MainActor
    private func collapseEditor(_ app: XCUIApplication) {
        tap(app.buttons["Thu gọn"].firstMatch, app: app)
        waitPersonalUntil("Unchanged editor must collapse") { !app.textFields["Tên ngày lễ *"].firstMatch.exists }
    }

    @MainActor
    private func deleteEvent(_ title: String, cancelFirst: Bool = false, app: XCUIApplication) {
        editEvent(title, app: app)
        let delete = app.buttons["Xóa ngày lễ"].firstMatch
        let dialog = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Xóa lịch cá nhân?,")).firstMatch
        let namedEvent = dialog.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "“\(title)”")).firstMatch
        for action in (cancelFirst ? ["Giữ lại", "Xóa lịch"] : ["Xóa lịch"]) {
            revealContentControl(delete, app: app)
            delete.tap()
            XCTAssertTrue(namedEvent.waitForExistence(timeout: 10), "The confirmation must name the event being changed")
            let button = dialog.buttons[action].firstMatch
            XCTAssertTrue(button.isHittable)
            button.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let closed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in !dialog.exists }, object: NSObject())
            if XCTWaiter.wait(for: [closed], timeout: 3) == .timedOut && namedEvent.exists && button.isHittable {
                button.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            }
            waitPersonalUntil("The named delete confirmation must close after choosing \(action)") { !dialog.exists }
            if action == "Giữ lại" {
                XCTAssertTrue(app.staticTexts[title].firstMatch.exists, "Cancel deletion must retain the named saved event")
            }
        }
        waitPersonalUntil("Confirmed deletion must remove only the named QA event") { !app.staticTexts[title].firstMatch.exists }
    }

    @MainActor
    private func homePersonalDialog(_ app: XCUIApplication) -> XCUIElement {
        app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Quản lý Ngày Lễ Cá Nhân")).firstMatch
    }

    @MainActor
    private func openHomePersonal(_ app: XCUIApplication) {
        tap(app.buttons["Thêm ngày lễ cá nhân"].firstMatch, app: app)
        XCTAssertTrue(homePersonalDialog(app).waitForExistence(timeout: 15), "Home's actual Add button must open its own anniversary dialog")
        XCTAssertTrue(app.textFields["Tên ngày lễ / Sự kiện *"].firstMatch.exists)
        XCTAssertEqual(app.textFields.matching(identifier: "Tên ngày lễ / Sự kiện *").count, 1, "Repeated Home opens must not stack duplicate editors")
    }

    @MainActor
    private func revealReopenedHomeSavedEvent(_ title: String, app: XCUIApplication) {
        let dialog = homePersonalDialog(app)
        let saved = dialog.staticTexts[title].firstMatch
        let screen = app.frame
        let viewport = screen.intersection(dialog.frame)
        let top = max(viewport.minY, dialog.buttons["Đóng cửa sổ"].firstMatch.frame.maxY)
        let bottom = min(viewport.maxY, dialog.buttons["Lưu ngày lễ"].firstMatch.frame.minY)
        guard bottom > top else {
            evidence("home-reopened-saved-list-no-scroll-area", app: app)
            XCTFail("Home's reopened manager must expose a body between its header and save footer")
            return
        }
        let x = (viewport.midX - screen.minX) / screen.width
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: (top + (bottom - top) * 0.8 - screen.minY) / screen.height))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: (top + (bottom - top) * 0.2 - screen.minY) / screen.height))
        // Reopening starts above the saved list. Run 56 placed persisted rows below
        // the form in its AX tree while the generic frame-based reveal swiped toward the form.
        for _ in 0..<14 {
            if insideViewport(saved, viewport: viewport) { return }
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        evidence("home-reopened-saved-list-unreachable", app: app)
        XCTAssertTrue(saved.exists, "The exact saved Home anniversary must survive reopening")
        XCTAssertTrue(insideViewport(saved, viewport: viewport), "The persisted Home anniversary must be visible and reachable inside the native viewport")
    }

    @MainActor
    private func saveHomePersonal(_ title: String, app: XCUIApplication) {
        dismissPersonalKeyboard(app)
        let save = homePersonalDialog(app).buttons["Lưu ngày lễ"].firstMatch
        reveal(save, app: app)
        XCTAssertTrue(app.frame.contains(save.frame) && save.isHittable, "Home Save must be reachable above the safe-area edge")
        XCTAssertGreaterThanOrEqual(save.frame.width, 44)
        XCTAssertGreaterThanOrEqual(save.frame.height, 44)
        save.tap()
        // Saving from Home is an explicit reminder action and can prompt on a fresh install.
        allowExpectedNotificationPermission(app, required: false)
        let alert = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Đã thêm ngày lễ cá nhân")).firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 15), "One Save tap must show Home's actual saved alert")
        alert.buttons["Đóng"].firstMatch.tap()
        waitPersonalUntil("Saved alert must close while Home's manager stays open") { !alert.exists && self.homePersonalDialog(app).exists }
        let saved = homePersonalDialog(app).staticTexts[title].firstMatch
        reveal(saved, app: app)
        XCTAssertTrue(saved.exists, "The exact saved QA anniversary must appear in Home's manager")
        XCTAssertEqual(homePersonalDialog(app).staticTexts.matching(identifier: title).count, 1, "A single Save must create exactly one row")
        let field = app.textFields["Tên ngày lễ / Sự kiện *"].firstMatch
        reveal(field, app: app)
        XCTAssertTrue(field.exists)
        let value = field.value as? String ?? ""
        XCTAssertTrue(value.isEmpty || value == (field.placeholderValue ?? ""), "Home Save must reset its draft without closing the manager")
    }

    @MainActor
    private func deleteHomePersonal(_ title: String, cancelFirst: Bool, app: XCUIApplication) {
        for action in (cancelFirst ? ["Giữ lại", "Xóa lịch"] : ["Xóa lịch"]) {
            tap(homePersonalDialog(app).buttons["Xóa " + title].firstMatch, app: app)
            let confirm = app.otherElements.matching(NSPredicate(format: "label BEGINSWITH %@", "Xóa lịch cá nhân?")).firstMatch
            XCTAssertTrue(confirm.waitForExistence(timeout: 10))
            XCTAssertTrue(confirm.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "“\(title)”")).firstMatch.exists,
                          "Delete confirmation must identify only this test's event")
            let choice = confirm.buttons[action].firstMatch
            XCTAssertTrue(choice.isHittable)
            choice.tap()
            waitPersonalUntil("Home delete choice must close after one tap") { !confirm.exists }
            if action == "Giữ lại" {
                XCTAssertTrue(homePersonalDialog(app).staticTexts[title].firstMatch.exists)
            }
        }
        waitPersonalUntil("Home deletion must remove the named QA event") { !self.homePersonalDialog(app).staticTexts[title].firstMatch.exists }
    }

    @MainActor
    func testHomePersonalAnniversariesLunarSolarCancelSaveDeleteAndPersistence() {
        let app = launchGuest()
        navigate("Trang chủ", app: app, captureNavigationEvidence: false)
        let suffix = String(UUID().uuidString.prefix(8))
        let lunar = "QA trang chủ âm " + suffix
        let solar = "QA trang chủ dương " + suffix
        let cancelled = "QA chưa lưu " + suffix
        openHomePersonal(app)
        replaceName(cancelled, app: app, fieldLabel: "Tên ngày lễ / Sự kiện *")
        let field = app.textFields["Tên ngày lễ / Sự kiện *"].firstMatch
        XCTAssertTrue(app.frame.contains(field.frame))
        XCTAssertLessThanOrEqual(field.frame.maxY, app.keyboards.firstMatch.frame.minY, "Home's focused title must remain above the native keyboard")
        dismissPersonalKeyboard(app)
        select("Ngày Âm", option: "Ngày 15", app: app)
        select("Tháng Âm", option: "Tháng 7", app: app)
        tap(homePersonalDialog(app).buttons["Đóng cửa sổ"].firstMatch, app: app)
        waitPersonalUntil("Closing the Home draft must dismiss the manager") { !self.homePersonalDialog(app).exists }
        XCTAssertFalse(app.staticTexts[cancelled].firstMatch.exists, "Closing an unsaved draft must not persist an event")
        openHomePersonal(app)
        replaceName(lunar, app: app, fieldLabel: "Tên ngày lễ / Sự kiện *")
        dismissPersonalKeyboard(app)
        XCTAssertEqual(namedControl("Ngày Âm", app: app).value as? String, "Ngày 15", "Reopening must retain the unsaved lunar draft")
        XCTAssertEqual(namedControl("Tháng Âm", app: app).value as? String, "Tháng 7")
        saveHomePersonal(lunar, app: app)
        replaceName(solar, app: app, fieldLabel: "Tên ngày lễ / Sự kiện *")
        selectPersonalSegment("Dương lịch", app: app)
        select("Ngày Dương", option: "Ngày 07", app: app)
        select("Tháng Dương", option: "Tháng 11", app: app)
        saveHomePersonal(solar, app: app)
        tap(homePersonalDialog(app).buttons["Đóng cửa sổ"].firstMatch, app: app)
        waitPersonalUntil("Home must remain usable after closing its manager") { !self.homePersonalDialog(app).exists }
        reveal(app.staticTexts[lunar].firstMatch, app: app)
        XCTAssertTrue(app.staticTexts[lunar].firstMatch.exists)
        XCTAssertTrue(app.staticTexts[solar].firstMatch.exists)
        evidence("home-personal-lunar-solar-saved", app: app)
        app.terminate()
        app.launch()
        waitForStartupCoverToClear(app)
        deferStartupNotificationPrompt(app, timeout: 7)
        navigate("Trang chủ", app: app, captureNavigationEvidence: false)
        openHomePersonal(app)
        revealReopenedHomeSavedEvent(lunar, app: app)
        XCTAssertTrue(homePersonalDialog(app).staticTexts[lunar].firstMatch.exists, "Home lunar anniversary must survive a relaunch")
        revealReopenedHomeSavedEvent(solar, app: app)
        XCTAssertTrue(homePersonalDialog(app).staticTexts[solar].firstMatch.exists, "Home solar anniversary must survive a relaunch")
        deleteHomePersonal(solar, cancelFirst: true, app: app)
        deleteHomePersonal(lunar, cancelFirst: false, app: app)
        tap(homePersonalDialog(app).buttons["Đóng cửa sổ"].firstMatch, app: app)
        waitPersonalUntil("Cleanup must leave Home without a modal") { !self.homePersonalDialog(app).exists }
        app.terminate()
        app.launch()
        waitForStartupCoverToClear(app)
        deferStartupNotificationPrompt(app, timeout: 7)
        navigate("Trang chủ", app: app, captureNavigationEvidence: false)
        openHomePersonal(app)
        XCTAssertFalse(homePersonalDialog(app).staticTexts[lunar].firstMatch.exists)
        XCTAssertFalse(homePersonalDialog(app).staticTexts[solar].firstMatch.exists)
        XCTAssertFalse(homePersonalDialog(app).staticTexts[cancelled].firstMatch.exists)
        tap(homePersonalDialog(app).buttons["Đóng cửa sổ"].firstMatch, app: app)
        evidence("home-personal-crud-cleanup-persisted", app: app)
    }

    @MainActor
    func testPersonalLunarPickerWithMotionDisabled() {
        let app = launchGuest()
        openSettings(app, captureNavigationEvidence: false)
        openAppearance(app)
        guard let originalMotion = checked(app.switches["Hiệu ứng chuyển động"].firstMatch) else {
            XCTFail("Actual motion switch must expose its initial state")
            return
        }
        setMotion(false, app: app)
        openPersonal(app)
        let lunar = "QA bảng chọn ngày âm"
        addEvent(lunar, solar: false, day: 15, month: 7, app: app)
        editEvent(lunar, app: app)
        XCTAssertEqual(namedControl("Ngày Âm lịch:", app: app).value as? String, "15")
        XCTAssertEqual(namedControl("Tháng Âm lịch:", app: app).value as? String, "Tháng 7")
        evidence("personal-lunar-picker-motion-disabled", app: app)
        collapseEditor(app)
        deleteEvent(lunar, app: app)
        openAppearance(app)
        setMotion(originalMotion, app: app)
    }

    @MainActor
    func testPersonalLunarSolarCrudInvalidDateCancelAndPersistence() {
        let app = launchGuest()
        openSettings(app, captureNavigationEvidence: false)
        openPersonal(app, requestPermission: true)
        let lunar = "QA ngày âm cá nhân"
        let solar = "QA ngày dương cá nhân"
        let edited = "QA ngày dương đã sửa"
        addEvent(lunar, solar: false, day: 15, month: 7, app: app)
        addEvent(solar, solar: true, day: 7, month: 11, app: app)
        editEvent(solar, app: app)
        replaceName(edited, app: app)
        saveEvent(edited, app: app, expectsAddedDialog: false)
        XCTAssertFalse(app.staticTexts[solar].firstMatch.exists, "Editing must replace the original row, not add a duplicate")
        relaunchPersonal(app, captureNavigationEvidence: false)
        editEvent(lunar, app: app)
        XCTAssertEqual(namedControl("Ngày Âm lịch:", app: app).value as? String, "15")
        XCTAssertEqual(namedControl("Tháng Âm lịch:", app: app).value as? String, "Tháng 7")
        collapseEditor(app)
        editEvent(edited, app: app)
        XCTAssertEqual(namedControl("Ngày Dương:", app: app).value as? String, "7")
        XCTAssertEqual(namedControl("Tháng Dương:", app: app).value as? String, "Tháng 11")
        select("Ngày Dương:", option: "31", app: app)
        select("Tháng Dương:", option: "Tháng 2", app: app)
        tap(app.buttons["Lưu ngày lễ"].firstMatch, app: app)
        let invalid = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Ngày dương lịch không hợp lệ.")).firstMatch
        XCTAssertTrue(existsOrWait(invalid, timeout: 15), "31 February must be rejected through the actual UI")
        tap(app.buttons["Đóng"].firstMatch, app: app)
        XCTAssertEqual(app.textFields["Tên ngày lễ *"].firstMatch.value as? String, edited, "Invalid draft must retain its text")
        evidence("personal-invalid-date-retained", app: app)
        // Rời bản nháp chưa hợp lệ không được ghi đè ngày đã lưu trước đó.
        relaunchPersonal(app, captureNavigationEvidence: false)
        editEvent(edited, app: app)
        XCTAssertEqual(namedControl("Ngày Dương:", app: app).value as? String, "7")
        XCTAssertEqual(namedControl("Tháng Dương:", app: app).value as? String, "Tháng 11")
        collapseEditor(app)
        let before = namedControl("Nhắc trước ngày lễ", app: app)
        XCTAssertEqual(checked(before), true)
        before.tap()
        waitPersonalUntil("The timing draft must reflect the disabled before-reminder checkbox") { self.checked(before) == false }
        tap(app.buttons["Hủy"].firstMatch, app: app)
        waitPersonalUntil("Cancel timing changes must restore the saved setting") { self.checked(before) == true }
        deleteEvent(edited, cancelFirst: true, app: app)
        relaunchPersonal(app, captureNavigationEvidence: false)
        editEvent(lunar, app: app)
        XCTAssertEqual(namedControl("Ngày Âm lịch:", app: app).value as? String, "15")
        XCTAssertEqual(namedControl("Tháng Âm lịch:", app: app).value as? String, "Tháng 7")
        XCTAssertFalse(app.staticTexts[edited].firstMatch.exists, "The solar event must stay deleted after relaunch")
        deleteEvent(lunar, app: app)
        relaunchPersonal(app, captureNavigationEvidence: false)
        XCTAssertFalse(app.staticTexts[edited].firstMatch.exists)
        XCTAssertFalse(app.staticTexts[lunar].firstMatch.exists)
        evidence("personal-crud-persisted-deletion", app: app)
    }

    @MainActor
    private func setReminderTime(_ fire: Date, app: XCUIApplication) {
        let field = namedControl("Nhắc trong ngày lễ — Giờ nhắc:", app: app)
        field.tap()
        let wheels = app.pickerWheels
        XCTAssertTrue(existsOrWait(wheels.firstMatch, timeout: 10), "Actual native time picker must open")
        XCTAssertTrue(wheels.count == 2 || wheels.count == 3, "Time picker must expose hour/minute and optional AM/PM wheels")
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: fire)
        let minute = calendar.component(.minute, from: fire)
        let hourWheel = wheels.element(boundBy: 0)
        let minuteWheel = wheels.element(boundBy: 1)
        let selectedHour = wheels.count == 3 ? (hour % 12 == 0 ? 12 : hour % 12) : hour
        let currentHour = (hourWheel.value as? String) ?? ""
        hourWheel.adjust(toPickerWheelValue: currentHour.hasPrefix("0") ? String(format: "%02d", selectedHour) : String(selectedHour))
        minuteWheel.adjust(toPickerWheelValue: String(format: "%02d", minute))
        if wheels.count == 3 {
            let period = wheels.element(boundBy: 2)
            let current = ((period.value as? String) ?? "").uppercased()
            let vietnamese = current.contains("SA") || current.contains("CH")
            period.adjust(toPickerWheelValue: hour < 12 ? (vietnamese ? "SA" : "AM") : (vietnamese ? "CH" : "PM"))
        }
        finishNativePicker(app)
        let expected = String(format: "%02d:%02d", hour, minute)
        let value = (field.value as? String) ?? ""
        let normalized = value.replacingOccurrences(of: "\u{202f}", with: " ").replacingOccurrences(of: "\u{00a0}", with: " ")
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.dateFormat = "h:mm a"
        let parsed = format.date(from: normalized)
        XCTAssertTrue(normalized == expected || (parsed.map { calendar.component(.hour, from: $0) == hour && calendar.component(.minute, from: $0) == minute } ?? false), "Native time field must show the requested local hour and minute")
        tap(app.buttons["Lưu cài đặt"].firstMatch, app: app)
        XCTAssertTrue(existsOrWait(app.buttons["Lưu cài đặt"].firstMatch, timeout: 30), "Personal reminder scheduling must finish")
        XCTAssertTrue(existsOrWait(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Nhắc trong ngày lúc " + expected)).firstMatch, timeout: 10))
    }

    @MainActor
    func testPersonalNearFutureReminderDeliversToSystemAndCanBeDeleted() {
        let app = launchGuest()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        openSettings(app)
        openPersonal(app, requestPermission: true)
        let name = "QA thông báo ngày lễ riêng"
        // Dư bốn phút để thao tác picker thật trên CI; scheduler dùng cùng giờ địa phương của thiết bị.
        let calendar = Calendar.current
        let candidate = Date().addingTimeInterval(240)
        guard let fire = calendar.date(bySetting: .second, value: 0, of: candidate) else {
            XCTFail("Unable to construct the device-local reminder time")
            return
        }
        addEvent(name, solar: true, day: calendar.component(.day, from: fire), month: calendar.component(.month, from: fire), app: app)
        setReminderTime(fire, app: app)
        XCTAssertGreaterThan(fire.timeIntervalSinceNow, 15, "Real UI setup must finish before the scheduled local time")
        evidence("personal-reminder-scheduled", app: app)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(springboard.wait(for: .runningForeground, timeout: 10))
        let top = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.01))
        let bottom = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.80))
        top.press(forDuration: 0.1, thenDragTo: bottom)
        let title = "🗓️ Hôm nay: Ngày lễ cá nhân"
        let deliveredTitle = springboard.staticTexts[title].firstMatch
        let deliveredBody = springboard.staticTexts[name].firstMatch
        let grouped = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", title, name)).firstMatch
        waitPersonalUntil("iOS must actually deliver the personal anniversary notification with its exact QA event name", timeout: max(30, fire.timeIntervalSinceNow + 45)) {
            (deliveredTitle.exists && deliveredBody.exists) || grouped.exists
        }
        evidence("personal-reminder-system-received", app: springboard)
        app.activate()
        deferStartupNotificationPrompt(app, timeout: 7)
        openSettings(app)
        openPersonal(app)
        deleteEvent(name, app: app)
        relaunchPersonal(app)
        XCTAssertFalse(app.staticTexts[name].firstMatch.exists, "Cleanup must remove only the synthetic QA anniversary")
        evidence("personal-reminder-cleanup", app: app)
    }
}

final class NativeSimulatorSnapshotTests: NativeGuestUITestCase {
    @MainActor
    func testRosaryManualAndAutomaticAudioProgress() {
        let app = launchGuest()
        navigate("Tu tập", app: app)
        openRosaryFromCatalog(app)

        let baseline = rosaryCount(app)
        tap(app.buttons["Niệm một hạt"].firstMatch, app: app)
        waitUntil("One manual tap must add exactly one bead") {
            app.staticTexts[String(baseline + 1)].firstMatch.exists
        }
        XCTAssertEqual(rosaryCount(app), baseline + 1)

        let expanded = app.buttons["Thu gọn"].firstMatch
        if !expanded.exists {
            tap(app.buttons["Tùy chọn"].firstMatch, app: app)
        }
        XCTAssertTrue(expanded.waitForExistence(timeout: 10), "Rosary settings must be expanded")
        tap(labelledToggle("Tự động gõ mõ", app: app), app: app)
        tap(app.buttons["Bắt đầu gõ mõ"].firstMatch, app: app)

        let pause = app.buttons["Tạm dừng"].firstMatch
        XCTAssertTrue(pause.waitForExistence(timeout: 30), "The native audio transport must start")
        waitUntil("Native playback must advance the bead counter", timeout: 20) {
            self.rosaryCount(app) >= baseline + 4
        }
        evidence("rosary-auto-playing", app: app)
        tap(pause, app: app)

        let resume = app.buttons["Tiếp tục"].firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 12))
        let pausedCount = rosaryCount(app)
        let pauseDeadline = ProcessInfo.processInfo.systemUptime + 4
        // Hoàn tất từng lần đọc AX; không để deadline của waiter ngắt truy vấn đang chạy.
        while ProcessInfo.processInfo.systemUptime < pauseDeadline {
            XCTAssertEqual(rosaryCount(app), pausedCount, "Paused playback must not advance the bead counter")
            let remaining = pauseDeadline - ProcessInfo.processInfo.systemUptime
            if remaining > 0 {
                RunLoop.current.run(until: Date().addingTimeInterval(min(0.25, remaining)))
            }
        }
        XCTAssertEqual(rosaryCount(app), pausedCount, "The bead counter must remain paused after at least four seconds")

        tap(resume, app: app)
        waitUntil("Playback must advance again after resume", timeout: 20) {
            self.rosaryCount(app) >= pausedCount + 2
        }
        tap(app.buttons["Dừng nhịp"].firstMatch, app: app)
        XCTAssertTrue(app.buttons["Bắt đầu gõ mõ"].firstMatch.waitForExistence(timeout: 10))
    }

    @MainActor
    func testVegetarianMenuTabsAndRecipeRemainReachable() {
        let app = launchGuest()
        navigate("Tu tập", app: app)
        let title = "Lịch ăn chay đủ dinh dưỡng"
        let label = NSPredicate(format: "label BEGINSWITH[c] %@", title)
        let card = app.links.matching(label).firstMatch
        revealContentControl(card, app: app)
        card.tap()
        XCTAssertTrue(app.staticTexts[title].firstMatch.waitForExistence(timeout: 20), "The menu page must open")

        tap(labelledToggle("Lịch tuần & Đi chợ", app: app), app: app)
        let menu = labelledToggle("Menu món", app: app)
        tap(menu, app: app)
        XCTAssertTrue(insideViewport(menu, app: app))
        XCTAssertTrue(app.searchFields["Tìm tên món hoặc nguyên liệu"].firstMatch.waitForExistence(timeout: 15))
        evidence("vegetarian-menu-tabs", app: app)

        tap(labelledToggle("Hôm nay", app: app), app: app)
        let recipe = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Xem")).firstMatch
        tap(recipe, app: app)
        XCTAssertTrue(app.staticTexts["Nguyên liệu"].firstMatch.waitForExistence(timeout: 15))
        evidence("vegetarian-offline-recipe", app: app)
    }
}

final class NativeTalkPlayerTests: NativeGuestUITestCase {
    @MainActor
    func testSameAlbumPlaybackRestoresDismissedMiniPlayer() {
        let app = launchGuest(retryBlankWebView: true)
        navigate("Pháp thoại", app: app)
        let album = "GẬY KIM CANG HÉT - TẬP 1"
        let search = app.searchFields["Tìm kiếm album..."].firstMatch
        tap(search, app: app)
        search.typeText(album + "\n")
        let playAlbum = app.buttons["Phát album " + album].firstMatch
        XCTAssertTrue(playAlbum.waitForExistence(timeout: 15))
        evidence("talk-mini-player-catalog", app: app)
        let expand = app.buttons["Mở rộng trình phát Pháp Thoại"].firstMatch
        let pause = app.buttons["Tạm dừng"].firstMatch

        func checkPlaying() {
            waitUntil("An explicit play command must show the floating player and its pause control", timeout: 25) {
                self.insideViewport(expand, app: app) && self.insideViewport(pause, app: app)
            }
        }

        func swipePlayerAway() {
            let start = expand.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.50))
            let end = start.withOffset(CGVector(dx: app.frame.width * 0.52, dy: 0))
            start.press(forDuration: 0.08, thenDragTo: end)
            waitUntil("Swiping the mini-player away must hide its controls") { !expand.exists }
        }

        tap(playAlbum, app: app)
        checkPlaying()
        let position = app.sliders["Vị trí phát"].firstMatch
        waitUntil("The offline native transport must actually advance", timeout: 30) {
            guard let value = position.value as? String else { return false }
            let numeric = value.replacingOccurrences(of: "%", with: "").replacingOccurrences(of: ",", with: ".")
            return (Double(numeric.trimmingCharacters(in: .whitespaces)) ?? 0) > 0
        }
        evidence("talk-mini-player-first-play", app: app)
        swipePlayerAway()
        tap(playAlbum, app: app)
        checkPlaying()
        evidence("talk-mini-player-same-album", app: app)
        swipePlayerAway()

        tap(app.buttons["Mở album " + album].firstMatch, app: app)
        let playAll = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Phát tất cả")).firstMatch
        XCTAssertTrue(playAll.waitForExistence(timeout: 15))
        evidence("talk-mini-player-album-detail", app: app)
        tap(playAll, app: app)
        checkPlaying()
        pause.tap()
        let resume = app.buttons["Phát"].firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 15) && resume.isHittable)
        evidence("talk-mini-player-restored-and-paused", app: app)
    }
}
