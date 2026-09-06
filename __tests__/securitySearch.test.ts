import { describe, it, expect } from "vitest";
import { securityRowMatches, type SecurityPerson } from "@/lib/securitySearch";

/**
 * سجل الأمان بيعرض «الفاعل» و«الهدف» بالاسم، لكن الأدمن بيدوّر بالإيميل أو
 * رقم التليفون كمان — دول اللي في إيده لما مندوب يبلّغ عن مشكلة. فالبحث
 * بيغطّي الاسم والإيميل والتليفون للطرفين، وكمان النص الخام المحفوظ في
 * `actor_label`/`target_label` (غالباً بيبقى الإيميل اللي اتكتب وقت الحدث،
 * وساعات بيبقى الأثر الوحيد لحساب اتمسح بعد كده).
 */
const PEOPLE: Record<string, SecurityPerson> = {
  "id-1": { username: "أبو زياد", email: "abuziad@platehunter.local", phone: "0551234567" },
  "id-2": { username: "محمد عفيفي", email: "m.afifi@gmail.com", phone: "+966 55 987 6543" },
};

const row = (over: Partial<Parameters<typeof securityRowMatches>[0]> = {}) => ({
  agent_id: "id-1" as string | null,
  target_id: null as string | null,
  actor_label: null as string | null,
  target_label: null as string | null,
  ...over,
});

describe("securityRowMatches — بحث بالاسم/الإيميل/التليفون", () => {
  it("بحث فاضي = كل الصفوف", () => {
    expect(securityRowMatches(row(), PEOPLE, "")).toBe(true);
    expect(securityRowMatches(row(), PEOPLE, "   ")).toBe(true);
  });

  it("بالاسم (جزء منه)", () => {
    expect(securityRowMatches(row(), PEOPLE, "زياد")).toBe(true);
    expect(securityRowMatches(row(), PEOPLE, "عفيفي")).toBe(false);
  });

  it("بالإيميل (جزء منه، وبأي حالة أحرف)", () => {
    expect(securityRowMatches(row(), PEOPLE, "abuziad")).toBe(true);
    expect(securityRowMatches(row(), PEOPLE, "ABUZIAD@PLATEHUNTER.LOCAL")).toBe(true);
  });

  it("بالتليفون — والفراغات والرموز مابتفرقش", () => {
    expect(securityRowMatches(row({ agent_id: "id-2" }), PEOPLE, "559876543")).toBe(true);
    expect(securityRowMatches(row({ agent_id: "id-2" }), PEOPLE, "055 987 65 43")).toBe(true);
    expect(securityRowMatches(row({ agent_id: "id-2" }), PEOPLE, "+966559876543")).toBe(true);
  });

  it("بالأرقام العربية (٠٥٥…) زي الإنجليزية", () => {
    expect(securityRowMatches(row(), PEOPLE, "٠٥٥١٢٣٤٥٦٧")).toBe(true);
  });

  it("بيدوّر في الهدف مش الفاعل بس", () => {
    const r = row({ agent_id: "id-1", target_id: "id-2" });
    expect(securityRowMatches(r, PEOPLE, "عفيفي")).toBe(true);
    expect(securityRowMatches(r, PEOPLE, "m.afifi")).toBe(true);
  });

  it("بيدوّر في النص الخام (label) — أثر حساب اتمسح", () => {
    const r = row({ agent_id: null, actor_label: "deleted-user@platehunter.local" });
    expect(securityRowMatches(r, PEOPLE, "deleted-user")).toBe(true);
  });

  it("مافيش تطابق → false", () => {
    expect(securityRowMatches(row(), PEOPLE, "مالوش وجود")).toBe(false);
    expect(securityRowMatches(row(), PEOPLE, "0000000")).toBe(false);
  });

  it("صف بلا أشخاص معروفين مايكسرش البحث", () => {
    expect(securityRowMatches(row({ agent_id: "مش-موجود" }), PEOPLE, "زياد")).toBe(false);
    expect(securityRowMatches(row({ agent_id: null }), PEOPLE, "زياد")).toBe(false);
  });

  it("أ/إ/آ بتتوحّد فالبحث بـ«ابو» بيلاقي «أبو»", () => {
    expect(securityRowMatches(row(), PEOPLE, "ابو زياد")).toBe(true);
  });
});
