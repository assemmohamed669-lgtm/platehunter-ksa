import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

/**
 * 📄 عمود «شهايد» قدام عربيات الفرز والمطلوب — المالك (٤ أكتوبر ٢٠٢٦): «لو السيارة
 * ليها شهادة يظهر قدامها كلمه شهاده بالازرق ولما المندوب يدوس عليها تفتحلو الشهادة».
 * الأماكن: نتيجة الفرز (الداتا والسجلات) · لصق نصي · «فرز» بتاع «صوت فقط» · المطلوب.
 * السوبر أدمن الأول (`CERTS_IN_RESULTS_FOR_ALL`).
 */

const fetchCertBlob = vi.fn(async (_id: string) => new Blob(["%PDF"]));
const openCertBlob = vi.fn(async (_b: Blob, _n: string) => {});
vi.mock("@/lib/certificate", () => ({
  fetchCertBlob: (id: string) => fetchCertBlob(id),
  openCertBlob: (b: Blob, n: string) => openCertBlob(b, n),
}));
vi.mock("@/lib/authHeader", () => ({ authHeader: async () => ({ Authorization: "Bearer t" }) }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));

import {
  requestCertificates, retryCertificate, getCertState, certKey, clearCertStates,
  CERTS_IN_RESULTS_FOR_ALL, CERT_STATE_TTL_MS,
} from "@/lib/certificateBatch";
import CertCell from "@/components/CertCell";

type Body = { plates: string[] };
let posted: Body[] = [];
let reply: (b: Body) => { results: Record<string, { id: string; name: string }[]>; failed: string[] };

beforeEach(() => {
  clearCertStates();
  posted = [];
  reply = (b) => ({ results: Object.fromEntries(b.plates.map((p) => [p, []])), failed: [] });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Body;
    posted.push(body);
    return { ok: true, json: async () => reply(body) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fetchCertBlob.mockClear(); openCertBlob.mockClear(); });

/** لحد ما مفيش لوحة لسه «بيدوّر» (الطلب بيستورد authHeader وقت الحاجة فبياخد شوية). */
const settle = (plates: string[] = []) => act(async () => {
  await vi.waitFor(() => {
    for (const p of plates) expect(getCertState(p)?.s).not.toBe("loading");
  });
  await new Promise((r) => setTimeout(r, 0));
});

describe("🔴 العميل — سؤال واحد بكل اللوحات، ومايتسألش تاني", () => {
  it("اللوحات بأي شكل بتتوحّد (عربي/إنجليزي/مسافات) وبتتبعت مرة واحدة", async () => {
    requestCertificates(["ا ب ح 1234", "ابح1234", "د ه و 5678"]);
    await settle(["ابح1234", "دهو5678"]);
    expect(posted).toHaveLength(1);
    expect(posted[0].plates.sort()).toEqual([certKey("ابح1234"), certKey("دهو5678")].sort());
    requestCertificates(["ابح 1234"]);
    await settle();
    expect(posted).toHaveLength(1);              // معروفة خلاص
  });

  it("لقيت شهادة ⇒ found بأول شهادة؛ مفيش ⇒ none", async () => {
    reply = (b) => ({ results: Object.fromEntries(b.plates.map((p) => [p, p.includes("1234") ? [{ id: "c1", name: "ا ب ح 1234.pdf" }] : []])), failed: [] });
    requestCertificates(["ابح1234", "دهو5678"]);
    await settle(["ابح1234", "دهو5678"]);
    expect(getCertState("ابح1234")).toMatchObject({ s: "found", cert: { id: "c1" } });
    expect(getCertState("دهو5678")).toEqual({ s: "none" });
  });

  it("🔴 درايف فشل ⇒ error (مش none)، و«دوس تاني» بيسأل من جديد", async () => {
    reply = (b) => ({ results: {}, failed: b.plates });
    requestCertificates(["ابح1234"]);
    await settle(["ابح1234"]);
    expect(getCertState("ابح1234")).toEqual({ s: "error" });
    reply = (b) => ({ results: Object.fromEntries(b.plates.map((p) => [p, [{ id: "c9", name: "x.pdf" }]])), failed: [] });
    retryCertificate("ابح1234");
    await settle(["ابح1234"]);
    expect(posted).toHaveLength(2);
    expect(getCertState("ابح1234")).toMatchObject({ s: "found" });
  });

  it("السيرفر وقع/النت فاصل ⇒ error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    requestCertificates(["ابح1234"]);
    await settle(["ابح1234"]);
    expect(getCertState("ابح1234")).toEqual({ s: "error" });
  });

  it("🔴 «مالهاش شهادة» مابتفضلش للأبد — بعد المدة بتتسأل تاني (شهادة جديدة اترفعت تظهر)", async () => {
    requestCertificates(["ابح1234"], 0);
    await settle(["ابح1234"]);
    expect(posted).toHaveLength(1);
    requestCertificates(["ابح1234"], CERT_STATE_TTL_MS - 1);
    await settle(["ابح1234"]);
    expect(posted).toHaveLength(1);
    requestCertificates(["ابح1234"], CERT_STATE_TTL_MS + 1);
    // الخانة بتفضل على نتيجتها القديمة وهي بتتحدّث (مابترجعش «بيدوّر…»)
    expect(getCertState("ابح1234")).toEqual({ s: "none" });
    await vi.waitFor(() => expect(posted).toHaveLength(2));
  });

  it("قايمة كبيرة بتتقسم طلبات (مش طلب ضخم واحد)", async () => {
    const many = Array.from({ length: 450 }, (_, i) => `ابح${1000 + i}`);
    requestCertificates(many);
    await settle(many);
    expect(posted.length).toBeGreaterThanOrEqual(2);
    for (const b of posted) expect(b.plates.length).toBeLessThanOrEqual(300);
  });
});

describe("🔴 الخانة نفسها", () => {
  it("شهادة ⇒ «شهادة» بالأزرق، والدوس بيحمّلها ويفتحها", async () => {
    render(<CertCell state={{ s: "found", cert: { id: "c1", name: "ا ب ح 1234.pdf", link: null }, count: 1 }} />);
    const btn = screen.getByRole("button", { name: /شهادة/ });
    expect(btn.className).toMatch(/text-primary/);
    await act(async () => { fireEvent.click(btn); });
    expect(fetchCertBlob).toHaveBeenCalledWith("c1");
    expect(openCertBlob).toHaveBeenCalledWith(expect.any(Blob), "ا ب ح 1234.pdf");
  });

  it("بيدوّر ⇒ «بيدوّر…»، مفيش ⇒ «—»، فشل ⇒ «تعذّر — دوس تاني»", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<CertCell state={{ s: "loading" }} />);
    expect(screen.getByText("بيدوّر…")).toBeTruthy();
    rerender(<CertCell state={{ s: "none" }} />);
    expect(screen.getByText("—")).toBeTruthy();
    rerender(<CertCell state={{ s: "error" }} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /تعذّر — دوس تاني/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("السوبر أدمن الأول (المالك يجرّب قبل الكل)", () => {
    expect(CERTS_IN_RESULTS_FOR_ALL).toBe(false);
  });
});

describe("🔴 التوصيل في الصفحات", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

  it("السيرفر: طلب واحد بكل اللوحات (POST) بتحقق دخول وحد", () => {
    const route = read("app/api/certificate/batch/route.ts");
    expect(route).toMatch(/export async function POST/);
    expect(route).toMatch(/verifySession\(/);
    expect(route).toMatch(/rateLimit\(/);
    expect(route).toMatch(/batchFindCertificates\(/);
  });

  it("صفحة الفرز: العمود في ٤ جداول (الداتا · السجلات · لصق داتا · لصق سجلات) بعد «رقم اللوحة»", () => {
    const s = read("app/(app)/sorting/page.tsx");
    expect(count(s, /\{certsOn && <th[^>]*>شهايد<\/th>\}/g)).toBe(4);
    expect(count(s, /<CertCell /g)).toBe(4);
    expect(s).toMatch(/const certsOn = useCertsEnabled\(\);/);
  });

  it("«فرز» بتاع «صوت فقط» والمطلوب", () => {
    const v = read("components/VoiceOnlySort.tsx");
    expect(count(v, /\{certsOn && <th[^>]*>شهايد<\/th>\}/g)).toBe(1);
    expect(count(v, /<CertCell /g)).toBe(1);
    const w = read("components/WantedResultsTable.tsx");
    expect(count(w, /\{certsOn && <th[^>]*>شهايد<\/th>\}/g)).toBe(1);
    expect(count(w, /<CertCell /g)).toBe(1);
  });
});
