import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/lib/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "قناص اللوحات | PlateHunter KSA",
  description: "تطبيق ميداني لفرق استرداد المركبات في السعودية",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", url: "/icon-192.png" },
  ],
};

export const viewport: Viewport = {
  themeColor: "#0B3D2E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
