/**
 * 🔒 **قايمة المختارين للشهايد الخاصة** (`cert_private_access` — `docs/sql/cert-private.sql`) — السيرفر بس.
 *
 * السوبر أدمن بيضيف/يشيل مندوبين بالاسم، ولكل واحد «الجديد بس» أو «الجديد والقديم» (`lib/certPrivate.ts`).
 * أي غلط في القراية (الجدول لسه ماتعملش · الداتابيز ماردّتش) ⇒ «مش في القايمة» = كل حد زي دلوقتي بالظبط.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import { parseAccessMode, type CertAccessMode } from "./certPrivate";

const TABLE = "cert_private_access";

/** وضع المندوب — أو null لو مش في القايمة (أو القراية فشلت). */
export async function certAccessOf(userId: string): Promise<CertAccessMode | null> {
  try {
    const { data, error } = await supabaseAdmin.from(TABLE).select("mode").eq("agent_id", userId).maybeSingle();
    if (error) return null;
    return parseAccessMode((data as { mode?: unknown } | null)?.mode);
  } catch {
    return null;
  }
}

/** كل المختارين بوضعهم (للإشعار) — فاضية لو القراية فشلت. */
export async function certAccessMap(): Promise<Map<string, CertAccessMode>> {
  const out = new Map<string, CertAccessMode>();
  try {
    const { data, error } = await supabaseAdmin.from(TABLE).select("agent_id, mode");
    if (error) return out;
    for (const r of (data ?? []) as { agent_id?: string; mode?: unknown }[]) {
      const m = parseAccessMode(r.mode);
      if (r.agent_id && m) out.set(r.agent_id, m);
    }
  } catch { /* فاضية */ }
  return out;
}

export interface CertAccessRow { agent_id: string; mode: CertAccessMode; added_at: string }

/** القايمة للسوبر أدمن (بترمي لو الجدول ناقص — الصفحة بتقول «محتاج خطوة على سوبابيز»). */
export async function listCertAccess(): Promise<CertAccessRow[]> {
  const { data, error } = await supabaseAdmin.from(TABLE).select("agent_id, mode, added_at").order("added_at", { ascending: true });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return ((data ?? []) as { agent_id: string; mode: unknown; added_at: string }[])
    .map((r) => ({ agent_id: r.agent_id, mode: parseAccessMode(r.mode) ?? "both", added_at: r.added_at }));
}

export async function setCertAccess(agentId: string, mode: CertAccessMode, by: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLE)
    .upsert({ agent_id: agentId, mode, added_by: by, updated_at: new Date().toISOString() }, { onConflict: "agent_id" });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}

export async function removeCertAccess(agentId: string): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLE).delete().eq("agent_id", agentId);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}
