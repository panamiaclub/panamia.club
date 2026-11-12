package social.pana.app;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.UnrecoverableKeyException;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PanaProtectedStorageInstrumentedTest {
    private static final String ORIGIN = "https://pana.social";

    private Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = PanaProtectedStoragePlugin.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(new PanaProtectedStoragePlugin(), args);
    }

    private SecretKey key(String scope, boolean create) throws Exception {
        return (SecretKey) invoke("key", new Class<?>[] { String.class, String.class, boolean.class },
            ORIGIN, scope, create);
    }

    private byte[] aad(String origin, String scope) throws Exception {
        return (byte[]) invoke("aad", new Class<?>[] { String.class, String.class }, origin, scope);
    }

    private String scope() {
        byte[] value = new byte[32];
        new SecureRandom().nextBytes(value);
        StringBuilder text = new StringBuilder();
        for (byte item : value) text.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
        return text.toString();
    }

    private SharedPreferences checkpoint() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext()
            .getSharedPreferences("pana-chat-qualification", Context.MODE_PRIVATE);
    }

    @Test
    public void keyIsNonExportableOriginBoundAndExcludedFromBackup() throws Exception {
        String handle = scope();
        SecretKey secret = key(handle, true);
        assertNull(secret.getEncoded());
        assertEquals("AndroidKeyStore", KeyStore.getInstance("AndroidKeyStore").getProvider().getName());
        Cipher sealed = Cipher.getInstance("AES/GCM/NoPadding");
        sealed.init(Cipher.ENCRYPT_MODE, secret);
        sealed.updateAAD(aad(ORIGIN, handle));
        byte[] ciphertext = sealed.doFinal(new byte[32]);
        Cipher opened = Cipher.getInstance("AES/GCM/NoPadding");
        opened.init(Cipher.DECRYPT_MODE, secret, new GCMParameterSpec(128, sealed.getIV()));
        opened.updateAAD(aad("https://untrusted.invalid", handle));
        try {
            opened.doFinal(ciphertext);
            fail("Another origin cannot open a protected key.");
        } catch (javax.crypto.AEADBadTagException expected) {
            assertNotNull(expected);
        }
        ApplicationInfo app = InstrumentationRegistry.getInstrumentation().getTargetContext().getApplicationInfo();
        assertEquals(0, app.flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
    }

    @Test
    public void missingKeyCannotBeSilentlyRegenerated() throws Exception {
        try {
            key(scope(), false);
            fail("Unprotect must not generate a missing device key.");
        } catch (InvocationTargetException expected) {
            assertTrue(expected.getCause() instanceof UnrecoverableKeyException);
        }
    }

    // Invoke these separately, stopping the application between the two runs.
    @Test
    public void createColdStartCheckpoint() throws Exception {
        String handle = scope();
        byte[] clear = new byte[32];
        new SecureRandom().nextBytes(clear);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(handle, true));
        cipher.updateAAD(aad(ORIGIN, handle));
        byte[] ciphertext = cipher.doFinal(clear);
        assertTrue(checkpoint().edit().putString("scope", handle)
            .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .putString("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .putString("digest", Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(clear), Base64.NO_WRAP))
            .commit());
        java.util.Arrays.fill(clear, (byte) 0);
    }

    @Test
    public void openColdStartCheckpoint() throws Exception {
        SharedPreferences saved = checkpoint();
        String handle = saved.getString("scope", null);
        assertNotNull("Create the cold-start checkpoint in a separate instrumentation invocation first.", handle);
        SecretKey secret = key(handle, false);
        assertNull(secret.getEncoded());
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secret, new GCMParameterSpec(128,
            Base64.decode(saved.getString("iv", ""), Base64.NO_WRAP)));
        cipher.updateAAD(aad(ORIGIN, handle));
        byte[] clear = cipher.doFinal(Base64.decode(saved.getString("ciphertext", ""), Base64.NO_WRAP));
        assertEquals(saved.getString("digest", null),
            Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(clear), Base64.NO_WRAP));
        java.util.Arrays.fill(clear, (byte) 0);
        assertTrue(saved.edit().clear().commit());
    }
}
