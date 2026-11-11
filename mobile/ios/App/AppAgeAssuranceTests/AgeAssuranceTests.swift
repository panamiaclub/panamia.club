import XCTest
import UIKit
@testable import App

private final class AppearanceController: UIViewController {
    var onAppear: (() -> Void)?

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        onAppear?()
    }
}

final class AgeAssuranceTests: XCTestCase {
    @MainActor private var testWindow: UIWindow?

    @MainActor
    private func host(
        check: @escaping AgeAssuranceViewController.AgeCheck,
        makeApp: @escaping @MainActor () -> UIViewController
    ) throws -> AgeAssuranceViewController {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        let controller = AgeAssuranceViewController(checkAge: check, makeApp: makeApp)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.loadViewIfNeeded()
        testWindow = window
        controller.becameActive()
        return controller
    }

    @MainActor
    private func finish(_ controller: AgeAssuranceViewController) {
        controller.disconnect()
        testWindow?.isHidden = true
        testWindow?.rootViewController = nil
        testWindow = nil
    }

    @MainActor
    private func element(_ identifier: String, in view: UIView) -> UIView? {
        if view.accessibilityIdentifier == identifier { return view }
        return view.subviews.lazy.compactMap { self.element(identifier, in: $0) }.first
    }

    func testPolicyRequiresAnUnambiguousAdultLowerBound() {
        XCTAssertEqual(AgeAssurancePolicy.minimumAge, 18)
        let nonAdultBounds: [Int?] = [nil, 0, 13, 16, 17]
        for lowerBound in nonAdultBounds {
            XCTAssertEqual(AgeAssurancePolicy.decision(lowerBound: lowerBound), .blocked(.notAdult))
        }
        for lowerBound in [18, 19, 25, 99] {
            XCTAssertEqual(AgeAssurancePolicy.decision(lowerBound: lowerBound), .allowed)
        }
    }

    @MainActor
    func testWebViewIsNotConstructedBeforeAnAllowedDecision() async throws {
        let requested = expectation(description: "Age request started")
        let opened = expectation(description: "Allowed app constructed")
        let appeared = expectation(description: "Allowed app receives UIKit appearance")
        var resolve: CheckedContinuation<AgeAssuranceDecision, Never>?
        var creations = 0
        let controller = try host(check: { _ in
            requested.fulfill()
            return await withCheckedContinuation { resolve = $0 }
        }, makeApp: {
            creations += 1
            opened.fulfill()
            let app = AppearanceController()
            app.onAppear = { appeared.fulfill() }
            return app
        })
        defer { finish(controller) }
        await fulfillment(of: [requested], timeout: 5)
        XCTAssertEqual(creations, 0)
        XCTAssertTrue(controller.children.isEmpty)
        XCTAssertFalse(try XCTUnwrap(element("age-assurance.gate", in: controller.view)).isHidden)
        resolve?.resume(returning: .allowed)
        await fulfillment(of: [opened, appeared], timeout: 5)
        XCTAssertEqual(creations, 1)
        XCTAssertEqual(controller.children.count, 1)
    }

    @MainActor
    func testMinorDeclinedAndUnknownResponsesNeverConstructTheApp() async throws {
        for reason in [AgeAssuranceBlock.notAdult, .sharingDeclined, .unsupportedResponse] {
            let checked = expectation(description: "Blocked age decision returned")
            var creations = 0
            let controller = try host(check: { _ in
                checked.fulfill()
                return .blocked(reason)
            }, makeApp: {
                creations += 1
                return UIViewController()
            })
            await fulfillment(of: [checked], timeout: 5)
            XCTAssertEqual(creations, 0)
            XCTAssertTrue(controller.children.isEmpty)
            let gate = try XCTUnwrap(element("age-assurance.gate", in: controller.view))
            XCTAssertFalse(gate.isHidden)
            XCTAssertEqual(gate.overrideUserInterfaceStyle, .light)
            XCTAssertEqual(controller.overrideUserInterfaceStyle, .unspecified)
            finish(controller)
        }
    }

    @MainActor
    func testErrorDoesNotAllowTheAppAndRetryCanRecover() async throws {
        let opened = expectation(description: "App opened after successful retry")
        let failed = expectation(description: "First age check failed")
        var attempts = 0
        let controller = try host(check: { _ in
            attempts += 1
            if attempts == 1 {
                failed.fulfill()
                throw NSError(domain: "AgeAssuranceTests", code: 1)
            }
            return .allowed
        }, makeApp: {
            opened.fulfill()
            return UIViewController()
        })
        defer { finish(controller) }
        await fulfillment(of: [failed], timeout: 5)
        XCTAssertTrue(controller.children.isEmpty)
        let retry = try XCTUnwrap(element("age-assurance.retry", in: controller.view) as? UIButton)
        retry.sendActions(for: .touchUpInside)
        await fulfillment(of: [opened], timeout: 5)
        XCTAssertEqual(attempts, 2)
    }

    @MainActor
    func testForegroundRecheckMasksAndRemovesAnAppThatIsNoLongerAllowed() async throws {
        let opened = expectation(description: "Initial adult app opened")
        let blocked = expectation(description: "Foreground age check no longer allows the app")
        var attempts = 0
        let controller = try host(check: { _ in
            attempts += 1
            if attempts == 1 { return .allowed }
            blocked.fulfill()
            return .blocked(.notAdult)
        }, makeApp: {
            opened.fulfill()
            return UIViewController()
        })
        defer { finish(controller) }
        await fulfillment(of: [opened], timeout: 5)
        controller.prepareForBackground()
        XCTAssertFalse(try XCTUnwrap(element("age-assurance.gate", in: controller.view)).isHidden)
        XCTAssertTrue(try XCTUnwrap(controller.children.first).view.isHidden)
        controller.becameActive()
        await fulfillment(of: [blocked], timeout: 5)
        XCTAssertTrue(controller.children.isEmpty)
        XCTAssertEqual(attempts, 2)
    }

    @MainActor
    func testStaleBackgroundCompletionCannotOpenTheApp() async throws {
        let requested = expectation(description: "First request started")
        let blocked = expectation(description: "Fresh foreground request is blocked")
        var resolve: CheckedContinuation<AgeAssuranceDecision, Never>?
        var attempts = 0
        var creations = 0
        let controller = try host(check: { _ in
            attempts += 1
            if attempts > 1 {
                blocked.fulfill()
                return .blocked(.notAdult)
            }
            requested.fulfill()
            return await withCheckedContinuation { resolve = $0 }
        }, makeApp: {
            creations += 1
            return UIViewController()
        })
        defer { finish(controller) }
        await fulfillment(of: [requested], timeout: 5)
        controller.prepareForBackground()
        controller.becameActive()
        resolve?.resume(returning: .allowed)
        await fulfillment(of: [blocked], timeout: 5)
        XCTAssertEqual(attempts, 2)
        XCTAssertEqual(creations, 0)
        XCTAssertTrue(controller.children.isEmpty)
    }

    @MainActor
    func testForegroundDismissesAnOldNativePickerBeforeCheckingAgain() async throws {
        let opened = expectation(description: "Initial app opened")
        let presented = expectation(description: "Native picker presented")
        let rechecked = expectation(description: "Foreground age recheck ran")
        var attempts = 0
        let controller = try host(check: { _ in
            attempts += 1
            if attempts > 1 { rechecked.fulfill() }
            return .allowed
        }, makeApp: {
            opened.fulfill()
            return UIViewController()
        })
        defer { finish(controller) }
        await fulfillment(of: [opened], timeout: 5)
        let app = try XCTUnwrap(controller.children.first)
        app.present(UIViewController(), animated: false) { presented.fulfill() }
        await fulfillment(of: [presented], timeout: 5)
        controller.prepareForBackground()
        controller.becameActive()
        await fulfillment(of: [rechecked], timeout: 5)
        XCTAssertNil(controller.presentedViewController)
        XCTAssertNil(app.presentedViewController)
        XCTAssertEqual(controller.children.count, 1)
    }
}
