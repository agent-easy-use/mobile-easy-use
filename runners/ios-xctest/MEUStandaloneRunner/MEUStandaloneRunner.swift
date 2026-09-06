import Darwin
import XCTest

final class MEUStandaloneRunner: XCTestCase {
    private var runtimeHandle: UnsafeMutableRawPointer?

    @MainActor
    func testServeInputCommands() throws {
        continueAfterFailure = true
        try loadRuntime()

        while true {
            let keepAlive = expectation(description: "Wait for Frida input commands")
            _ = XCTWaiter.wait(for: [keepAlive], timeout: 3600)
        }
    }

    private func loadRuntime() throws {
        let testBundle = Bundle(for: MEUStandaloneRunner.self)
        let runtimeURL = testBundle.bundleURL
            .appendingPathComponent("Frameworks", isDirectory: true)
            .appendingPathComponent("MobileEasyUseRuntime.dylib")
        runtimeHandle = dlopen(runtimeURL.path, RTLD_NOW | RTLD_LOCAL)
        guard runtimeHandle != nil else {
            let message = dlerror().map { String(cString: $0) } ?? "unknown dlopen error"
            throw XCTSkip("Cannot load Runner Frida runtime: \(message)")
        }
    }
}
