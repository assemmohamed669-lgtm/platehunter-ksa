package com.platehunter.ksa;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";

    // Held until the web app is ready to receive the event
    private String pendingFileName  = null;
    private String pendingFileB64   = null;
    private boolean isFreshStart    = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        isFreshStart = true;

        // Enable geolocation in WebView
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setGeolocationEnabled(true);

        processIntent(getIntent());
    }

    /** Called when app is already running and another intent arrives */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        isFreshStart = false;
        processIntent(intent);
    }

    private void processIntent(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null) return;

        try {
            InputStream is = getContentResolver().openInputStream(uri);
            if (is == null) return;

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int len;
            while ((len = is.read(buf)) != -1) bos.write(buf, 0, len);
            is.close();

            pendingFileB64   = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
            pendingFileName  = resolveFileName(uri);

            dispatchPendingFile();

        } catch (Exception e) {
            Log.e(TAG, "Failed to read incoming Excel file", e);
        }
    }

    private void dispatchPendingFile() {
        if (pendingFileName == null || pendingFileB64 == null) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;

        // Give the web app time to boot on a fresh start; otherwise dispatch quickly
        long delayMs = isFreshStart ? 2500 : 200;
        isFreshStart = false;

        String name   = pendingFileName.replace("\\", "\\\\").replace("'", "\\'");
        String b64    = pendingFileB64;
        pendingFileName = null;
        pendingFileB64  = null;

        getBridge().getWebView().postDelayed(() ->
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('excelFileOpened'," +
                "{detail:{name:'" + name + "',base64:'" + b64 + "'}}));",
                null
            ),
            delayMs
        );
    }

    /** Try content-resolver display name first, fall back to last path segment */
    private String resolveFileName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(uri, null, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int col = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (col >= 0) {
                    String name = cursor.getString(col);
                    if (name != null && !name.isEmpty()) return name;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        String seg = uri.getLastPathSegment();
        return (seg != null && !seg.isEmpty()) ? seg : "file.xlsx";
    }
}
