/**
 * بحث درايف كان بياخد **أول صفحة بس** (٢٠٠ ملف) وبيتجاهل `nextPageToken`.
 *
 * للهيكل ورقم الشهادة مالوش تأثير (النتيجة واحدة). لكن بحث **اللوحة** بيدوّر
 * بـ٤ أرقام جوّه اسم الملف، والأرقام دي بتيجي صدفة جوّه أرقام شهادات وتواريخ
 * في أسماء ملفات تانية — فلو طابقت أكتر من ٢٠٠، شهادة المندوب ممكن تكون في
 * الصفحة التانية والبرنامج يقوله «مفيش شهادة» وهي موجودة. نفس عَرَض الحادثة
 * اللي فضلت أسبوعين.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { driveSearch, DRIVE_MAX_FILES } from "@/lib/gdrive";

function mockPages(pages: { files: { id: string; name: string }[]; nextPageToken?: string }[]) {
  const calls: string[] = [];
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    const page = pages[Math.min(i++, pages.length - 1)];
    return { ok: true, json: async () => page } as unknown as Response;
  }));
  return calls;
}

const f = (n: number, from = 0) =>
  Array.from({ length: n }, (_, k) => ({ id: `f${from + k}`, name: `ملف ${from + k}` }));

afterEach(() => { vi.unstubAllGlobals(); });

describe("driveSearch — الصفحات", () => {
  it("صفحة واحدة بلا توكن → نداء واحد", async () => {
    const calls = mockPages([{ files: f(3) }]);
    const out = await driveSearch("q", "tok");
    expect(out).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it("بيكمّل على الصفحات ويلمّ الكل", async () => {
    const calls = mockPages([
      { files: f(200, 0), nextPageToken: "p2" },
      { files: f(200, 200), nextPageToken: "p3" },
      { files: f(7, 400) },
    ]);
    const out = await driveSearch("q", "tok");
    expect(out).toHaveLength(407);
    expect(out[406].id).toBe("f406");
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain("pageToken=p2");
    expect(calls[2]).toContain("pageToken=p3");
  });

  it("بيقف عند الحد الأقصى — مايعلّقش على أرشيف ضخم", async () => {
    mockPages([{ files: f(1000), nextPageToken: "more" }]);
    const out = await driveSearch("q", "tok");
    expect(out.length).toBeLessThanOrEqual(DRIVE_MAX_FILES);
    expect(out.length).toBeGreaterThan(200);   // أكتر من الحد القديم بكتير
  });

  it("maxFiles بيحدّ النتيجة والنداءات (فحص الاتصال بيستعمله)", async () => {
    const calls = mockPages([{ files: f(1), nextPageToken: "more" }]);
    const out = await driveSearch("q", "tok", { maxFiles: 1 });
    expect(out).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("pageSize=1");
  });

  it("فشل أول صفحة → فاضي", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) } as unknown as Response)));
    expect(await driveSearch("q", "tok")).toEqual([]);
  });

  it("فشل صفحة في النص → بنرجّع اللي لمّيناه مش فاضي", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n++;
      if (n === 1) return { ok: true, json: async () => ({ files: f(200), nextPageToken: "p2" }) } as unknown as Response;
      return { ok: false, json: async () => ({}) } as unknown as Response;
    }));
    const out = await driveSearch("q", "tok");
    expect(out).toHaveLength(200);
  });

  it("سيرفر بيرجّع نفس التوكن → مابنلفّش للأبد", async () => {
    const calls = mockPages([{ files: f(10), nextPageToken: "same" }]);
    const out = await driveSearch("q", "tok");
    expect(calls.length).toBeLessThan(60);
    expect(out.length).toBeLessThanOrEqual(DRIVE_MAX_FILES);
  });

  it("رد بلا files مابيرميش", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) } as unknown as Response)));
    expect(await driveSearch("q", "tok")).toEqual([]);
  });
});
