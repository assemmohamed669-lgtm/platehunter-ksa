import { describe, it, expect } from "vitest";
import { isFleetPair, FleetMemory, FLEET_MAX_STEP } from "@/lib/fleetPairs";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🚚 أسطول الأرقام المتسلسلة — «حبل1234 حبل1235 حبل1236»
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٤ سبتمبر ٢٠٢٦): «لما بيبقى فيه أسطول سيارات لشركة أرقامها متسلسلة
 *  حبل1234 حبل1235 حبل1236… لما بيقول السيارات بالتسلسل ده مش بيظهروا، بيعدّل
 *  على السيارة اللي قالها ومش بيكتب التسلسل».
 *
 *  الدليل (٧٦ تسجيل مناديب · ٤٬٠٤٥ لوحة · موديل ٧٥٠٠): لوحتين بنفس الحروف
 *  **في نافذة واحدة**:
 *    · أسطول حقيقي  : دعن6156/6157 · داط5801/5803 · رعو2472/2473 — فرق ١–٢
 *    · غلط سمع      : بمم8788/6789 · الن6337/6077 · ارع5333/5773 … — فرق ٢٦٠+
 *  ⇒ مفيش ولا غلط واحد فرقه ≤ ١٠.
 */
describe("isFleetPair — «ده أسطول مش غلط سمع»", () => {
  it("🔴 متسلسلة بنفس الحروف ⇒ عربيتين", () => {
    expect(isFleetPair("حبل1234", "حبل1235")).toBe(true);
    expect(isFleetPair("حبل1236", "حبل1234")).toBe(true);
    expect(isFleetPair("داط5801", "داط5803")).toBe(true);
  });
  it("🔴 عبور العشرة (1239 ⇐ 1240) — خانتين مختلفين بس متتاليين", () => {
    expect(isFleetPair("حبل1239", "حبل1240")).toBe(true);
    expect(isFleetPair("حبل1299", "حبل1300")).toBe(true);
  });
  it(`الحد ${FLEET_MAX_STEP} بالظبط`, () => {
    expect(isFleetPair("حبل1230", "حبل1240")).toBe(true);
    expect(isFleetPair("حبل1230", "حبل1241")).toBe(false);
  });
  it("🔴 أغلاط السمع المقيسة في نفس النافذة ⇒ لأ (كلها بعيدة)", () => {
    expect(isFleetPair("بمم8788", "بمم6789")).toBe(false);
    expect(isFleetPair("الن6337", "الن6077")).toBe(false);
    expect(isFleetPair("ارع5333", "ارع5773")).toBe(false);
    expect(isFleetPair("رلع6055", "رلع6022")).toBe(false);
  });
  it("حروف مختلفة · نفس اللوحة · شكل مش لوحة ⇒ لأ", () => {
    expect(isFleetPair("حبل1234", "حبك1235")).toBe(false);
    expect(isFleetPair("حبل1234", "حبل1234")).toBe(false);
    expect(isFleetPair("حبل123", "حبل124")).toBe(false);
    expect(isFleetPair("", "حبل1234")).toBe(false);
  });
});

describe("FleetMemory — الدليل = الاتنين اتسمعوا في نافذة واحدة", () => {
  it("🔴 لوحتين متسلسلتين في نافذة واحدة ⇒ عربيتين (من الناحيتين)", () => {
    const m = new FleetMemory();
    m.note(["حبل1234", "حبل1235"]);
    expect(m.distinct("حبل1234", "حبل1235")).toBe(true);
    expect(m.distinct("حبل1235", "حبل1234")).toBe(true);
  });
  it("٣ في نافذة ⇒ كل الأزواج", () => {
    const m = new FleetMemory();
    m.note(["حبل1234", "حبل1235", "حبل1236"]);
    expect(m.distinct("حبل1234", "حبل1236")).toBe(true);
    expect(m.distinct("حبل1235", "حبل1236")).toBe(true);
  });
  it("🔴 كل واحدة في نافذة لوحدها ⇒ مش دليل (ممكن تكون نفس العربية اتقرت غلط)", () => {
    const m = new FleetMemory();
    m.note(["حبل1234"]);
    m.note(["حبل1235"]);
    expect(m.distinct("حبل1234", "حبل1235")).toBe(false);
  });
  it("🔴 غلط سمع بعيد في نفس النافذة مايتسجّلش", () => {
    const m = new FleetMemory();
    m.note(["بمم8788", "بمم6789"]);
    expect(m.distinct("بمم8788", "بمم6789")).toBe(false);
  });
  it("لوحات تانية في نفس النافذة مابتأثّرش", () => {
    const m = new FleetMemory();
    m.note(["سار8888", "حبل1234", "حبل1235"]);
    expect(m.distinct("سار8888", "حبل1234")).toBe(false);
    expect(m.distinct("حبل1234", "حبل1235")).toBe(true);
  });
  it("🔴 التسلسل كله: ١٢٣٤ و١٢٣٦ عمرهم مااتسمعوا مع بعض بس الاتنين عربيات مؤكّدة ⇒ عربيتين", () => {
    // حبل1234+حبل1235 في نافذة، وحبل1235+حبل1236 في نافذة تانية
    const m = new FleetMemory();
    m.note(["حبل1234", "حبل1235"]);
    m.note(["حبل1235", "حبل1236"]);
    expect(m.distinct("حبل1234", "حبل1236")).toBe(true);
  });
  it("🔴 عضو في الأسطول + لوحة عمرها مااتسمعت مع حد ⇒ مش دليل (ممكن تكون غلط سمع)", () => {
    const m = new FleetMemory();
    m.note(["حبل1234", "حبل1235"]);
    expect(m.distinct("حبل1234", "حبل1236")).toBe(false);
    expect(m.distinct("حبل1234", "حبل1284")).toBe(false);
  });
  it("عضوين بحروف مختلفة ⇒ مش شغلتنا (مالهمش علاقة ببعض أصلاً)", () => {
    const m = new FleetMemory();
    m.note(["حبل1234", "حبل1235"]);
    m.note(["سار8888", "سار8889"]);
    expect(m.distinct("حبل1234", "سار8888")).toBe(false);
  });
  it("isMember", () => {
    const m = new FleetMemory();
    m.note(["حبل1234", "حبل1235"]);
    expect(m.isMember("حبل1234")).toBe(true);
    expect(m.isMember("حبل1236")).toBe(false);
  });
  it("reset بيمسح الدليل (جلسة جديدة)", () => {
    const m = new FleetMemory();
    m.note(["حبل1234", "حبل1235"]);
    m.reset();
    expect(m.distinct("حبل1234", "حبل1235")).toBe(false);
  });
});
