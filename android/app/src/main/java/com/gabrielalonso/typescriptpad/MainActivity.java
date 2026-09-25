package com.gabrielalonso.typescriptpad;

import android.os.Bundle;
import android.view.ViewTreeObserver;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private Boolean keyboardVisible;
    private final ViewTreeObserver.OnGlobalLayoutListener keyboardListener =
        () -> publishKeyboardState(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.getWebView().getViewTreeObserver().addOnGlobalLayoutListener(keyboardListener);
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                publishKeyboardState(true);
            }
        });
    }

    private void publishKeyboardState(boolean force) {
        WebView webView = bridge.getWebView();
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(webView);
        if (insets == null) return;
        boolean visible = insets.isVisible(WindowInsetsCompat.Type.ime());
        if (!force && keyboardVisible != null && keyboardVisible == visible) return;
        keyboardVisible = visible;
        webView.evaluateJavascript(
            "window.typescriptPadKeyboardVisible=" + visible + ";" +
            "window.dispatchEvent(new CustomEvent('typescript-pad-keyboard',{detail:" + visible + "}));",
            null
        );
    }

    @Override
    public void onDestroy() {
        bridge.getWebView().getViewTreeObserver().removeOnGlobalLayoutListener(keyboardListener);
        super.onDestroy();
    }
}
