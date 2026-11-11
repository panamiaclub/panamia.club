import UIKit
import Capacitor

final class PanaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AgeAssuranceViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        (window?.rootViewController as? AgeAssuranceViewController)?.becameActive()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        (window?.rootViewController as? AgeAssuranceViewController)?.prepareForBackground()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        (window?.rootViewController as? AgeAssuranceViewController)?.prepareForBackground()
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        (window?.rootViewController as? AgeAssuranceViewController)?.disconnect()
    }
}
