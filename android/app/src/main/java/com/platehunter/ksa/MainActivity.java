package com.platehunter.ksa;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";

    // Held until the web app is ready to receive the event.
    private String pendingFileName  = null;
    private String pendingCacheFile = null; // اسم الملف داخل كاش التطبيق (Directory.Cache)
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

        InputStream is = null;
        FileOutputStream fos = null;
        try {
            is = getContentResolver().openInputStream(uri);
            if (is == null) return;

            // نكتب الملف في كاش التطبيق ونبعت مساره — بدل ما نحقن الـbase64 كله في
            // سطر JavaScript (evaluateJavascript ليه حد حجم؛ الملفات الكبيرة كانت
            // بتتقصّ فتوصل ناقصة وتفشل القراءة). التطبيق بيقرا الكاش عبر Capacitor
            // Filesystem (قناة بتتحمّل أي حجم).
            String cacheName = "incoming_" + System.currentTimeMillis() + ".xlsx";
            File out = new File(getCacheDir(), cacheName);
            fos = new FileOutputStream(out);
            byte[] buf = new byte[8192];
            int len;
            while ((len = is.read(buf)) != -1) fos.write(buf, 0, len);
            fos.flush();

            pendingCacheFile = cacheName;
            pendingFileName  = resolveFileName(uri);

            dispatchPendingFile();

        } catch (Exception e) {
            Log.e(TAG, "Failed to read incoming Excel file", e);
        } finally {
            try { if (is != null) is.close(); } catch (Exception ignored) {}
            try { if (fos != null) fos.close(); } catch (Exception ignored) {}
        }
    }

    private void dispatchPendingFile() {
        if (pendingFileName == null || pendingCacheFile == null) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;

        // Give the web app time to boot on a fresh start; otherwise dispatch quickly
        long delayMs = isFreshStart ? 2500 : 200;
        isFreshStart = false;

        String name  = pendingFileName.replace("\\", "\\\\").replace("'", "\\'");
        String cache = pendingCacheFile.replace("\\", "\\\\").replace("'", "\\'");
        pendingFileName  = null;
        pendingCacheFile = null;

        // السطر بقى صغير (اسم + مسار كاش) — مفيش تقصّ مهما كان حجم الملف.
        getBridge().getWebView().postDelayed(() ->
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('excelFileOpened'," +
                "{detail:{name:'" + name + "',cacheFile:'" + cache + "'}}));",
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
