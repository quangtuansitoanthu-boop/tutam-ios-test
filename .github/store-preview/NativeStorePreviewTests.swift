
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
        Thread.sleep(forTimeInterval: 11.5)
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
        route("/tu-tap", app: app)
        let dream = app.links.matching(NSPredicate(format: "label BEGINSWITH[cd] %@", "Giải Mộng")).firstMatch
        XCTAssertTrue(dream.waitForExistence(timeout: 25), "The actual dream tool link must exist")
        revealContentControl(dream, app: app)
        for title in ["Quán Âm", "Mộc Luân", "Nhịp Sinh Học", "Giải Mộng"] {
            XCTAssertTrue(app.links.matching(NSPredicate(format: "label BEGINSWITH[cd] %@", title)).firstMatch.exists)
        }
        frame("09-new-tools", app: app)
    }
}