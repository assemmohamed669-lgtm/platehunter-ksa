/**
 * تجهيز داتا التدريب للتنزيل — بيحوّل العيّنات + الجلسات لبيان (manifest) منظّم:
 *   • كل جلسة صوت + اللوحات الصح اللي فيها (مرتّبة بتوقيتها).
 *   • اسم ملف صوت لكل جلسة (بالامتداد الصح حسب نوع الصوت).
 * دالة نقية قابلة للاختبار — التنزيل الفعلي (Blob/anchor) بيتعمل في الصفحة.
 */
import type { TrainingSample, TrainingSession } from "./trainingStore";

/**
 * اسم ملف آمن على ويندوز — يشيل المحارف الممنوعة (\ / : * ? " < > |) والمسافات،
 * ويسيب الحروف العربية والإنجليزية والأرقام والنقط والشرطات. فاضي → "unknown".
 */
export function sanitizeFileName(s: string): string {
  const cleaned = (s || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "unknown";
}

/** طابع زمني متسلسل YYYYMMDD-HHMMSS من تاريخ — يخلّي كل تنزيل اسمه فريد ومرتّب. */
export function fileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * بادئة اسم ملفات تدريب مندوب لتنزيل معيّن: «<اسم آمن>-<طابع زمني>».
 * فريدة لكل تنزيل (الطابع الزمني) ومميّزة لكل مندوب (الاسم) — فأسماء الملفات
 * (اللوحات + الصوت) ماتتكررش أبداً عبر التنزيلات ولا بين المناديب.
 */
export function trainingFilePrefix(username: string, d: Date): string {
  return `${sanitizeFileName(username)}-${fileStamp(d)}`;
}

export function mimeToExt(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("m4a") || m.includes("mp4") || m.includes("aac")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "webm";
}

export interface ManifestPlate {
  plate: string;
  tier: string;
  reason: string;
  startMs: number;
  endMs: number;
  createdAt: string;
}
export interface ManifestSession {
  sessionId: string;
  audioFile: string;
  mimeType: string;
  agentId: string;
  plates: ManifestPlate[];
}
export interface TrainingManifest {
  count: number;        // إجمالي اللوحات
  sessionCount: number; // عدد الجلسات
  sessions: ManifestSession[];
}

export function buildTrainingManifest(samples: TrainingSample[], sessions: TrainingSession[]): TrainingManifest {
  const sessById = new Map(sessions.map((s) => [s.sessionId, s]));
  const bySession = new Map<string, ManifestPlate[]>();
  for (const s of samples) {
    const arr = bySession.get(s.sessionId) ?? [];
    arr.push({ plate: s.plate, tier: s.tier, reason: s.reason, startMs: s.startMs, endMs: s.endMs, createdAt: s.createdAt });
    bySession.set(s.sessionId, arr);
  }
  const out: ManifestSession[] = [];
  for (const [sid, plates] of bySession) {
    const sess = sessById.get(sid);
    const mimeType = sess?.mimeType ?? "audio/webm";
    plates.sort((a, b) => a.startMs - b.startMs);
    out.push({ sessionId: sid, audioFile: `${sid}.${mimeToExt(mimeType)}`, mimeType, agentId: sess?.agentId ?? "", plates });
  }
  return { count: samples.length, sessionCount: out.length, sessions: out };
}
