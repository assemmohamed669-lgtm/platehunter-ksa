import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGroupRowsCache } from "@/lib/voiceOnlyRecords";

/**
 * ⚡ **فرز «صوت فقط» يبقى سريع وهو بيدخّل سجلات المجموعة** (المالك ١ أكتوبر ٢٠٢٦:
 * «بطئ جدا على ما يطلعلهم نتيجه الفرز مع ان السجلات مش كتير»).
 *
 * السبب: الفرز كان **مستني السيرفر** (match_group_plates بكل لوحات الإحالة) قبل ما
 * يعرض أي حاجة. الحل: (١) جلب سجلات المجموعة **في الخلفية أول ما الإحالة تترفع**
 * فلما يدوس «ابدأ الفرز» تكون وصلت، و(٢) نتيجة سجلاته تظهر على طول، وسجلات
 * زمايله تتضاف فوقها أول ما توصل.
 */
const row = (p: string) => ({ "رقم اللوحة": p });

describe("createGroupRowsCache", () => {
  it("🔴 التحميل المسبق بكل لوحات الإحالة ⇒ الفرز بعده من غير نداء جديد", async () => {
    let calls = 0;
    const cache = createGroupRowsCache(async (n) => { calls++; return n.map(row); });
    cache.prefetch(["ا1", "ب2", "ج3"]);
    expect(calls).toBe(1);
    expect(await cache.get(["ب2", "ج3"])).toHaveLength(3);   // «جديد» = جزء من الإحالة
    expect(await cache.get(["ا1", "ب2", "ج3"])).toHaveLength(3);
    expect(calls).toBe(1);
  });

  it("لوحات مش في الجلب المسبق (اللصق) ⇒ جلب ليها هي بس", async () => {
    const asked: string[][] = [];
    const cache = createGroupRowsCache(async (n) => { asked.push(n); return n.map(row); });
    cache.prefetch(["ا1", "ب2"]);
    await cache.get(["د4"]);
    expect(asked).toEqual([["ا1", "ب2"], ["د4"]]);
  });

  it("بعد المدة اللي اتحددت بيجيب من جديد (سجلات زمايله الجديدة تدخل)", async () => {
    let t = 0, calls = 0;
    const cache = createGroupRowsCache(async (n) => { calls++; return n.map(row); }, { ttlMs: 1000, now: () => t });
    cache.prefetch(["ا1"]);
    t = 5000;
    await cache.get(["ا1"]);
    expect(calls).toBe(2);
  });

  it("غلط في الجلب ⇒ فاضي (الفرز على سجلاته بيكمّل)", async () => {
    const cache = createGroupRowsCache(async () => { throw new Error("offline"); });
    cache.prefetch(["ا1"]);
    expect(await cache.get(["ا1"])).toEqual([]);
  });
});

describe("توصيل الفرز السريع", () => {
  const code = readFileSync(join(process.cwd(), "components", "VoiceOnlySort.tsx"), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  const block = (name: string) => code.slice(code.indexOf(`const ${name} = useCallback`), code.indexOf("}, [", code.indexOf(`const ${name} = useCallback`)));

  it("🔴 الإحالة أول ما تجهز ⇒ سجلات المجموعة بتتجاب في الخلفية", () => {
    expect(code).toMatch(/groupCache\.prefetch\(/);
  });

  it("🔴 نتيجة سجلاته بتظهر قبل ما يستنى سجلات المجموعة (الفرز واللصق)", () => {
    for (const [name, setter] of [["runSort", "setResults("], ["runPaste", "setPasteResults("]]) {
      const b = block(name);
      const firstShow = b.indexOf(setter);
      const wait = b.indexOf("await groupCache.get(");
      expect(firstShow).toBeGreaterThan(-1);
      expect(wait).toBeGreaterThan(firstShow);
    }
  });

  it("🔴 الصف اللي المندوب حذفه قبل وصول سجلات المجموعة مابيرجعش", () => {
    expect(code).toMatch(/sortRemovedRef/);
    expect(code).toMatch(/pasteRemovedRef/);
  });
});
