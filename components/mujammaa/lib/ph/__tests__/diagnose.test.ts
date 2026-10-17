import { describe, it } from "vitest";
import { scanTypeAndNote, digitStreamOf } from "../vehicleTypeScan";
import raw from "./rawtext.json";
import rows from "./sheet_rows.json";

const W = raw as { t0: number; t1: number; text: string }[];
type Row = [string, string, string];

describe("سقف النوع لو النافذة كانت ٢٠ث", () => {
  it("كل صف × أحسن نافذة", () => {
    const res = { hit: [] as any[], nodigits: [] as any[], heardDropped: [] as any[], wrong: [] as any[] };
    for (const [plate, want, cat] of rows as Row[]) {
      const digits = plate.slice(-4);
      const wins = W.filter((w) => digitStreamOf(w.text).includes(digits));
      if (!wins.length) { res.nodigits.push([plate, want, cat]); continue; }
      let got = "";
      for (const w of wins) {
        const r = scanTypeAndNote(w.text, { afterPlate: plate });
        const g = [r.type, r.note].filter(Boolean).join(" · ");
        if (g === want) { got = g; break; }
        if (g && !got) got = g;
      }
      if (got === want) res.hit.push([plate, want, cat]);
      else if (!got) res.heardDropped.push([plate, want, cat]);
      else res.wrong.push([plate, want, cat, got]);
    }
    const n = (rows as Row[]).length;
    console.log(`\n✅ صح: ${res.hit.length}/${n}`);
    console.log(`🔴 أرقام اللوحة مش في أي نافذة (الموديل مسخ الرقم): ${res.nodigits.length}`);
    res.nodigits.forEach(([p, w, c]) => console.log(`     [${c}] ${p} «${w}»`));
    console.log(`🟡 الأرقام موجودة والماسح رجّع فاضي: ${res.heardDropped.length}`);
    res.heardDropped.forEach(([p, w, c]) => console.log(`     [${c}] ${p} «${w}»`));
    console.log(`⚠️ طلّع كلمة غلط: ${res.wrong.length}`);
    res.wrong.forEach(([p, w, c, g]) => console.log(`     [${c}] ${p} «${w}» ← طلّع «${g}»`));
  });
});
