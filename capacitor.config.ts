import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.platehunter.ksa',
  appName: 'قناص اللوحات',
  webDir: 'out',
  server: {
    url: 'https://platehunter-ksa.vercel.app',
    cleartext: false,
  },
  plugins: {
    // 🔔 الإشعار يظهر في شريط الإشعارات حتى والتطبيق مفتوح (المالك ١٣ أكتوبر ٢٠٢٦: «علشان ينتبه») — من نسخة 1.6.
    //    إعداد جوّه التطبيق نفسه ⇒ محتاج بناء جديد. `lib/foregroundPush.ts`
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
