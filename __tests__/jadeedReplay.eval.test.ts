import { describe, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { LiveConsensus, drainClockMs } from "@/lib/liveConsensus";
import { FleetMemory } from "@/lib/fleetPairs";
import { placeLiveRow, type PlaceableRow } from "@/lib/placeLiveRow";
import { showProvisional, PROVISIONAL_TTL_MS } from "@/lib/provisionalRow";
import { sweepKeeps } from "@/lib/wantedFastPath";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔬 إعادة تشغيل تسجيلات حقيقية على خط «الجديد» بالحرف — قبل/بعد
 * ══════════════════════════════════════════════════════════════════════
 *  القرايات الخام المحفوظة (نافذة ٥ث · خطوة ١.٥ث) بتتغذّى بترتيب وصولها على
 *  **نفس الدوال اللي الصفحة والمحرّك بيشغّلوها**: الصف المبدئي (`showProvisional`)
 *  · الإجماع (`LiveConsensus` بإعدادات المحرّك) · وضع الصف (`placeLiveRow`) ·
 *  كنس المبدئي بعد ١٢ث (`sweepKeeps`). والنتيجة = الجدول اللي المندوب شافه.
 *
 *    JADEED_BENCH="D:/ml-archive/STREET-base7500f32.json;D:/…/OWNER.json" \
 *      npx vitest run __tests__/jadeedReplay.eval.test.ts
 *
 *  ⚠️ من غير الملفات بيتخطّى (مابيفشلش) — دي أداة قياس مش اختبار.
 */
type Read = { plate: string; tMs: number; conf: number; recvMs: number; accepted?: boolean; blocked?: boolean };
type Rec = { agent: string; rec: string; truth: string[]; reads: Read[] };
type Row = PlaceableRow;

const PLATE = /[ء-ي]{3}\d{4}/g;
const WELL = /^[ء-ي]{3}\d{4}$/;
const nrm = (s: string) => s.replace(/\s+/g, "").replace(/[أإآ]/g, "ا");

export function replay(rec: Rec, fleetOn: boolean): string[] {
  const fleet = new FleetMemory();
  const distinct = fleetOn ? (a: string, b: string) => fleet.distinct(a, b) : undefined;
  const lc = new LiveConsensus({ windowMs: 2000, stableMs: 2500, greenMinMult: 2, distinct });
  let rows: Row[] = [];
  let n = 0;
  const mk = (plate: string, atMs: number, now: number, o: Partial<Row>): Row => ({
    id: "r" + (++n), plate, atMs, provisional: false, mult: 1, conf: 0, match: null,
    type: null, note: null, shownAt: now, latencyMs: 0, ...o,
  });
  const q = rec.reads.slice().sort((a, b) => a.recvMs - b.recvMs);
  const end = (q.length ? q[q.length - 1].recvMs : 0) + 3000;
  let i = 0;
  for (let now = 0; now <= end; now += 500) {
    while (i < q.length && q[i].recvMs <= now) {
      const r = q[i++];
      const accepted = r.accepted ?? true;
      const blocked = r.blocked ?? false;
      if (!accepted) continue;
      const plates = (nrm(r.plate).match(PLATE) ?? []).filter((p) => WELL.test(p));
      // الصفحة (onRead): الدليل الأول، وبعدين الصف المبدئي
      if (fleetOn) fleet.note(plates);
      if (showProvisional({ accepted, blocked, conf: r.conf })) {
        for (const p of plates) rows = placeLiveRow(rows, mk(p, r.tMs, now, { provisional: true, conf: r.conf }), distinct);
      }
      // المحرّك: نفس الدليل (نفس النافذة) وبعدين الإجماع
      for (const p of plates) lc.add({ plate: p, tMs: r.tMs, conf: r.conf, minLp: r.blocked === undefined ? undefined : blocked ? -1 : 0 });
    }
    if (now % 2000 === 0) {
      const cut = now - PROVISIONAL_TTL_MS;
      rows = rows.filter((r) => sweepKeeps(r, cut, 0));
    }
    for (const c of lc.drain(drainClockMs(now, 5))) {
      rows = placeLiveRow(rows, mk(c.plate, c.tMs, now, { tier: c.tier, mult: c.mult, conf: c.conf } as Partial<Row>), distinct);
    }
  }
  for (const c of lc.flush()) {
    rows = placeLiveRow(rows, mk(c.plate, c.tMs, end, { mult: c.mult, conf: c.conf }), distinct);
  }
  return rows.map((r) => r.plate);
}

function score(truth: string[], shown: string[]) {
  const T = new Set(truth.map(nrm).filter((t) => WELL.test(t)));
  const seen = new Map<string, number>();
  for (const p of shown) seen.set(p, (seen.get(p) ?? 0) + 1);
  let hit = 0, extra = 0, dup = 0;
  for (const t of T) if (seen.has(t)) hit++;
  for (const [p, k] of seen) {
    if (!T.has(p)) extra += k;
    else if (k > 1) dup += k - 1;
  }
  return { total: T.size, hit, extra, dup, lost: [...T].filter((t) => !seen.has(t)) };
}

describe("🔬 خط «الجديد» على تسجيلات حقيقية", () => {
  it("الأسطول: قبل/بعد", () => {
    const files = (process.env.JADEED_BENCH ?? "").split(";").filter((f) => f && existsSync(f));
    if (!files.length) {
      // eslint-disable-next-line no-console
      console.log("JADEED_BENCH مش موجود — اتخطّى");
      return;
    }
    for (const f of files) {
      const recs = JSON.parse(readFileSync(f, "utf8")) as Rec[];
      const A = { total: 0, hit: 0, extra: 0, dup: 0 }, B = { ...A };
      const diffs: string[] = [];
      let recBetter = 0, recWorse = 0;
      for (const rec of recs) {
        const a = score(rec.truth, replay(rec, false));
        const b = score(rec.truth, replay(rec, true));
        for (const k of ["total", "hit", "extra", "dup"] as const) { A[k] += a[k]; B[k] += b[k]; }
        const d = (b.hit - a.hit) !== 0 ? b.hit - a.hit : (a.extra + a.dup) - (b.extra + b.dup);
        if (d > 0) recBetter++;
        if (d < 0) recWorse++;
        if (a.hit !== b.hit || a.extra !== b.extra || a.dup !== b.dup) {
          const gained = a.lost.filter((t) => !b.lost.includes(t));
          const lostNow = b.lost.filter((t) => !a.lost.includes(t));
          diffs.push(`  ${rec.agent} · ${rec.rec}: صح ${a.hit}⇐${b.hit} · زيادة ${a.extra}⇐${b.extra} · مكرر ${a.dup}⇐${b.dup}` +
            (gained.length ? ` · رجعت ${gained.join(" ")}` : "") + (lostNow.length ? ` · 🔴 ضاعت ${lostNow.join(" ")}` : ""));
        }
      }
      // eslint-disable-next-line no-console
      console.log(
        `\n╔═══ ${f.split(/[\/]/).pop()} · ${recs.length} تسجيل · ${A.total} لوحة ═══\n` +
        `║ قبل : صح ${A.hit} · زيادة ${A.extra} · مكرر ${A.dup}\n` +
        `║ بعد : صح ${B.hit} · زيادة ${B.extra} · مكرر ${B.dup}\n` +
        `║ تسجيلات: أحسن ${recBetter} · أسوأ ${recWorse}\n` +
        (diffs.length ? diffs.join("\n") + "\n" : "") +
        `╚══════════════════════════════════════════\n`,
      );
    }
  });
});
