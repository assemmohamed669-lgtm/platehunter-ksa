"use client";

/**
 * ✏️ جدول تعديل ملف الداتا — زي الإكسيل: كل خانة بتتكتب فيها، صف اللوحة اللي اتدوّر عليها متعلّم بالأصفر، والصف
 * المتعلّم للمسح بيبان أحمر متشطّب لحد الحفظ (وفيه «تراجع»). الحالة كلها عند الصفحة (`app/(app)/data-edit`).
 */
import { MapPin, Undo2, ExternalLink, Loader2 } from "lucide-react";
import { isGpsHeader, type EditRow } from "@/lib/dataEdit";
import { gpsCellToLink } from "@/lib/gps";

export interface DataEditTableProps {
  headers: string[];
  rows: EditRow[];
  edits: Record<string, Record<string, string>>;
  deletes: Set<string>;
  picked: Set<string>;
  onCell: (r: EditRow, header: string, value: string) => void;
  onPick: (loc: string) => void;
  onUndoDelete: (loc: string) => void;
  onMyLocation: (r: EditRow, header: string) => void;
  /** `${loc}|${header}` اللي بيجيب موقعه دلوقتي. */
  locating: string | null;
}

export default function DataEditTable(p: DataEditTableProps) {
  const multiSheet = p.rows.some((r) => r.sheet);
  return (
    <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "62vh", touchAction: "pan-x pan-y" }}>
      <table className="w-full border-collapse text-xs" dir="rtl">
        <thead className="sticky top-0 z-10">
          <tr className="bg-surface-2 text-muted">
            <th className="border-b border-l border-border px-2 py-2 text-center font-bold">☐</th>
            <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">صف</th>
            {p.headers.map((h) => (
              <th key={h} className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => {
            const deleted = p.deletes.has(r.loc);
            const bg = deleted ? "bg-danger/10" : r.match ? "bg-alert/20" : "bg-surface";
            return (
              <tr key={r.loc} data-match={r.match ? "1" : "0"} data-deleted={deleted ? "1" : "0"} className={`border-b border-border ${bg}`}>
                <td className="border-l border-border px-2 py-1.5 text-center">
                  <input type="checkbox" checked={p.picked.has(r.loc)} disabled={deleted}
                    onChange={() => p.onPick(r.loc)} className="h-4 w-4 accent-primary" />
                </td>
                <td className="border-l border-border px-2 py-1.5 text-center whitespace-nowrap">
                  <span className={`font-bold ${r.match ? "text-alert" : "text-muted"}`}>{r.rowNo}</span>
                  {multiSheet && r.sheet && <div className="text-[9px] text-muted">{r.sheet}</div>}
                  {deleted && (
                    <button onClick={() => p.onUndoDelete(r.loc)}
                      className="mt-1 flex items-center gap-0.5 rounded border border-border px-1 py-0.5 text-[10px] font-bold text-ink">
                      <Undo2 size={10} /> تراجع
                    </button>
                  )}
                </td>
                {p.headers.map((h) => {
                  const value = p.edits[r.loc]?.[h] ?? r.row[h] ?? "";
                  const changed = p.edits[r.loc]?.[h] !== undefined;
                  const gps = isGpsHeader(h);
                  const link = gps ? gpsCellToLink(value) : "";
                  const busy = p.locating === `${r.loc}|${h}`;
                  return (
                    <td key={h} className="border-l border-border px-1 py-1 align-top">
                      <input
                        value={value}
                        disabled={deleted}
                        dir="auto"
                        onChange={(e) => p.onCell(r, h, e.target.value)}
                        className={`w-full min-w-[110px] rounded-md border px-1.5 py-1 text-xs text-ink outline-none focus:border-primary ${
                          deleted ? "border-transparent bg-transparent line-through opacity-60"
                            : changed ? "border-primary/60 bg-primary/10" : "border-border bg-surface-2/60"}`}
                      />
                      {gps && !deleted && (
                        <div className="mt-1 flex items-center gap-1">
                          <button type="button" onClick={() => p.onMyLocation(r, h)} disabled={!!p.locating}
                            className="flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary disabled:opacity-50">
                            {busy ? <Loader2 size={10} className="animate-spin" /> : <MapPin size={10} />}📍 موقعي
                          </button>
                          {link && (
                            <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary" title="افتح على الخريطة">
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
