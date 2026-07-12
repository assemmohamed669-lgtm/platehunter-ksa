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
    // ffmpeg-static resolves its binary via __dirname — when webpack inlines
    // the package into the route bundle, __dirname becomes the bundle's own
    // directory (/var/task/.next/server/app/api/transcribe) and the computed
    // path points at a binary that isn't there. Keeping it external makes
    // Node require it from node_modules at runtime, where __dirname is real.
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
};

export default nextConfig;
