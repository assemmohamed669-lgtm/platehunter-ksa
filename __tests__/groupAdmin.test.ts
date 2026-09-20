/**
 * صلاحية المسح في «سجلات المجموعة»: **الأدمن اللي في مجموعة** يقدر يمسح أي
 * سجل من سجلات مجموعته. المندوب العادي يمسح سجلاته هو بس (زي ما كان).
 *
 * الحارس ده في الواجهة — الحارس الفعلي هو RLS على السيرفر (group-admin-delete.sql).
 */
import { describe, it, expect } from "vitest";
import { canDeleteGroupRecord, type GroupViewer } from "@/lib/groupAdmin";

const MEMBERS = ["me", "ali", "mohamed"];
const admin: GroupViewer = { id: "me", role: "admin", team: "فريق أحمد" };
const agent: GroupViewer = { id: "me", role: "agent", team: "فريق أحمد" };

describe("canDeleteGroupRecord", () => {
  it("الأدمن في المجموعة بيمسح سجل أي عضو", () => {
    expect(canDeleteGroupRecord(admin, "ali", MEMBERS)).toBe(true);
    expect(canDeleteGroupRecord(admin, "mohamed", MEMBERS)).toBe(true);
  });

  it("المندوب العادي يمسح سجلاته هو بس", () => {
    expect(canDeleteGroupRecord(agent, "me", MEMBERS)).toBe(true);
    expect(canDeleteGroupRecord(agent, "ali", MEMBERS)).toBe(false);
  });

  it("الأدمن بيمسح سجلاته هو برضه", () => {
    expect(canDeleteGroupRecord(admin, "me", MEMBERS)).toBe(true);
  });

  it("أدمن مش في مجموعة مايمسحش من المجموعة دي", () => {
    expect(canDeleteGroupRecord({ id: "me", role: "admin", team: null }, "ali", MEMBERS)).toBe(false);
  });

  it("سجل مندوب برّه المجموعة = لأ، حتى للأدمن", () => {
    expect(canDeleteGroupRecord(admin, "غريب", MEMBERS)).toBe(false);
  });

  it("قايمة أعضاء فاضية = لأ (لسه بتحمّل)", () => {
    expect(canDeleteGroupRecord(admin, "ali", [])).toBe(false);
  });

  it("بيشتغل بـSet زي ما بيشتغل بمصفوفة", () => {
    expect(canDeleteGroupRecord(admin, "ali", new Set(MEMBERS))).toBe(true);
  });

  it("بيانات ناقصة مابترميش", () => {
    expect(canDeleteGroupRecord({ id: "", role: null, team: null }, "", [])).toBe(false);
  });
});
