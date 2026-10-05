/**
 * 📄 «شهايد النهارده» بيفرز على أنهي داتا — بنفس قواعد صفحة الفرز.
 *
 *  · `sorting` (صفحة المطلوب) = داتا صفحة الفرز: الأساسي (كبير على الجهاز أو صغير في سجله) +
 *    داتا المجموعة للعضو (المسئول الملف عنده في المربع الأساسي، فإضافتها هتكرّر كل عربية) +
 *    كل مربعات الداتا الإضافية بالترتيب لحد أول مربع فاضي.
 *    الإضافي الكبير/متعدد الورقات سجله فيه **عيّنة ٥٠ صف بس** والصفوف كلها على الجهاز
 *    (`streamSlot`) — فلازم يتقري من هناك. ده اللي كان مخلّي «الداتا الإضافية مش بتتفرز».
 *  · `team` (تبويب «شهايد» لمشتركين الصوت فقط) = داتا المجموعة — مالهمش صفحة الفرز. لو فيه نسخة
 *    أحدث بتنزل زي تبويب «فرز» بتاعهم.
 */
import type { CertDataSource } from "./dailyCertSort";
import { TEAM_DATA_SLOT, needsTeamDataRefresh, type TeamDataRole } from "./teamData";

type Row = Record<string, string>;

export interface CertSourceRec {
  headers: string[];
  rows: Row[];
  streamed?: boolean;
  streamSlot?: string;
  uploadedAt?: string;
}
export interface TeamFileRef { path: string; fileName: string; updatedAt: string }

export interface CertSourceDeps {
  getUploadedFile(agentId: string, slot: string): Promise<CertSourceRec | null>;
  getDataMeta(slot: string): Promise<{ headers: string[]; plateCol: string } | null>;
  getSampleRows(n: number, slot: string): Promise<Row[]>;
  teamState(): Promise<{ role: TeamDataRole; file: TeamFileRef | null }>;
  /** تنزيل داتا المجموعة الأحدث وحفظها (مشتركين الصوت فقط). null = فشل. */
  refreshTeamData?(file: TeamFileRef): Promise<{ headers: string[]; rows: Row[] } | null>;
}

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

/** ملف على الجهاز (`slot`) ⇒ مصدر بيتقري دفعات. قاعدته اتمسحت ⇒ null. */
async function streamSource(slot: string, d: CertSourceDeps): Promise<CertDataSource | null> {
  const meta = await safe(d.getDataMeta(slot), null);
  if (!meta) return null;
  const sample = await safe(d.getSampleRows(50, slot), [] as Row[]);
  return { kind: "stream", slot, headers: meta.headers, sample, plateCol: meta.plateCol || null };
}

/** داتا المجموعة اللي على الجهاز (الكبيرة متخزّنة دفعات في نفس السلوت). */
async function localTeamSource(local: CertSourceRec | null, d: CertSourceDeps): Promise<CertDataSource | null> {
  if (!local) return null;
  return (await streamSource(TEAM_DATA_SLOT, d)) ?? { kind: "mem", headers: local.headers, rows: local.rows, ref: TEAM_DATA_SLOT };
}

export async function collectCertDataSources(variant: "sorting" | "team", d: CertSourceDeps): Promise<CertDataSource[]> {
  const out: CertDataSource[] = [];
  const team = await safe(d.teamState(), { role: "off" as TeamDataRole, file: null });
  const teamLocal = team.role !== "off" && team.file ? await safe(d.getUploadedFile("local", TEAM_DATA_SLOT), null) : null;

  if (variant === "team") {
    if (team.role === "off" || !team.file) return out;
    const fresh = !!teamLocal && !needsTeamDataRefresh(teamLocal.uploadedAt ?? null, team.file.updatedAt);
    if (!fresh && d.refreshTeamData) {
      const t = await safe(d.refreshTeamData(team.file), null);
      if (t) { out.push({ kind: "mem", headers: t.headers, rows: t.rows, ref: TEAM_DATA_SLOT }); return out; }
    }
    const s = await localTeamSource(teamLocal, d);   // التنزيل فشل ⇒ القديمة أحسن من مفيش
    if (s) out.push(s);
    return out;
  }

  // (١) الأساسي: الكبير على الجهاز، وإلا اللي في سجله
  const big = await streamSource("data", d);
  if (big) out.push(big);
  else {
    const rec = await safe(d.getUploadedFile("local", "data"), null);
    if (rec) out.push({ kind: "mem", headers: rec.headers, rows: rec.rows, ref: "data" });
  }
  // (٢) داتا المجموعة — للعضو بس
  if (team.role === "member") {
    const s = await localTeamSource(teamLocal, d);
    if (s) out.push(s);
  }
  // (٣) الإضافي (data-2, data-3…)
  for (let n = 2; n < 100; n++) {
    const rec = await safe(d.getUploadedFile("local", `data-${n}`), null);
    if (!rec) break;
    if (rec.streamed && rec.streamSlot) {
      const s = await streamSource(rec.streamSlot, d);
      if (s) out.push(s);
      continue;
    }
    out.push({ kind: "mem", headers: rec.headers, rows: rec.rows, ref: `data-${n}` });
  }
  return out;
}
