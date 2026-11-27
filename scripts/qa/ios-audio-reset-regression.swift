// GitHub QA appends this fixture to DharmaAudioPlugin.swift for the Simulator build.
#if DEBUG && targetEnvironment(simulator)
extension DharmaAudioPlugin {
    @MainActor
    static func runAudioResetRegression() async {
        let plugin = DharmaAudioPlugin()
        plugin.configure()
        var checks: [String] = []

        func call(_ name: String, _ args: [String: Any], _ run: (CAPPluginCall) -> Void) async throws -> [String: Any] {
            try await withCheckedThrowingContinuation { continuation in
                let options = JSTypes.coerceDictionaryToJSObject(args as [AnyHashable: Any]) ?? [:]
                let request = CAPPluginCall(callbackId: UUID().uuidString, methodName: name, options: options,
                    success: { result, _ in continuation.resume(returning: result?.data ?? [:]) },
                    error: { error in
                        let details = [name, error?.code, error?.message, error?.error?.localizedDescription].compactMap { $0 }
                        continuation.resume(throwing: plugin.failure(details.joined(separator: ": ")))
                    })!
                run(request)
            }
        }

        func require(_ condition: Bool, _ reason: String) throws {
            if !condition { throw plugin.failure(reason) }
        }

        func wait(_ reason: String, _ completed: () -> Bool) async throws {
            let deadline = ProcessInfo.processInfo.systemUptime + 10
            while !completed() {
                try require(ProcessInfo.processInfo.systemUptime < deadline, reason)
                try await Task.sleep(nanoseconds: 100_000_000)
            }
        }

        func reset() {
            NotificationCenter.default.post(name: AVAudioSession.mediaServicesWereResetNotification, object: AVAudioSession.sharedInstance())
        }

        func interruption(_ type: AVAudioSession.InterruptionType) {
            NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance(), userInfo: [
                AVAudioSessionInterruptionTypeKey: type.rawValue,
                AVAudioSessionInterruptionOptionKey: AVAudioSession.InterruptionOptions.shouldResume.rawValue
            ])
        }

        var result: [String: Any]
        do {
            let tracks = (1...2).map { ["title": "QA audio \($0)", "url": "asset:///public/assets/audio/nhac-thien-0\($0).m4a"] }
            _ = try await call("setQueue", ["queueId": "qa-reset", "tracks": tracks, "index": 0, "position": 8.0], plugin.setQueue)
            _ = try await call("options", ["volume": 0.35, "speed": 1.25, "repeat": 2], plugin.options)
            _ = try await call("sleep", ["remainingMs": 60_000.0], plugin.sleep)
            _ = try await call("play", [:], plugin.play)
            try await wait("Initial playback did not advance") { plugin.player.timeControlStatus == .playing && plugin.playbackPosition() > 9 }
            let position = plugin.playbackPosition()
            let originalPlayer = plugin.player
            let originalItem = plugin.player.currentItem
            let remaining = plugin.sleepRemaining
            let duration = plugin.seconds(plugin.player.currentItem?.duration ?? .zero)
            reset()
            try require(plugin.player !== originalPlayer, "Reset reused the old AVPlayer")
            try await Task.sleep(nanoseconds: 500_000_000)
            let paused = try await call("getState", [:], plugin.getState)
            try require(plugin.player.currentItem == nil, "Reset loaded media before a user action")
            try require(paused["playing"] as? Bool == false && paused["playWhenReady"] as? Bool == false, "Reset started playback on its own")
            try require(paused["queueId"] as? String == "qa-reset" && paused["trackIndex"] as? Int == 0, "Reset changed the queue or track")
            try require(abs((paused["position"] as? Double ?? 0) - position) < 0.35, "Reset lost the saved position")
            try require(duration > 0 && paused["duration"] as? Double == duration, "Reset lost the track duration")
            try require(abs(plugin.player.volume - 0.35) < 0.001 && plugin.speed == 1.25 && plugin.repeatMode == 2, "Reset lost playback settings")
            try require(plugin.sleepRemaining > 0 && abs(plugin.sleepRemaining - remaining) < 1_000, "Reset lost the sleep timer")
            try require(paused["error"] as? String == "", "Successful recovery exposed a playback error")
            checks.append("new-player-paused-with-position-and-settings")

            _ = try await call("play", [:], plugin.play)
            try await wait("Explicit Play did not resume from the saved position") { plugin.player.timeControlStatus == .playing && plugin.playbackPosition() > position + 0.5 }
            try require(plugin.player.currentItem !== originalItem, "Play reused the old track item")
            checks.append("explicit-play-resumes")

            interruption(.began)
            let interruptedPosition = plugin.playbackPosition()
            reset()
            let secondPlayer = plugin.player
            reset()
            interruption(.ended)
            try require(plugin.player !== secondPlayer, "Repeated reset kept the previous player")
            try await wait("Repeated reset did not settle") { plugin.pendingSeekPosition == nil }
            try require(!plugin.intendedPlaying && plugin.player.timeControlStatus == .paused, "Old interruption or seek resumed after reset")
            try require(abs(plugin.playbackPosition() - interruptedPosition) < 0.35, "Repeated reset lost the position")
            checks.append("repeated-reset-and-stale-interruption")

            _ = try await call("seek", ["position": 12.0], plugin.seek)
            try require(!plugin.intendedPlaying && plugin.player.timeControlStatus == .paused && abs(plugin.playbackPosition() - 12) < 0.35,
                        "Seeking after reset must load the item and stay paused")
            _ = try await call("seek", [:]) { request in
                plugin.beginSeek(position: 15, call: CAPPluginCall(callbackId: UUID().uuidString, methodName: "seek", options: [:],
                    success: { _, _ in request.reject("Old seek resolved after reset") },
                    error: { error in
                        guard error?.code == "AUDIO_SERVICES_RESET" else { request.reject("Old seek cancellation not reported"); return }
                        request.resolve()
                    })!)
                reset()
            }
            try require(abs(plugin.playbackPosition() - 15) < 0.35, "Pending seek position was not retained")
            _ = try await call("play", [:], plugin.play)
            try await wait("Play did not resume the retained seek") { plugin.player.timeControlStatus == .playing && plugin.playbackPosition() > 15.5 }
            _ = try await call("pause", [:], plugin.pause)
            try require(!plugin.intendedPlaying && plugin.player.timeControlStatus == .paused, "Cancelled seek started playback")
            checks.append("in-flight-seek-cancelled-and-recovered")

            _ = try await call("stop", [:], plugin.stop)
            reset()
            let idle = try await call("getState", [:], plugin.getState)
            try require(idle["queueId"] as? String == "" && idle["error"] as? String == "" && plugin.player.currentItem == nil,
                        "Idle reset resurrected a queue or surfaced an error")
            checks.append("idle-reset-stays-idle")
            result = ["passed": true, "checks": checks]
        } catch {
            result = ["passed": false, "checks": checks, "error": error.localizedDescription]
        }
        do {
            let folder = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: folder.appendingPathComponent("ios-audio-reset-qa.json"), options: .atomic)
        } catch {
            NSLog("Could not save audio reset QA result: %@", error.localizedDescription)
        }
    }
}
#endif
