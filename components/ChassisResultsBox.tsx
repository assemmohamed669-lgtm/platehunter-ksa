"use client";

/**
 * 🔩 «مطلوب من أرقام الشاص» — فرز شيت الشاص **برقم الشاص** على عمود الشاص في الإحالة (`matchChassisRecordsAgainstReferrals`).
 * نفس جدول صفحة الفرز بالحرف — اتنقل هنا عشان «صوت فقط» كمان: المالك (٢١ أكتوبر ٢٠٢٦) «يفرز علي كل السجلات صوتي ويدوي
 * وشاص والشاص يفرز برقم الشاص والصوتي واليدوي يفرز برقم اللوحه».
 */
import { ScanLine, Navigation } from "lucide-react";
import type { ChassisSortMatch } from "@/lib/chassisRecords";

/** أول عمود في صف الإحالة اسمه فيه كلمة من دول وفيه قيمة. */
function pickReferralCol(row: Record<string, string>, keywords: string[]): string {
  for (const k of Object.keys(row)) {
    const low = k.toLowerCase();
    if (keywords.some((kw) => low.includes(kw)) && String(row[k] ?? "").trim()) return String(row[k]).trim();
  }
  return "";
}

function fmtChassisDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export default function ChassisResultsBox({ matches }: { matches: ChassisSortMatch[] }) {
  if (!matches.length) return null;
  return (
    <div className="rounded-2xl border border-danger/30 bg-surface p-3" dir="rtl">
      <div className="mb-2 flex items-center gap-2">
        <ScanLine size={18} className="shrink-0 text-danger" />
        <h2 className="text-sm font-bold text-ink">مطلوب من أرقام الشاص</h2>
        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">{matches.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" dir="rtl">
          <thead>
            <tr className="text-muted">
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">رقم الشاص</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">رقم اللوحة</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">نوع السيارة</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">التاريخ</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-center font-bold">الموقع</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => {
              const plate = pickReferralCol(m.referralRow, ["لوحة", "plate"]);
              const vtype = pickReferralCol(m.referralRow, ["نوع السيارة", "نوع المركبة", "vehicle name", "vehicle type", "طراز", "صانع", "موديل", "make", "model"]) || m.record.vehicleType || "";
              const link = m.record.mapsLink || (m.record.lat != null && m.record.lng != null ? `https://www.google.com/maps?q=${m.record.lat},${m.record.lng}` : "");
              return (
                <tr key={m.record.id || i} data-plate={plate} className="border-t border-border bg-danger/5">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono font-bold text-ink" dir="ltr">{m.record.chassis}{m.matchType !== "exact" ? " ⚠️" : ""}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-bold text-ink">{plate || "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink">{vtype || "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted">{fmtChassisDate(m.record.checkedAt)}</td>
                  <td className="px-2 py-1.5 text-center">
                    {link ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex text-primary" aria-label="الموقع"><Navigation size={15} /></a>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">اللوحة والنوع من ملف الإحالة، والموقع والتاريخ من سجل الشاص المحفوظ. (⚠️ = تطابق تقريبي)</p>
    </div>
  );
}
