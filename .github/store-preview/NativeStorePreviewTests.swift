
// Chỉ chạy trong nhánh quay video; không thuộc app hoặc bộ gate hồi quy.
final class NativeStorePreviewTests: NativeGuestUITestCase {
    @MainActor
    private func frame(_ id: String, app: XCUIApplication, motion: (() -> Void)? = nil) {
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertTrue(app.webViews.firstMatch.exists)
        evidence("store-preview-" + id, app: app)
        let marker = "TUTAM_STORE_SCENE|\(id)|\(Date().timeIntervalSince1970)\n"
        FileHandle.standardOutput.write(Data(marker.utf8))
        Thread.sleep(forTimeInterval: 1.0)
        motion?()
        Thread.sleep(forTimeInterval: 7.5)
    }

    @MainActor
    private func route(_ path: String, app: XCUIApplication) {
        openNativeLink(URL(string: "vn.quangtu.tutam://" + path)!, app: app)
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        deferStartupNotificationPrompt(app, timeout: 2)
        dismissPracticeSyncNotice(app)
    }

    @MainActor
    func testCaptureCoreFeatures() {
        let app = launchGuest(retryBlankWebView: true)
        frame("01-home-calendar", app: app)
        navigate("Kinh sách", app: app, captureNavigationEvidence: false)
        frame("02-library", app: app)
        let search = librarySearch(app)
        tap(search, app: app)
        search.typeText("Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải")
        tap(app.buttons["Đọc ngay Kinh Địa Tạng Bồ Tát Bổn Nguyện Giảng Giải"].firstMatch, app: app)
        tap(app.buttons.matching(NSPredicate(format: "label CONTAINS[cd] %@", "Duyên Khởi Của Pháp Hội Giảng Kinh")).firstMatch, app: app)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[cd] %@", "Tất cả mọi nơi đều là đạo tràng")).firstMatch.waitForExistence(timeout: 30))
        frame("03-reader", app: app) { app.webViews.firstMatch.swipeUp() }
        route("/phap-thoai", app: app)
        XCTAssertTrue(app.searchFields["Tìm kiếm album..."].firstMatch.waitForExistence(timeout: 25))
        frame("04-dharma-talks", app: app) { app.webViews.firstMatch.swipeUp() }
        navigate("Tu tập", app: app, captureNavigationEvidence: false)
        dismissPracticeSyncNotice(app)
        frame("05-practice-tools", app: app)
        openRosaryFromCatalog(app)
        frame("06-prayer-beads", app: app) {
            self.tap(app.buttons["Niệm một hạt"].firstMatch, app: app)
            self.tap(app.buttons["Niệm một hạt"].firstMatch, app: app)
        }
        tap(app.buttons["Quay lại tu tập"].firstMatch, app: app)
        let meditation = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Thiền định")).firstMatch
        revealContentControl(meditation, app: app)
        tap(meditation, app: app)
        tap(app.buttons["Bắt đầu thiền"].firstMatch, app: app)
        frame("07-meditation", app: app)
        // Rời bằng điều hướng thật; không đánh dấu hoàn thành hoặc ghi server.
        route("/tu-tap/chep-kinh", app: app)
        let choice = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Kinh Địa Tạng Bồ Tát Bổn Nguyện")).firstMatch
        let toggle = app.switches.matching(NSPredicate(format: "label CONTAINS %@", "Kinh Địa Tạng Bồ Tát Bổn Nguyện")).firstMatch
        waitUntil("Copying scripture selector must exist", timeout: 30) { choice.exists || toggle.exists }
        tap(toggle.exists ? toggle : choice, app: app)
        tap(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Tôi đã đọc, tiếp tục chép")).firstMatch, app: app)
        XCTAssertTrue(app.textViews["Tự gõ bản chép của bạn"].firstMatch.waitForExistence(timeout: 20))
        frame("08-scripture-copying", app: app)
        route("/tu-tap", app: app)
        let dream = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Giải mộng")).firstMatch
        if dream.exists { revealContentControl(dream, app: app) }
        frame("09-new-tools", app: app)
        route("/tu-tap/giai-mong", app: app)
        XCTAssertTrue(app.searchFields["Tìm kiếm giấc mơ"].firstMatch.waitForExistence(timeout: 25))
        frame("10-dream-library", app: app) { app.webViews.firstMatch.swipeUp() }
    }
}
