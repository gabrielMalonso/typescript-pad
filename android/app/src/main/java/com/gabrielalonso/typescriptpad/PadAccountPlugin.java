package com.gabrielalonso.typescriptpad;

import android.content.Intent;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** A Pad-only device credential, encrypted with Android Keystore and excluded from backups. */
@CapacitorPlugin(name = "PadAccount")
public class PadAccountPlugin extends Plugin {
    private static final String ALIAS = "typescript-pad-account";

    private AtomicFile file() {
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), "pad-account"));
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }

    @PluginMethod
    public synchronized void read(PluginCall call) {
        try {
            JSObject result = new JSObject();
            if (!file().getBaseFile().exists()) { result.put("token", JSONObject.NULL); call.resolve(result); return; }
            JSONObject saved = new JSONObject(new String(file().readFully(), StandardCharsets.UTF_8));
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(saved.getString("iv"), Base64.NO_WRAP)));
            result.put("token", new String(cipher.doFinal(Base64.decode(saved.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) { call.reject("Não foi possível recuperar a conta."); }
    }

    @PluginMethod
    public synchronized void write(PluginCall call) {
        AtomicFile target = file();
        FileOutputStream output = null;
        try {
            String token = call.getString("token");
            if (token == null) { target.delete(); call.resolve(); return; }
            if (!token.matches("[a-f0-9]{64}")) { call.reject("Credencial inválida."); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            JSONObject saved = new JSONObject();
            saved.put("data", Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
            saved.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
            output = target.startWrite();
            output.write(saved.toString().getBytes(StandardCharsets.UTF_8));
            target.finishWrite(output);
            call.resolve();
        } catch (Exception error) {
            if (output != null) target.failWrite(output);
            call.reject("Não foi possível guardar a conta.");
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("url", ""));
            if (!"https".equals(uri.getScheme()) || !"leitor-typescript-gabriel.gabrielm-alonso.chatgpt.site".equals(uri.getHost())
                || !("/pad/connect".equals(uri.getPath()) || "/pad/dispositivos".equals(uri.getPath()))) {
                call.reject("Endereço inválido."); return;
            }
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
            call.resolve();
        } catch (Exception error) { call.reject("Não foi possível abrir o navegador."); }
    }
}
