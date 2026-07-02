/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phase 2 will add a service worker (next-pwa or custom) for full
  // offline-first behaviour (IndexedDB queue + background sync).
  experimental: {
    // Vercel's file tracer doesn't follow ffmpeg-static's dynamic binary
    // resolution — without this, the bundled ffmpeg binary is missing at
    // runtime (ENOENT) even though it installs fine locally.
    outputFileTracingIncludes: {
      "/api/transcribe": ["./node_modules/ffmpeg-static/**/*"],
    },
  },
};

export default nextConfig;
