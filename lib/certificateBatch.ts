/**
 * 📄 **عمود «شهايد» قدام عربيات الفرز والمطلوب** (العميل).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «لو السيارة ليها شهاده تتحط في عمود هنضيفه اسمه شهايد…
 * يظهر قدامها كلمه شهاده بالازرق ولما المندوب يدوس عليها تفتحلو الشهادة». الأماكن:
 * نتيجة الفرز (الداتا والسجلات) · لصق نصي · «فرز» بتاع «صوت فقط» · المطلوب.
 *
 * الحالة بتتفتكر **على مستوى البرنامج** (مش الجدول) بمفتاح اللوحة الموحّد
 * (`plateCertKey` — عربي/إنجليزي/مسافات نفس المفتاح): اللوحة اللي اتسأل عنها مرة
 * مابتتسألش تاني في أي جدول ولا لما الفرز يتعاد. اللوحات الجديدة بتتبعت **في طلب
 * واحد** (مقسوم كل `CHUNK`) لـ`/api/certificate/batch` (`lib/certBatch.ts`).
 *
 * الحالات: loading («بيدوّر…») · found («شهادة» بالأزرق) · none («—») ·
 * error («تعذّر — دوس تاني» — درايف ماردّش، مش «مفيش شهادة»).
 */
import { useEffect, useMemo, useReducer, useState } from "react";
import { bankPlateToArabic } from "./plateParser";
import { plateCertKey } from "./certificateMatch";
import type { CertResult } from "./certificate";
// ⚠️ supabase/authHeader بيتحمّلوا وقت الحاجة بس (import ديناميكي) — الجداول اللي بتستورد
//    الملف ده (المطلوب مثلاً) ماكانتش بتلمس supabase، ومايصحّش استيرادها يجرّه معاه.

/**
 * 🔑 للكل؟ اتجرّب عند السوبر أدمن الأول (#366–#368)، والمالك قال «تمام كدة انشرها بقي
 * ل كل المناديب» (٤ أكتوبر ٢٠٢٦) ⇒ مفتوح لكل المناديب. false = السوبر أدمن بس.
 */
export const CERTS_IN_RESULTS_FOR_ALL = true;

/** أقصى لوحات في الطلب الواحد (السيرفر بيقبل لحد ٣٠٠). */
const CHUNK = 150;
/**
 * بعد المدة دي النتيجة (فيه/مفيش) بتتسأل تاني لما جدول يطلبها — شهادة اترفعت على
 * درايف والمندوب فاتح البرنامج من ساعات تظهر. وهي بتتحدّث الخانة بتفضل على نتيجتها.
 */
export const CERT_STATE_TTL_MS = 15 * 60_000;
/**
 * «ليها شهادة» بتتفتكر **يوم** (الشهادة مابتختفيش). وكله محفوظ على الموبايل — المالك
 * (٤ أكتوبر): «ليه بيأخر كتير علي ما بيدور علي الشهايد؟» — كل فتحة للبرنامج كانت بتسأل
 * عن كل العربيات من الأول؛ دلوقتي اللي اتعرف بيظهر على طول ويتحدّث في الخلفية لو قديم.
 */
export const CERT_FOUND_TTL_MS = 24 * 60 * 60_000;
const STORE_KEY = "ph:certStates:v1";
/** أقصى لوحات محفوظة على الموبايل (الأحدث بيكسب). */
const STORE_MAX = 3000;

export type CertState =
  | { s: "loading" }
  | { s: "found"; cert: CertResult; count: number }
  | { s: "none" }
  | { s: "error" };

/** مفتاح اللوحة الموحّد — نفس مفتاح مطابقة أسماء الشهادات على السيرفر. */
export function certKey(plate: string): string {
  return plateCertKey(bankPlateToArabic(String(plate ?? "").trim()));
}

const states = new Map<string, CertState>();
/** إمتى اتسأل عن كل لوحة آخر مرة (للمدة `CERT_STATE_TTL_MS`). */
const askedAt = new Map<string, number>();
const listeners = new Set<() => void>();

type Saved = { s: "found"; id: string; name: string; count: number; at: number } | { s: "none"; at: number };
let hydrated = false;
/** أول استخدام: اللي اتحفظ على الموبايل («ليها»/«مالهاش» — «تعذّر» مابتتحفظش). */
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const obj = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as Record<string, Saved>;
    for (const [k, v] of Object.entries(obj)) {
      if (!v || typeof v.at !== "number" || states.has(k)) continue;
      if (v.s === "found" && typeof v.id === "string") {
        states.set(k, { s: "found", cert: { id: v.id, name: String(v.name ?? ""), link: null }, count: Number(v.count) || 1 });
      } else if (v.s === "none") {
        states.set(k, { s: "none" });
      } else continue;
      askedAt.set(k, v.at);
    }
  } catch { /* بايظ/مقفول — نبدأ من غير */ }
}
function persist(): void {
  try {
    const rows = [...states.entries()].filter(([k, st]) => (st.s === "found" || st.s === "none") && askedAt.has(k));
    rows.sort((a, b) => (askedAt.get(b[0]) ?? 0) - (askedAt.get(a[0]) ?? 0));
    const out: Record<string, Saved> = {};
    for (const [k, st] of rows.slice(0, STORE_MAX)) {
      const at = askedAt.get(k) as number;
      out[k] = st.s === "found" ? { s: "found", id: st.cert.id, name: st.cert.name, count: st.count, at } : { s: "none", at };
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch { /* تخزين مليان/مقفول — الذاكرة كفاية */ }
}

function notify(): void {
  for (const l of [...listeners]) { try { l(); } catch { /* مستمع واحد مايوقّفش الباقي */ } }
}

export function clearCertStates(): void {
  states.clear();
  askedAt.clear();
  hydrated = true;
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  notify();
}

export function getCertState(plate: string): CertState | undefined {
  hydrate();
  const k = certKey(plate);
  return k ? states.get(k) : undefined;
}

export function subscribeCertStates(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function postBatch(keys: string[]): Promise<void> {
  try {
    const { authHeader } = await import("./authHeader");
    const res = await fetch("/api/certificate/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ plates: keys }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const d = (await res.json()) as { results?: Record<string, { id: string; name: string }[]>; failed?: string[] };
    const failed = new Set(d.failed ?? []);
    for (const k of keys) {
      const hits = d.results?.[k];
      if (failed.has(k) || !Array.isArray(hits)) states.set(k, { s: "error" });
      else if (hits.length) states.set(k, { s: "found", cert: { id: hits[0].id, name: hits[0].name, link: null }, count: hits.length });
      else states.set(k, { s: "none" });
    }
  } catch {
    for (const k of keys) states.set(k, { s: "error" });
  }
  persist();
  notify();
}

/** يسأل عن اللوحات اللي لسه ماتسألش عنها (أو نتيجتها قديمة) — طلب واحد (مقسوم) للكل. */
export function requestCertificates(plates: readonly string[], now: number = Date.now()): void {
  hydrate();
  const keys = [...new Set(plates.map(certKey).filter(Boolean))].filter((k) => {
    const st = states.get(k);
    if (!st) return true;
    if (st.s === "loading") return false;
    const ttl = st.s === "found" ? CERT_FOUND_TTL_MS : CERT_STATE_TTL_MS;
    return now - (askedAt.get(k) ?? 0) > ttl;
  });
  if (!keys.length) return;
  for (const k of keys) {
    if (!states.has(k)) states.set(k, { s: "loading" });   // القديمة بتفضل ظاهرة وهي بتتحدّث
    askedAt.set(k, now);
  }
  notify();
  for (let i = 0; i < keys.length; i += CHUNK) void postBatch(keys.slice(i, i + CHUNK));
}

/** «تعذّر — دوس تاني». */
export function retryCertificate(plate: string): void {
  const k = certKey(plate);
  if (!k) return;
  states.delete(k);
  requestCertificates([k]);
}

/**
 * حالات شهايد لوحات الجدول. بيسأل عن الجديدة بس ويعيد الرسم لما ترد.
 * `enabled = false` ⇒ مابيسألش وبيرجّع undefined (العمود مخفي).
 */
export function useCertStates(plates: readonly string[], enabled: boolean): (plate: string) => CertState | undefined {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeCertStates(bump), []);
  const sig = useMemo(
    () => (enabled ? [...new Set(plates.map(certKey).filter(Boolean))].sort().join("|") : ""),
    [plates, enabled],
  );
  useEffect(() => { if (sig) requestCertificates(sig.split("|")); }, [sig]);
  return (plate: string) => (enabled ? getCertState(plate) ?? { s: "loading" } : undefined);
}

let superPromise: Promise<boolean> | null = null;
function fetchIsSuper(): Promise<boolean> {
  if (!superPromise) {
    superPromise = (async () => {
      try {
        const { supabase } = await import("./supabaseClient");
        const { data } = await supabase.auth.getUser();
        const id = data.user?.id;
        if (!id) { superPromise = null; return false; }   // الجلسة لسه مش جاهزة ⇒ نسأل تاني بعدين
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", id).single();
        return !!(prof as { is_super?: boolean } | null)?.is_super;
      } catch {
        superPromise = null;
        return false;
      }
    })();
  }
  return superPromise;
}

/** العمود ظاهر؟ — للكل لو `CERTS_IN_RESULTS_FOR_ALL`، وإلا للسوبر أدمن بس. */
export function useCertsEnabled(): boolean {
  const [on, setOn] = useState<boolean>(CERTS_IN_RESULTS_FOR_ALL);
  useEffect(() => {
    if (CERTS_IN_RESULTS_FOR_ALL) return;
    let alive = true;
    void fetchIsSuper().then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);
  return on;
}
