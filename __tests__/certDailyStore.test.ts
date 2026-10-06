import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 📄 عمود «رقم العقد» (cert_no) ممكن يكون لسه ماتضافش لما الكود ينزل — الحفظ والقراية لازم يكمّلوا من
 * غيره (وإلا شهايد النهارده كلها تقف لحد ما المالك يشغّل الـSQL).
 */
let hasCertNo = false;
const updates: Record<string, unknown>[] = [];
const selects: string[] = [];

vi.mock("@/lib/supabaseAdmin", () => {
  const missing = { message: "Could not find the 'cert_no' column of 'cert_daily' in the schema cache", code: "PGRST204" };
  const row = { file_id: "F1", name: "x.pdf", created_at: "2026-10-06T05:00:00Z", parsed: true, plate: "ابح1234", plate_text: "ا ب ح 1234",
    vin: "", bank: "", make: "", model: "", year: "", color: "", status: "", cert_date: "" };
  const from = () => ({
    update: (patch: Record<string, unknown>) => ({
      eq: async () => {
        updates.push({ ...patch });
        return { error: !hasCertNo && "cert_no" in patch ? missing : null };
      },
    }),
    select: (cols: string) => {
      selects.push(cols);
      const q = {
        eq: () => q, order: () => q,
        range: async () => (!hasCertNo && cols.includes("cert_no")
          ? { data: null, error: missing }
          : { data: [hasCertNo ? { ...row, cert_no: "CRN-119-00133431" } : row], error: null }),
      };
      return q;
    },
  });
  return { supabaseAdmin: { from } };
});

import { saveParsedCert, readDayCerts } from "@/lib/certDailyStore";
import { parseCertText } from "@/lib/certParse";

beforeEach(() => { updates.length = 0; selects.length = 0; });

describe("🔴 عمود «رقم العقد» لسه ماتضافش ⇒ الشغل مابيقفش", () => {
  it("🔴 الحفظ بيعيد من غير العمود", async () => {
    hasCertNo = false;
    await expect(saveParsedCert("F1", parseCertText("رقم اللوحة: ا ب ح 1234", "x.pdf"), 1, true)).resolves.toBeUndefined();
    expect(updates).toHaveLength(2);
    expect("cert_no" in updates[0]).toBe(true);
    expect("cert_no" in updates[1]).toBe(false);
    expect(updates[1]).toMatchObject({ plate: "ابح1234", parsed: true });
  });
  it("🔴 القراية بتعيد من غير العمود (والرقم فاضي)", async () => {
    hasCertNo = false;
    const d = await readDayCerts("2026-10-06");
    expect(d.entries).toHaveLength(1);
    expect(d.entries[0].certNo).toBe("");
    expect(selects.some((c) => !c.includes("cert_no"))).toBe(true);
  });
  it("العمود موجود ⇒ مرة واحدة والرقم راجع", async () => {
    hasCertNo = true;
    await saveParsedCert("F1", parseCertText("CRN-119-00133431: x", "x.pdf"), 1, true);
    expect(updates).toHaveLength(1);
    expect(updates[0].cert_no).toBe("CRN-119-00133431");
    const d = await readDayCerts("2026-10-06");
    expect(d.entries[0].certNo).toBe("CRN-119-00133431");
  });
});
