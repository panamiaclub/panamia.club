import UIKit
import Capacitor
import DeclaredAgeRange

enum SystemAgeAssurance {
    @MainActor
    static func check(in presenter: UIViewController) async throws -> AgeAssuranceDecision {
        guard #available(iOS 26.2, *) else {
            // Apple's regional age-assurance APIs do not exist on these OS versions.
            return .allowed
        }

        let service = AgeRangeService.shared
        let eligible = try await service.isEligibleForAgeFeatures
        try Task.checkCancellation()
        guard eligible else { return .allowed }
        if #available(iOS 26.4, *) {
            let features = try await service.requiredRegulatoryFeatures
            try Task.checkCancellation()
            guard features.contains(.declaredAgeRangeRequired) else { return .allowed }
        }

        switch try await service.requestAgeRange(ageGates: AgeAssurancePolicy.minimumAge, in: presenter) {
        case .sharing(let range):
            return AgeAssurancePolicy.decision(lowerBound: range.lowerBound)
        case .declinedSharing:
            return .blocked(.sharingDeclined)
        @unknown default:
            return .blocked(.unsupportedResponse)
        }
    }
}

final class AgeAssuranceViewController: UIViewController {
    typealias AgeCheck = @MainActor (UIViewController) async throws -> AgeAssuranceDecision

    private let checkAge: AgeCheck
    private let makeApp: @MainActor () -> UIViewController
    private var appController: UIViewController?
    private var checkTask: Task<Void, Never>?
    private var generation = 0
    private var active = false
    private var needsCheck = true
    private let gate = UIView()
    private let titleLabel = UILabel()
    private let messageLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)
    private let retryButton = UIButton(type: .system)

    init(checkAge: @escaping AgeCheck = SystemAgeAssurance.check,
         makeApp: @escaping @MainActor () -> UIViewController = { PanaBridgeViewController() }) {
        self.checkAge = checkAge
        self.makeApp = makeApp
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        checkAge = SystemAgeAssurance.check
        makeApp = { PanaBridgeViewController() }
        super.init(coder: coder)
    }

    override var childForStatusBarStyle: UIViewController? { appController }
    override var childForStatusBarHidden: UIViewController? { appController }
    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 1, green: 247.0 / 255.0, blue: 236.0 / 255.0, alpha: 1)
        gate.backgroundColor = view.backgroundColor
        gate.translatesAutoresizingMaskIntoConstraints = false
        gate.accessibilityIdentifier = "age-assurance.gate"
        view.addSubview(gate)
        NSLayoutConstraint.activate([
            gate.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            gate.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            gate.topAnchor.constraint(equalTo: view.topAnchor),
            gate.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        gate.addSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: gate.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: gate.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: gate.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: gate.safeAreaLayoutGuide.bottomAnchor)
        ])

        titleLabel.font = .preferredFont(forTextStyle: .title1)
        titleLabel.accessibilityTraits.insert(.header)
        titleLabel.accessibilityIdentifier = "age-assurance.title"
        messageLabel.font = .preferredFont(forTextStyle: .body)
        messageLabel.accessibilityIdentifier = "age-assurance.message"
        for label in [titleLabel, messageLabel] {
            label.adjustsFontForContentSizeCategory = true
            label.numberOfLines = 0
            label.textAlignment = .center
            label.textColor = .label
        }

        retryButton.setTitle(text("age.retry"), for: .normal)
        retryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retryButton.titleLabel?.adjustsFontForContentSizeCategory = true
        retryButton.accessibilityIdentifier = "age-assurance.retry"
        retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)
        let privacy = legalButton("age.privacy", path: "/legal/privacy")
        let terms = legalButton("age.terms", path: "/legal/terms")
        let stack = UIStackView(arrangedSubviews: [titleLabel, messageLabel, spinner, retryButton, privacy, terms])
        stack.axis = .vertical
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 40),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            stack.centerXAnchor.constraint(equalTo: scroll.frameLayoutGuide.centerXAnchor),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            retryButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            privacy.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            terms.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
        showChecking()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        checkIfNeeded()
    }

    func prepareForBackground() {
        active = false
        needsCheck = true
        generation += 1
        if isViewLoaded { showChecking() }
    }

    func becameActive() {
        active = true
        checkIfNeeded()
    }

    func disconnect() {
        active = false
        generation += 1
        checkTask?.cancel()
        checkTask = nil
        removeApp()
    }

    private func checkIfNeeded() {
        guard active, needsCheck, isViewLoaded, view.window != nil, checkTask == nil else { return }
        needsCheck = false
        let requestGeneration = generation
        showChecking()
        checkTask = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await checkAge(self)
                guard !Task.isCancelled else { return }
                checkTask = nil
                guard active, generation == requestGeneration else {
                    needsCheck = true
                    checkIfNeeded()
                    return
                }
                apply(result)
            } catch {
                guard !Task.isCancelled else { return }
                checkTask = nil
                guard active, generation == requestGeneration else {
                    needsCheck = true
                    checkIfNeeded()
                    return
                }
                let failure = error as NSError
                NSLog("[age-assurance] check failed (%@:%ld)", failure.domain, failure.code)
                removeApp()
                showMessage(title: "age.error.title", message: "age.error.message")
            }
        }
    }

    private func apply(_ decision: AgeAssuranceDecision) {
        switch decision {
        case .allowed:
            if appController == nil {
                let controller = makeApp()
                addChild(controller)
                controller.view.translatesAutoresizingMaskIntoConstraints = false
                view.insertSubview(controller.view, belowSubview: gate)
                NSLayoutConstraint.activate([
                    controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                    controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                    controller.view.topAnchor.constraint(equalTo: view.topAnchor),
                    controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
                ])
                controller.didMove(toParent: self)
                appController = controller
            }
            appController?.view.isHidden = false
            appController?.view.isUserInteractionEnabled = true
            gate.isHidden = true
            setNeedsStatusBarAppearanceUpdate()
        case .blocked(let reason):
            removeApp()
            showMessage(title: "age.blocked.title",
                        message: reason == .sharingDeclined ? "age.declined.message" : "age.blocked.message")
        }
    }

    private func removeApp() {
        guard let controller = appController else { return }
        (controller as? CAPBridgeViewController)?.webView?.stopLoading()
        controller.willMove(toParent: nil)
        controller.view.removeFromSuperview()
        controller.removeFromParent()
        appController = nil
        setNeedsStatusBarAppearanceUpdate()
    }

    private func showChecking() {
        gate.isHidden = false
        appController?.view.isHidden = true
        appController?.view.isUserInteractionEnabled = false
        titleLabel.text = text("age.checking.title")
        messageLabel.text = text("age.checking.message")
        retryButton.isHidden = true
        spinner.startAnimating()
    }

    private func showMessage(title: String, message: String) {
        gate.isHidden = false
        titleLabel.text = text(title)
        messageLabel.text = text(message)
        retryButton.isHidden = false
        spinner.stopAnimating()
        if view.window != nil {
            UIAccessibility.post(notification: .screenChanged, argument: titleLabel)
        }
    }

    @objc private func retry() {
        needsCheck = true
        checkIfNeeded()
    }

    private func text(_ key: String) -> String {
        NSLocalizedString(key, comment: "Native age-assurance gate")
    }

    private func legalButton(_ title: String, path: String) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(text(title), for: .normal)
        button.titleLabel?.font = .preferredFont(forTextStyle: .body)
        button.titleLabel?.adjustsFontForContentSizeCategory = true
        button.addAction(UIAction { _ in
            UIApplication.shared.open(URL(string: "https://panamia.club\(path)")!)
        }, for: .touchUpInside)
        return button
    }
}
