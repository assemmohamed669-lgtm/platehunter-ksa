/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phase 2 will add a service worker (next-pwa or custom) for full
  // offline-first behaviour (IndexedDB queue + background sync).
};

export default nextConfig;
