/**
 * تنزيل داتا التدريب **مركزياً** من Supabase (كل المناديب) — للسوبر أدمن.
 *
 * ضمان «مافيش تكرار / الجديد بس»:
 *   • كل عيّنة عندها عمود downloaded_at في الجدول.
 *   • «تنزيل الجديد» بياخد بس اللي downloaded_at بتاعها = NULL، وبعد التنزيل
 *     بيعلّمها بتاريخ (downloaded_at = now) → المرة الجاية مش هتيجي تاني.
 *   • الداتا بتفضل على السيرفر كشبكة أمان؛ «مسح المُنزَّل» بيمسح المعلَّم بس.
 *   • id كل عيّنة ثابت (upsert) فحتى لو اتزامنت مرتين مبتتكررش.
 *
 * الدالة النقية buildCentralManifest قابلة للاختبار؛ باقي الدوال I/O (supabase lazy).
 */

export interface CentralSampleRow {
  id: string;
  session_id: string;
  plate: string;
  tier: string;
  reason: string;
  start_ms: number | null;
  end_ms: number | null;
  audio_path: string | null;
  agent_id: string | null;
  created_at: string;
}

export interface CentralPlate { plate: string; tier: string; startMs: number; endMs: number; reason: string; createdAt: string; }
export interface CentralSession { sessionId: string; audioPath: string | null; plates: CentralPlate[]; }
export interface CentralAgentGroup { agentId: string; sampleCount: number; sessions: CentralSession[]; }
export interface CentralManifest { count: number; agents: CentralAgentGroup[]; }

/** يبني بيان منظّم: مندوب → جلسات → لوحات (مرتّبة بالتوقيت). دالة نقية. */
export function buildCentralManifest(rows: CentralSampleRow[]): CentralManifest {
  const byAgent = new Map<string, Map<string, CentralSession>>();
  for (const r of rows) {
    const aid = r.agent_id || "unknown";
    if (!byAgent.has(aid)) byAgent.set(aid, new Map());
    const sessions = byAgent.get(aid)!;
    if (!sessions.has(r.session_id)) sessions.set(r.session_id, { sessionId: r.session_id, audioPath: r.audio_path ?? null, plates: [] });
    const sess = sessions.get(r.session_id)!;
    if (sess.audioPath == null && r.audio_path) sess.audioPath = r.audio_path;
    sess.plates.push({
      plate: r.plate, tier: r.tier, reason: r.reason,
      startMs: r.start_ms ?? 0, endMs: r.end_ms ?? 0, createdAt: r.created_at,
    });
  }
  const agents: CentralAgentGroup[] = [];
  for (const [agentId, sessions] of byAgent) {
    let sampleCount = 0;
    const list: CentralSession[] = [];
    for (const sess of sessions.values()) {
      sess.plates.sort((a, b) => a.startMs - b.startMs);
      sampleCount += sess.plates.length;
      list.push(sess);
    }
    agents.push({ agentId, sampleCount, sessions: list });
  }
  return { count: rows.length, agents };
}

// ── I/O (Supabase) — سوبر أدمن فقط عبر RLS ──────────────────────────────────

/** كل العيّنات اللي لسه ماتنزّلتش (downloaded_at IS NULL)، اختيارياً لمندوب واحد. */
export async function fetchPendingSamples(agentId?: string): Promise<CentralSampleRow[]> {
  const { supabase } = await import("./supabaseClient");
  let q = supabase.from("training_samples").select("*").is("downloaded_at", null).order("created_at", { ascending: true });
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CentralSampleRow[];
}

/** ملخّص المعلّق لكل مندوب: [{agentId, count}] — لعرض القائمة. */
export async function listPendingByAgent(): Promise<Array<{ agentId: string; count: number }>> {
  const rows = await fetchPendingSamples();
  const m = new Map<string, number>();
  for (const r of rows) { const a = r.agent_id || "unknown"; m.set(a, (m.get(a) ?? 0) + 1); }
  return [...m.entries()].map(([agentId, count]) => ({ agentId, count })).sort((a, b) => b.count - a.count);
}

/** ينزّل بايتات ملف صوت من الباكت (base64). null لو مش موجود. */
export async function fetchAudioBase64(path: string): Promise<{ base64: string; mimeType: string } | null> {
  const { supabase } = await import("./supabaseClient");
  const { data, error } = await supabase.storage.from("training-audio").download(path);
  if (error || !data) return null;
  const buf = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { base64: btoa(bin), mimeType: data.type || "audio/webm" };
}

/** يعلّم عيّنات إنها اتنزّلت (فمتيجيش في «الجديد» تاني). */
export async function markDownloaded(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { supabase } = await import("./supabaseClient");
  const stamp = new Date().toISOString();
  const { error } = await supabase.from("training_samples").update({ downloaded_at: stamp }).in("id", ids);
  if (error) throw new Error(error.message);
}

/** يمسح المُنزَّل (downloaded_at NOT NULL) من الجدول + صوته من الباكت. اختيارياً لمندوب. */
export async function purgeDownloaded(agentId?: string): Promise<{ deleted: number }> {
  const { supabase } = await import("./supabaseClient");
  let q = supabase.from("training_samples").select("*").not("downloaded_at", "is", null);
  if (agentId) q = q.eq("agent_id", agentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CentralSampleRow[];
  if (rows.length === 0) return { deleted: 0 };
  const paths = [...new Set(rows.map((r) => r.audio_path).filter((p): p is string => !!p))];
  if (paths.length) { try { await supabase.storage.from("training-audio").remove(paths); } catch { /* الصوت ممكن يكون اتمسح قبل كده */ } }
  const { error: delErr } = await supabase.from("training_samples").delete().in("id", rows.map((r) => r.id));
  if (delErr) throw new Error(delErr.message);
  return { deleted: rows.length };
}
