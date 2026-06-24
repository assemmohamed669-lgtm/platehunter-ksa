package com.platehunter.ksa;

import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        // Enable geolocation in WebView — don't override WebChromeClient
        // so Capacitor's default file chooser handling stays intact
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setGeolocationEnabled(true);
    }
}
