import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.platehunter.ksa',
  appName: 'قناص اللوحات',
  webDir: 'out',
  server: {
    url: 'https://platehunter-ksa.vercel.app',
    cleartext: false,
  },
};

export default config;
