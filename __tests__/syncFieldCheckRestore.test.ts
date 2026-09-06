import { describe, it, expect, vi } from "vitest";

// الاختبار بيقيس تحويل الصف بس — مش محتاج عميل Supabase حقيقي.
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: () => ({}), auth: {} } }));
import { serverRowToEntry } from "@/lib/syncFieldCheck";

// 🐞 حلقة إعادة الرفع اللي كانت بتاكل الداتابيز (٢٠٢٦-٠٩-٠٦):
// restoreFieldChecks بيسحب سجلات المندوب من السيرفر ويحفظها محلياً بـstore.put،
// واللي بيستبدل الصف بالكامل — فعلامة «اترفعت» (synced) بتتمسح. وبعدها المزامنة
// التدريجية بتلاقي كل السجلات «لسه مترفعتش» وترفعهم تاني، وهي أصلاً جاية من
// السيرفر لحظتها. النتيجة: ٦٠٬٨١١ تعديل/ساعة على field_checks مقابل ١٬١٢٩ صف
// جديد حقيقي = ٥٤ كتابة زيادة مقابل كل كتابة ليها لازمة.
describe("serverRowToEntry — الصف الجايّ من السيرفر", () => {
  const row = {
    local_id: "abc-123",
    plate: "أبح 1234",
    method: "camera",
    lat: 24.7136,
    lng: 46.6753,
    maps_link: "https://maps.google.com/?q=24.7136,46.6753",
    extra: { "الحي": "النهضة" },
    checked_at: "2026-09-06T10:00:00Z",
  };

  it("🐞 بيتعلّم إنه مرفوع — مايترفعش تاني", () => {
    expect(serverRowToEntry(row, "agent-1").synced).toBe(true);
  });

  it("بينقل كل الحقول صح", () => {
    const e = serverRowToEntry(row, "agent-1");
    expect(e).toMatchObject({
      id: "abc-123",
      agentId: "agent-1",
      plate: "أبح 1234",
      method: "camera",
      lat: 24.7136,
      lng: 46.6753,
      mapsLink: "https://maps.google.com/?q=24.7136,46.6753",
      row: { "الحي": "النهضة" },
      checkedAt: "2026-09-06T10:00:00Z",
    });
  });

  it("بيتحمّل الحقول الناقصة من غير ما يكسر", () => {
    const e = serverRowToEntry({ local_id: "x", plate: "سعد 1", checked_at: "2026-09-06T10:00:00Z" }, "a");
    expect(e.synced).toBe(true);
    expect(e.row).toEqual({});
    expect(e.method).toBe("");
    expect(e.lat).toBeUndefined();
    expect(e.mapsLink).toBeUndefined();
  });

  it("🐞 صف مسترجَع مايظهرش في قائمة اللي محتاج رفع", () => {
    const restored = [row, { ...row, local_id: "d2" }].map((r) => serverRowToEntry(r, "a"));
    const stillPending = restored.filter((e) => !e.synced);
    expect(stillPending).toEqual([]);           // كانوا كلهم بيرجعوا pending
  });
});
