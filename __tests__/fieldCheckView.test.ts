import { describe, it, expect } from "vitest";
import { fieldCategoryCounts, fieldCategoryList, fieldCategoryOnly } from "@/lib/fieldCheckView";
import type { FieldCheckEntry } from "@/lib/idb";

// المندوب شاف «مطلوب ٥» ولما داس لقى ٤ لوحات. السبب إن العدّاد بيحسب من
// السجلات **الخام** والقائمة بتعرض من السجلات **بعد دمج المكرر** — مصدرين
// مختلفين. وقرار المالك: في «المطلوب» بالذات يتعرض كل سجل حتى لو مكرّر، لأن
// دي القائمة الحرجة والأمان فيها إنه يشوف أكتر مش أقل.
const mk = (over: Partial<FieldCheckEntry>): FieldCheckEntry => ({
  id: Math.random().toString(36).slice(2),
  agentId: "a", plate: "أبح1234", row: {}, method: "متشيكة يدوي",
  checkedAt: "2026-09-17T10:00:00Z", ...over,
} as FieldCheckEntry);

/** نفس اللوحة، نفس المكان بالظبط، فرق ثواني = إرسال متكرر لنفس التشييك. */
const twice = (plate: string, wanted = true) => [
  mk({ plate, lat: 24.71360, lng: 46.67530, checkedAt: "2026-09-17T10:00:00Z" }),
  mk({ plate, lat: 24.71360, lng: 46.67530, checkedAt: "2026-09-17T10:00:20Z" }),
];
const isWanted = (e: FieldCheckEntry) => e.plate.startsWith("أبح") || e.plate.startsWith("سعد");

describe("قائمة السجلات وعدّاداتها", () => {
  // 🐞 دي المشكلة اللي المندوب شافها بالحرف
  it("🐞 عدّاد «مطلوب» = طول قائمة «مطلوب» بالظبط", () => {
    const entries = [...twice("أبح1234"), mk({ plate: "سعد5678" }), mk({ plate: "نكد9999" })];
    const counts = fieldCategoryCounts(entries, isWanted);
    const list = fieldCategoryList(entries, "wanted", isWanted);
    expect(counts.wanted).toBe(3);      // أبح مرتين + سعد
    expect(list).toHaveLength(counts.wanted);
  });

  it("«المطلوب» بيعرض المكرّر — مايخبّيش ولا سجل", () => {
    const list = fieldCategoryList(twice("أبح1234"), "wanted", isWanted);
    expect(list).toHaveLength(2);
  });

  it("باقي القوايم بتفضل بتدمج المكرّر — ضجيج الـ٨ مرات مايرجعش", () => {
    const entries = twice("أبح1234");
    expect(fieldCategoryList(entries, "all", isWanted)).toHaveLength(1);
    expect(fieldCategoryList(entries, "manual", isWanted)).toHaveLength(1);
  });

  it("نفس اللوحة في مكان تاني بتظهر مرتين في كل القوايم", () => {
    const entries = [
      mk({ plate: "أبح1234", lat: 24.71360, lng: 46.67530 }),
      mk({ plate: "أبح1234", lat: 24.80000, lng: 46.90000 }),   // مكان تاني
    ];
    expect(fieldCategoryList(entries, "all", isWanted)).toHaveLength(2);
    expect(fieldCategoryList(entries, "wanted", isWanted)).toHaveLength(2);
  });

  it("الصوتي واليدوي بيتفرزوا صح", () => {
    const entries = [
      mk({ plate: "نكد1", method: "متشيكة صوتي" }),
      mk({ plate: "نكد2", method: "متشيكة يدوي" }),
    ];
    expect(fieldCategoryList(entries, "voice", isWanted)).toHaveLength(1);
    expect(fieldCategoryList(entries, "manual", isWanted)).toHaveLength(1);
  });

  it("قايمة فاضية ماتكسرش", () => {
    expect(fieldCategoryCounts([], isWanted)).toEqual({ voice: 0, manual: 0, wanted: 0 });
    expect(fieldCategoryList([], "wanted", isWanted)).toEqual([]);
  });
});

// نافذة «إظهار وتعديل اللوحات» كانت بتفتح **كل** السجلات مهما كانت الشريحة
// المختارة — المندوب واقف على «مطلوب ٥» ويدوس، فيلاقي قدامه الـ١٦ ألف كلهم.
// المطلوب: تفتح على نفس الشريحة اللي هو واقف عليها.
describe("fieldCategoryOnly — شريحة المحرّر بلا دمج", () => {
  const mk = (over: Partial<FieldCheckEntry>): FieldCheckEntry => ({
    id: Math.random().toString(36).slice(2),
    agentId: "a", plate: "أبح1234", row: {}, method: "متشيكة يدوي",
    checkedAt: "2026-09-17T10:00:00Z", ...over,
  } as FieldCheckEntry);
  const isWanted = (e: FieldCheckEntry) => e.plate.startsWith("أبح");
  const entries = [
    mk({ plate: "أبح1111", method: "متشيكة صوتي" }),
    mk({ plate: "أبح2222", method: "متشيكة يدوي" }),
    mk({ plate: "نكد3333", method: "متشيكة صوتي" }),
    mk({ plate: "نكد4444", method: "متشيكة يدوي" }),
  ];

  it("🐞 «مطلوب» بيفتح المطلوب بس — مش كل السجلات", () => {
    expect(fieldCategoryOnly(entries, "wanted", isWanted).map((e) => e.plate))
      .toEqual(["أبح1111", "أبح2222"]);
  });

  it("«صوتي» و«يدوي» كل واحد بشريحته", () => {
    expect(fieldCategoryOnly(entries, "voice", isWanted)).toHaveLength(2);
    expect(fieldCategoryOnly(entries, "manual", isWanted)).toHaveLength(2);
  });

  it("«الكل» بيفتح الكل", () => {
    expect(fieldCategoryOnly(entries, "all", isWanted)).toHaveLength(4);
  });

  // ⚠️ المحرّر بيتعدّل فيه — لو دمجنا المكرر هنخبّي صف والمندوب يعدّل واحد
  // ويسيب أخوه. الدمج للعرض المختصر بس، مش للتعديل.
  it("مابيدمجش المكرّر — كل صف ينفع يتعدّل", () => {
    const dup = [
      mk({ plate: "أبح9999", lat: 24.7136, lng: 46.6753, checkedAt: "2026-09-17T10:00:00Z" }),
      mk({ plate: "أبح9999", lat: 24.7136, lng: 46.6753, checkedAt: "2026-09-17T10:00:20Z" }),
    ];
    expect(fieldCategoryOnly(dup, "wanted", isWanted)).toHaveLength(2);
    expect(fieldCategoryOnly(dup, "all", isWanted)).toHaveLength(2);
  });

  it("قايمة فاضية ماتكسرش", () => {
    expect(fieldCategoryOnly([], "wanted", isWanted)).toEqual([]);
  });
});
