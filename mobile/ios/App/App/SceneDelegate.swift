import UIKit
import Capacitor
import CryptoKit
import Security

@objc(PanaProtectedStoragePlugin)
public final class PanaProtectedStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PanaProtectedStoragePlugin"
    public let jsName = "PanaProtectedStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "protect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unprotect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private enum VaultError: Error { case input, origin, unavailable }
    private let service = "social.pana.chat.v1"

    private func origin(_ url: URL) -> String? {
        guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(),
              url.user == nil, url.password == nil else { return nil }
        #if DEBUG
        guard scheme == "https" || scheme == "http" else { return nil }
        #else
        guard scheme == "https" else { return nil }
        #endif
        let port = url.port
        let suffix = port == nil || (scheme == "https" && port == 443) ||
            (scheme == "http" && port == 80) ? "" : ":\(port ?? 0)"
        return "\(scheme)://\(host)\(suffix)"
    }

    private func excludeLiveStateFromBackup() throws {
        guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first
        else { throw VaultError.unavailable }
        var directory = library.appendingPathComponent("WebKit", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        guard try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true
        else { throw VaultError.unavailable }
    }

    private func run(_ call: CAPPluginCall, _ action: @escaping (String, String) throws -> JSObject) {
        DispatchQueue.main.async {
            do {
                guard let url = self.bridge?.webView?.url, let pageOrigin = self.origin(url) else {
                    throw VaultError.origin
                }
                let configured = self.getConfig().getArray("trustedOrigins") as? [String] ?? []
                guard configured.contains(where: {
                    guard let configuredURL = URL(string: $0) else { return false }
                    return self.origin(configuredURL) == pageOrigin
                }) else { throw VaultError.origin }
                guard let scope = call.getString("scope"),
                      scope.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
                else { throw VaultError.input }
                try self.excludeLiveStateFromBackup()
                call.resolve(try action(pageOrigin, scope))
            } catch VaultError.origin {
                call.reject("Protected storage is unavailable to this origin.", "VAULT_ORIGIN")
            } catch VaultError.input {
                call.reject("Invalid protected-key encoding.", "VAULT_INPUT")
            } catch {
                call.reject("Cannot unlock this device key. Recover onto a fresh approved device.", "VAULT_UNAVAILABLE")
            }
        }
    }

    private func account(_ origin: String, _ scope: String) -> String {
        let hash = SHA256.hash(data: Data((origin + "\0" + scope).utf8))
        return "pana.chat.v1." + hash.map { String(format: "%02x", $0) }.joined()
    }

    private func query(_ origin: String, _ scope: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account(origin, scope),
            kSecAttrSynchronizable as String: false
        ]
    }

    private func key(_ origin: String, _ scope: String, create: Bool) throws -> SymmetricKey {
        var lookup = query(origin, scope)
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecSuccess {
            guard let data = result as? Data, data.count == 32 else { throw VaultError.unavailable }
            return SymmetricKey(data: data)
        }
        guard create, status == errSecItemNotFound else { throw VaultError.unavailable }
        var bytes = Data(count: 32)
        let generated = bytes.withUnsafeMutableBytes { buffer -> Int32 in
            guard let address = buffer.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, 32, address)
        }
        guard generated == errSecSuccess else { throw VaultError.unavailable }
        var addition = query(origin, scope)
        addition[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        addition[kSecValueData as String] = bytes
        guard SecItemAdd(addition as CFDictionary, nil) == errSecSuccess else { throw VaultError.unavailable }
        return SymmetricKey(data: bytes)
    }

    private func aad(_ origin: String, _ scope: String) -> Data {
        Data(("pana-chat/native-vault/1\0" + origin + "\0" + scope).utf8)
    }

    @objc func capabilities(_ call: CAPPluginCall) {
        run(call) { origin, scope in
            _ = try self.key(origin, scope, create: true)
            return ["version": 1, "provider": "ios-keychain-this-device-only",
                    "deviceBound": true, "hardwareBacked": NSNull()]
        }
    }

    @objc func protect(_ call: CAPPluginCall) {
        run(call) { origin, scope in
            guard let encoded = call.getString("data"), encoded.count == 44,
                  let clear = Data(base64Encoded: encoded), clear.count == 32 else { throw VaultError.input }
            let box = try AES.GCM.seal(clear, using: self.key(origin, scope, create: true),
                                       authenticating: self.aad(origin, scope))
            return ["version": 1, "iv": Data(box.nonce).base64EncodedString(),
                    "ciphertext": (box.ciphertext + box.tag).base64EncodedString()]
        }
    }

    @objc func unprotect(_ call: CAPPluginCall) {
        run(call) { origin, scope in
            guard call.getInt("version") == 1,
                  let encodedIV = call.getString("iv"), encodedIV.count == 16,
                  let iv = Data(base64Encoded: encodedIV), iv.count == 12,
                  let encodedCiphertext = call.getString("ciphertext"), encodedCiphertext.count == 64,
                  let ciphertext = Data(base64Encoded: encodedCiphertext), ciphertext.count == 48
            else { throw VaultError.input }
            let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv),
                                            ciphertext: ciphertext.prefix(32), tag: ciphertext.suffix(16))
            let clear = try AES.GCM.open(box, using: self.key(origin, scope, create: false),
                                         authenticating: self.aad(origin, scope))
            guard clear.count == 32 else { throw VaultError.unavailable }
            return ["data": clear.base64EncodedString()]
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        run(call) { origin, scope in
            let status = SecItemDelete(self.query(origin, scope) as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw VaultError.unavailable }
            return ["removed": true]
        }
    }
}

final class PanaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
        bridge?.registerPluginInstance(PanaProtectedStoragePlugin())
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
