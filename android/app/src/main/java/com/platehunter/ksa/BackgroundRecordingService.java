package com.platehunter.ksa;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * 🎙️ «قناص بيسجّل» — التسجيل والتشييك يفضلوا شغّالين والمندوب برّه البرنامج (٢٤ أكتوبر ٢٠٢٦).
 *
 * المالك: «عايز المندوب لما يحب يشوف الواتس اب او يتصفح التليفون والتسجيل شغال او التشييك يفضل شغال … او عايز
 * يفتح موقع جي بي اس علي الخريطه». أندرويد (من ٩) بيقطع الميك عن أي برنامج في الخلفية — إلا لو عنده **خدمة في المقدمة**
 * بإشعار ظاهر. الخدمة دي هي ده: نوعها «ميك + موقع» (أندرويد ١٤+ بيطلب النوع)، وبتبدأ **والبرنامج قدام** (لما المندوب
 * يدوس تسجيل) — شرط أندرويد. الصفحة نفسها (الصوت والموقع) هي اللي بتشتغل؛ الخدمة بتسيبها تكمّل بس.
 *
 * 📞 **المكالمة ليها الأولوية** (قرار المالك ٢٣ سبتمبر): لو جت مكالمة (تليفون أو واتساب) بنقول للصفحة تقفل الميك.
 * من غير أي صلاحية زيادة: وضع الصوت (`AudioManager.getMode`) — الرنّة/المكالمة/الاتصال (لو اتغيّر عن وضعنا إحنا).
 */
public class BackgroundRecordingService extends Service {

    private static final String TAG = "PHBgRecording";
    public static final String CHANNEL_ID = "ph_recording";
    private static final int NOTIF_ID = 4711;
    static final String EXTRA_TEXT = "text";
    /** أول ٣ ثواني بنتعلّم وضع الصوت بتاعنا (الويب-ڤيو ممكن يحطه «اتصال» وهو بيسجّل) */
    private static final long BASELINE_MS = 3000;
    /** أقصى مدة للقفل على المعالج — أمان لو الصفحة نسيت تقفل الخدمة */
    private static final long WAKE_MAX_MS = 6L * 60 * 60 * 1000;

    static volatile boolean running = false;

    /** الصفحة بتسمع هنا: مكالمة بدأت ⇒ تقفل الميك */
    interface CallListener { void onCallStarted(); }
    static volatile CallListener callListener;

    private PowerManager.WakeLock wake;
    private Handler handler;
    private AudioManager audio;
    private long startedAt;
    private int baselineMode = AudioManager.MODE_NORMAL;
    private boolean callSent = false;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            checkCall();
            if (running && handler != null) handler.postDelayed(this, 1000);
        }
    };

    /** الصفحة بتنده دي لما التسجيل يبدأ. `false` = ماينفعش (مافيش إذن ميك ولا موقع). */
    static boolean start(Context ctx, String text) {
        if (!granted(ctx, Manifest.permission.RECORD_AUDIO) && !hasLocation(ctx)) return false;
        Intent i = new Intent(ctx, BackgroundRecordingService.class);
        i.putExtra(EXTRA_TEXT, text);
        try {
            ContextCompat.startForegroundService(ctx, i);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "start failed", e);
            return false;
        }
    }

    static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, BackgroundRecordingService.class));
        } catch (Exception e) {
            Log.e(TAG, "stop failed", e);
        }
    }

    private static boolean granted(Context ctx, String perm) {
        return ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean hasLocation(Context ctx) {
        return granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
            || granted(ctx, Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;
        if (text == null || text.isEmpty()) {
            text = "التسجيل شغّال — قول اللوحات عادي حتى وانت في واتساب أو الخريطة";
        }
        Notification n = buildNotification(text);
        int types = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (granted(this, Manifest.permission.RECORD_AUDIO)) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            if (hasLocation(this)) types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIF_ID, n, types);
            else startForeground(NOTIF_ID, n);
        } catch (Exception e) {
            // أندرويد رفض (البرنامج مش قدام / الإذن اتسحب) ⇒ مانكمّلش — الصفحة بتشتغل زي الأول
            Log.e(TAG, "startForeground refused", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            startedAt = System.currentTimeMillis();
            callSent = false;
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "platehunter:recording");
                wake.acquire(WAKE_MAX_MS);
            } catch (Exception e) {
                Log.e(TAG, "wake lock failed", e);
            }
            audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            baselineMode = audio != null ? audio.getMode() : AudioManager.MODE_NORMAL;
            handler = new Handler(Looper.getMainLooper());
            handler.postDelayed(poll, 1000);
        }
        return START_NOT_STICKY;
    }

    /** 📞 مكالمة بدأت؟ الرنّة/المكالمة دايماً · «اتصال» (واتساب وأخواته) لو مش هو وضعنا إحنا من الأول */
    private void checkCall() {
        if (audio == null || callSent) return;
        int m = audio.getMode();
        if (System.currentTimeMillis() - startedAt < BASELINE_MS) {
            baselineMode = m;
            return;
        }
        boolean call = m == AudioManager.MODE_RINGTONE
            || m == AudioManager.MODE_IN_CALL
            || (m == AudioManager.MODE_IN_COMMUNICATION && baselineMode != AudioManager.MODE_IN_COMMUNICATION);
        if (call) {
            callSent = true;
            CallListener l = callListener;
            if (l != null) l.onCallStarted();
        }
    }

    private Notification buildNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "التسجيل شغّال", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("بيظهر وقناص بيسجّل وانت برّه البرنامج");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("🎙️ قناص بيسجّل")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pi)
            .build();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (handler != null) handler.removeCallbacks(poll);
        handler = null;
        try {
            if (wake != null && wake.isHeld()) wake.release();
        } catch (Exception ignored) {
        }
        wake = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
