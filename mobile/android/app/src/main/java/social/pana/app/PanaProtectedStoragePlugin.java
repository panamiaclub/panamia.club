package social.pana.app;

import android.net.Uri;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.UnrecoverableKeyException;
import java.util.Arrays;
import java.util.Locale;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/** Wraps only a 32-byte local data key; MLS state never crosses the bridge. */
@CapacitorPlugin(name = "PanaProtectedStorage")
public final class PanaProtectedStoragePlugin extends Plugin {
    private interface Action {
        JSObject run(String origin, String scope) throws GeneralSecurityException, IOException;
    }

    static String origin(String value) {
        if (value == null) return null;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || uri.getUserInfo() != null) return null;
        scheme = scheme.toLowerCase(Locale.ROOT);
        if (!scheme.equals("https") && !(BuildConfig.DEBUG && scheme.equals("http"))) return null;
        int port = uri.getPort();
        String suffix = port == -1 || (port == 443 && scheme.equals("https"))
            || (port == 80 && scheme.equals("http")) ? "" : ":" + port;
        return scheme + "://" + host.toLowerCase(Locale.ROOT) + suffix;
    }

    private void run(PluginCall call, Action action) {
        getActivity().runOnUiThread(() -> {
            String pageOrigin = origin(getBridge().getWebView().getUrl());
            boolean trusted = false;
            for (String allowed : getConfig().getArray("trustedOrigins", new String[0])) {
                if (pageOrigin != null && pageOrigin.equals(origin(allowed))) trusted = true;
            }
            String scope = call.getString("scope");
            if (!trusted) {
                call.reject("Protected storage is unavailable to this origin.", "VAULT_ORIGIN");
                return;
            }
            if (scope == null || !scope.matches("^[a-f0-9]{64}$")) {
                call.reject("Invalid protected-storage handle.", "VAULT_INPUT");
                return;
            }
            try {
                call.resolve(action.run(pageOrigin, scope));
            } catch (IllegalArgumentException error) {
                call.reject("Invalid protected-key encoding.", "VAULT_INPUT");
            } catch (GeneralSecurityException | IOException error) {
                call.reject("Cannot unlock this device key. Recover onto a fresh approved device.", "VAULT_UNAVAILABLE");
            }
        });
    }

    private String alias(String origin, String scope) throws GeneralSecurityException {
        byte[] digest = MessageDigest.getInstance("SHA-256")
            .digest((origin + "\0" + scope).getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder("pana.chat.v1.");
        for (byte value : digest) result.append(String.format(Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }

    private SecretKey key(String origin, String scope, boolean create)
        throws GeneralSecurityException, IOException {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        String name = alias(origin, scope);
        if (store.containsAlias(name)) {
            java.security.Key existing = store.getKey(name, null);
            if (!(existing instanceof SecretKey)) throw new UnrecoverableKeyException();
            return (SecretKey) existing;
        }
        if (!create) throw new UnrecoverableKeyException();
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(name,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) spec.setUnlockedDeviceRequired(true);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(spec.build());
        return generator.generateKey();
    }

    private byte[] aad(String origin, String scope) {
        return ("pana-chat/native-vault/1\0" + origin + "\0" + scope).getBytes(StandardCharsets.UTF_8);
    }

    @PluginMethod
    public void capabilities(PluginCall call) {
        run(call, (origin, scope) -> {
            SecretKey secret = key(origin, scope, true);
            KeyInfo info = (KeyInfo) SecretKeyFactory.getInstance(secret.getAlgorithm(), "AndroidKeyStore")
                .getKeySpec(secret, KeyInfo.class);
            JSObject result = new JSObject();
            result.put("version", 1);
            result.put("provider", "android-keystore");
            result.put("deviceBound", true);
            result.put("hardwareBacked", info.isInsideSecureHardware());
            return result;
        });
    }

    @PluginMethod
    public void protect(PluginCall call) {
        run(call, (origin, scope) -> {
            String encoded = call.getString("data");
            if (encoded == null || encoded.length() != 44) throw new IllegalArgumentException();
            byte[] clear = Base64.decode(encoded, Base64.NO_WRAP);
            if (clear.length != 32) throw new IllegalArgumentException();
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key(origin, scope, true));
                cipher.updateAAD(aad(origin, scope));
                byte[] encrypted = cipher.doFinal(clear);
                JSObject result = new JSObject();
                result.put("version", 1);
                result.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
                result.put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP));
                return result;
            } finally {
                Arrays.fill(clear, (byte) 0);
            }
        });
    }

    @PluginMethod
    public void unprotect(PluginCall call) {
        run(call, (origin, scope) -> {
            String encodedIv = call.getString("iv");
            String encodedCiphertext = call.getString("ciphertext");
            if (call.getInt("version", 0) != 1 || encodedIv == null || encodedIv.length() != 16
                || encodedCiphertext == null || encodedCiphertext.length() != 64) throw new IllegalArgumentException();
            byte[] iv = Base64.decode(encodedIv, Base64.NO_WRAP);
            byte[] encrypted = Base64.decode(encodedCiphertext, Base64.NO_WRAP);
            if (iv.length != 12 || encrypted.length != 48) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(origin, scope, false), new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad(origin, scope));
            byte[] clear = cipher.doFinal(encrypted);
            try {
                if (clear.length != 32) throw new IllegalArgumentException();
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(clear, Base64.NO_WRAP));
                return result;
            } finally {
                Arrays.fill(clear, (byte) 0);
            }
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        run(call, (origin, scope) -> {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            store.deleteEntry(alias(origin, scope));
            JSObject result = new JSObject();
            result.put("removed", true);
            return result;
        });
    }
}
