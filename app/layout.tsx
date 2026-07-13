import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/lib/ThemeProvider";
import BackButtonHandler from "@/components/BackButtonHandler";
import IncomingExcelHandler from "@/components/IncomingExcelHandler";
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
  themeColor: "#0D1117",
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
        <BackButtonHandler />
        {/* Mounted here (not deep in the authenticated layout) so its listener
            is registered as early as possible — a cold app-open from tapping
            an Excel file in WhatsApp only gives native code a couple seconds
            before it fires the file-ready event, and this app boots its JS
            from a remote URL, so every bit of head start avoids losing it. */}
        <IncomingExcelHandler />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
