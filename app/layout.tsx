import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/lib/ThemeProvider";
import BackButtonHandler from "@/components/BackButtonHandler";
import IncomingExcelHandler from "@/components/IncomingExcelHandler";
import PlatformClass from "@/components/PlatformClass";
import "./globals.css";

export const metadata: Metadata = {
  title: "قناص اللوحات | PlateHunter KSA",
  description: "تطبيق ميداني لفرق استرداد المركبات في السعودية",
  manifest: "/manifest.json",
  // فتح ملء الشاشة على iOS عند «إضافة إلى الشاشة الرئيسية» (زي تطبيق فعلي).
  appleWebApp: {
    capable: true,
    title: "قناص اللوحات",
    statusBarStyle: "black-translucent",
  },
  icons: [
    { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
  ],
};

export const viewport: Viewport = {
  themeColor: "#0D1117",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // في الإعداد الأساسي (SSR) عشان env(safe-area) تشتغل موثوق من أول رسمة على iOS.
  // (حطّه بجافاسكريبت بعد التحميل مكانش موثوق.) الأعلى والأسفل بياخدوا مسافتهم
  // من env على النظامين — على الأندرويد cover بيرسم تحت الأشرطة فمحتاج نفس المسافة.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <PlatformClass />
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
