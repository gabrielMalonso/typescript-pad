package com.gabrielalonso.typescriptpad;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/** Export through Android's document picker without broad filesystem permissions. */
@CapacitorPlugin(name = "PadFiles")
public class PadFilesPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name");
        String type = call.getString("mimeType");
        if (name == null || call.getString("base64") == null
            || !("application/zip".equals(type) || "text/plain".equals(type))) {
            call.reject("Arquivo inválido.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(type);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try { startActivityForResult(call, intent, "documentCreated"); }
        catch (Exception error) { call.reject("Não foi possível abrir o seletor de arquivos."); }
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK) {
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            call.reject("Nenhum destino disponível.");
            return;
        }
        // The document provider may be slow; never block the UI thread while writing.
        getBridge().execute(() -> {
            try {
                try (OutputStream output = getContext().getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (output == null) throw new IllegalStateException("Destino indisponível");
                    output.write(Base64.decode(call.getString("base64", ""), Base64.NO_WRAP));
                }
                response.put("cancelled", false);
                call.resolve(response);
            } catch (Exception error) { call.reject("Não foi possível exportar o arquivo."); }
        });
    }
}
