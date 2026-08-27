/** @type {import('next').NextConfig} */

// رؤوس أمان على كل المسارات. مقصود إن القايمة دي **محافظة**:
//  • مافيش Content-Security-Policy — التطبيق بيتصل بـSupabase (WebSocket) و
//    Groq و Deepgram و OpenRouteService، وبيستخدم blob:/data: للصوت والصور.
//    سياسة غلط = تطبيق مكسور على كل المناديب. تتضاف لاحقاً بـReport-Only أول
//    وتتراقب قبل ما تتفرض.
//  • مافيش Permissions-Policy — التطبيق محتاج camera و microphone و geolocation
//    فعلاً؛ صياغة غلط بتقفلهم. تتضاف بعد تجربة على جهاز حقيقي.
const securityHeaders = [
  // نمنع تحميل التطبيق جوّه iframe (clickjacking). Capacitor بيحمّله كصفحة
  // رئيسية في الـWebView مش داخل iframe، فمش متأثر.
  { key: "X-Frame-Options", value: "DENY" },
  // نمنع المتصفح من تخمين نوع المحتوى (تنفيذ ملف مرفوع كأنه سكربت).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // مانسرّبش الرابط الكامل (وفيه معرّفات) لأي موقع خارجي.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS إلزامي. بلا preload — دي التزام دائم مش هنعمله بلا قرار.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  reactStrictMode: true,
  // معرّف بناء يتغيّر مع **كل نشر** (SHA الكوميت على Vercel، وإلا وقت البناء محلياً).
  // بيتضمّن في جافاسكريبت العميل وفي /api/version — فلو الجهاز شغّال بندل قديم،
  // معرّفه هيختلف عن اللي على السيرفر → التطبيق يحدّث نفسه تلقائياً.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || `dev-${Date.now()}`,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Phase 2 will add a service worker (next-pwa or custom) for full
  // offline-first behaviour (IndexedDB queue + background sync).
  experimental: {
    // Vercel's file tracer doesn't follow ffmpeg-static's dynamic binary
    // resolution — without this, the bundled ffmpeg binary is missing at
    // runtime (ENOENT) even though it installs fine locally.
    outputFileTracingIncludes: {
      "/api/transcribe": ["./node_modules/ffmpeg-static/**/*"],
    },
    // ffmpeg-static resolves its binary via __dirname — when webpack inlines
    // the package into the route bundle, __dirname becomes the bundle's own
    // directory (/var/task/.next/server/app/api/transcribe) and the computed
    // path points at a binary that isn't there. Keeping it external makes
    // Node require it from node_modules at runtime, where __dirname is real.
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
  webpack: (config, { isServer, webpack }) => {
    // فكّ تشفير الإكسل المحمي بباسورد بيتنقل للمتصفّح (officecrypto-tool) عشان يفتح
    // فوري بدل رحلة السيرفر. المكتبة نقية JS (crypto-js) بس بتلمس بلت-إنز من Node
    // عبر cfb/xml2js/sax — نوفّرها كـ polyfills للـ client فقط. المكتبة بتتحمّل
    // بـ dynamic import فالـ polyfills دي بتتقسّم في chunk منفصل (مش بتكبّر البندل).
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: "buffer",
        stream: "stream-browserify",
        timers: "timers-browserify",
        string_decoder: "string_decoder",
        events: "events",
        fs: false,
        crypto: false,
        path: false,
      };
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: "process/browser",
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
