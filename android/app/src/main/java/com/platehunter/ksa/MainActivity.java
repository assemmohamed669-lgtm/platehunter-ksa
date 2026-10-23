package com.platehunter.ksa;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
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

        // جسر مسح الكاش — زر «تحديث البرنامج» في التطبيق بينده عليه.
        //
        // ليه أصلي: الجافاسكريبت مايقدرش يمسح كاش الويب-ڤيو (حماية المتصفح)،
        // فالمندوب كان لازم يدخل إعدادات التليفون ويمسحه بإيده لما تعلق نسخة
        // قديمة. دلوقتي الزر بيعمل الاتنين.
        //
        // الأمان: الويب-ڤيو بيحمّل نطاقنا بس (server.url في capacitor.config)،
        // والدالة المعروضة واحدة بلا أي وصول لبيانات — بتمسح وتعيد التحميل.
        getBridge().getWebView().addJavascriptInterface(new CacheBridge(), "PlateHunterNative");

        // 🎙️ التسجيل في الخلفية (٢٤ أكتوبر ٢٠٢٦): الصفحة بتنده `window.PlateHunterBg.start(نص)` لما المندوب يدوس تسجيل
        // و`stop()` لما يقف. النسخ القديمة من التطبيق مافيهاش الجسر ده ⇒ الصفحة بتشتغل زي الأول بالظبط.
        getBridge().getWebView().addJavascriptInterface(new BgBridge(), "PlateHunterBg");
        // 📞 مكالمة بدأت والتسجيل شغّال ⇒ الصفحة تقفل الميك (المكالمة ليها الأولوية — قرار المالك)
        BackgroundRecordingService.callListener = () -> runOnUiThread(() -> {
            try {
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('phNativeCall'));", null);
            } catch (Exception e) {
                Log.e(TAG, "call event failed", e);
            }
        });

        processIntent(getIntent());
    }

    /**
     * الجسر اللي الصفحة بتناديه: `window.PlateHunterNative.clearCacheAndReload(url)`.
     *
     * المسح **وإعادة التحميل** الاتنين هنا عن قصد: `clearCache` لازم تشتغل على
     * خيط الواجهة (غير متزامن)، فلو سبنا الجافاسكريبت يعيد التحميل ممكن يسبق
     * المسح ونرجع نجيب نفس الملفات القديمة. الترتيب هنا مضمون.
     */
    public class CacheBridge {
        @JavascriptInterface
        public void clearCacheAndReload(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        WebView wv = getBridge().getWebView();
                        wv.clearCache(true);   // true = يمسح الملفات من القرص كمان
                        wv.loadUrl(url);
                    } catch (Exception e) {
                        Log.e(TAG, "clearCacheAndReload failed", e);
                    }
                }
            });
        }
    }

    /** جسر «التسجيل في الخلفية» — `window.PlateHunterBg` */
    public class BgBridge {
        @JavascriptInterface
        public boolean start(String text) {
            return BackgroundRecordingService.start(MainActivity.this, text);
        }

        @JavascriptInterface
        public void stop() {
            BackgroundRecordingService.stop(MainActivity.this);
        }

        @JavascriptInterface
        public boolean active() {
            return BackgroundRecordingService.running;
        }
    }

    private final Handler ui = new Handler(Looper.getMainLooper());

    /**
     * 🎙️ البرنامج راح الخلفية (واتساب / الخريطة / أي برنامج) والتسجيل شغّال ⇒ الصفحة **تفضل شغّالة**: الويب-ڤيو
     * بيعتبر الصفحة مستخبية فيبطّأ مؤقّتاتها (نوافذ الصوت كل ١.٥ث كانت هتقف). بنقوله إنها ظاهرة (نفس حيلة إضافات
     * «الخلفية» المعروفة) — بس طول ما خدمة التسجيل شغّالة.
     */
    private void keepWebViewRunning() {
        if (!BackgroundRecordingService.running) return;
        ui.postDelayed(() -> {
            if (!BackgroundRecordingService.running || getBridge() == null) return;
            try {
                WebView wv = getBridge().getWebView();
                wv.onResume();
                wv.resumeTimers();
                wv.dispatchWindowVisibilityChanged(View.VISIBLE);
            } catch (Exception e) {
                Log.e(TAG, "keepWebViewRunning failed", e);
            }
        }, 400);
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewRunning();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewRunning();
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
