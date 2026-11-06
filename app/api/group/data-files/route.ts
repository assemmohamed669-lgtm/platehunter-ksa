/**
 * 📂 ملفات داتا من مسئول المجموعة — **المسئول** (المالك ٦ نوفمبر ٢٠٢٦ — `lib/groupDataFiles.ts`).
 *
 * GET  /api/group/data-files?team=…  → ملفات المجموعة دي + أعضاؤها (عشان يختار مين يشوف إيه).
 * POST /api/group/data-files          Body: { action: "upload-url" | "commit" | "audience" | "delete", team, id?, fileName?,
 *                                            path?, rowCount?, plateCount?, audience?, memberIds? }
 *
 * الحماية على السيرفر: مسئول المجموعة دي (وصفحته مفتوحة) أو السوبر أدمن · الملف من المجموعة دي · الأعضاء منها · المسار
 * محسوب هنا · رقم الملف الجديد من هنا (`planGroupFileAction`). الجدول: `docs/sql/group-data-files.sql`.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { leaderAccess } from "@/lib/memberData";
import { planGroupFileAction, GROUP_FILES_BUCKET, type GroupFileMeta } from "@/lib/groupDataFiles";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

async function caller(req: NextRequest): Promise<{ uid: string; isSuper: boolean } | null> {
  const h = req.headers.get("authorization") ?? "";
  const jwt = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!jwt) return null;
  const { data } = await supabaseAdmin.auth.getUser(jwt);
  const uid = data.user?.id;
  if (!uid) return null;
  const { data: p } = await supabaseAdmin.from("profiles").select("is_super, is_active").eq("id", uid).maybeSingle();
  const prof = p as { is_super?: boolean; is_active?: boolean } | null;
  if (prof?.is_active === false) return null;
  return { uid, isSuper: prof?.is_super === true };
}

async function membersOf(team: string): Promise<{ id: string; username: string | null }[]> {
  const tm = await supabaseAdmin.from("team_members").select("agent_id").eq("team", team);
  const ids = tm.error
    ? ((await supabaseAdmin.from("profiles").select("id").eq("team", team)).data ?? []).map((r: { id: string }) => r.id)
    : (tm.data ?? []).map((r: { agent_id: string }) => r.agent_id);
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin.from("profiles").select("id, username").in("id", ids);
  return ((data ?? []) as { id: string; username: string | null }[]).sort((a, b) => (a.username ?? "").localeCompare(b.username ?? "", "ar"));
}

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /group_data_files/.test(e.message ?? ""));
const MISSING_MSG = "محتاج خطوة على Supabase الأول (group-data-files.sql).";

async function guard(req: NextRequest, team: string) {
  const who = await caller(req);
  if (!who) return { res: NextResponse.json({ error: "مفيش جلسة." }, { status: 401 }) };
  if (!team) return { res: NextResponse.json({ error: "المجموعة مطلوبة." }, { status: 400 }) };
  const { data: g } = await supabaseAdmin.from("group_settings").select("team, leader_id, leader_page_enabled").eq("team", team).maybeSingle();
  const group = g as { leader_id?: string | null; leader_page_enabled?: boolean | null } | null;
  if (!leaderAccess(group, who.uid, who.isSuper)) {
    return { res: NextResponse.json({ error: "دي لمسئول المجموعة بس." }, { status: 403 }) };
  }
  return { who, leaderId: group?.leader_id ?? null };
}

type FileRow = {
  id: string; path: string; file_name: string; updated_at: string; row_count: number | null; plate_count: number | null;
  audience: "all" | "members"; member_ids: string[] | null;
};
const toMeta = (f: FileRow): GroupFileMeta => ({
  id: f.id, fileName: f.file_name, updatedAt: f.updated_at, rowCount: f.row_count, plateCount: f.plate_count,
  audience: f.audience === "members" ? "members" : "all", memberIds: f.member_ids ?? [],
});

export async function GET(req: NextRequest) {
  const team = String(req.nextUrl.searchParams.get("team") ?? "").trim();
  const g = await guard(req, team);
  if ("res" in g) return g.res;
  const members = await membersOf(team);
  const { data, error } = await supabaseAdmin.from("group_data_files")
    .select("id, path, file_name, updated_at, row_count, plate_count, audience, member_ids")
    .eq("team", team).order("created_at", { ascending: true });
  return NextResponse.json({
    files: ((data ?? []) as FileRow[]).map(toMeta),
    members,
    leaderId: g.leaderId,
    missing: isMissing(error),
  });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const team = String(b.team ?? "").trim();
  const g = await guard(req, team);
  if ("res" in g) return g.res;

  const { data: existing, error: le } = await supabaseAdmin.from("group_data_files").select("id, path").eq("team", team);
  if (le) return NextResponse.json({ error: isMissing(le) ? MISSING_MSG : le.message }, { status: 400 });
  const rows = (existing ?? []) as { id: string; path: string }[];
  const plan = planGroupFileAction(b, {
    team, memberIds: (await membersOf(team)).map((m) => m.id), existingIds: rows.map((r) => r.id), newId: randomUUID(),
  });
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });
  const bucket = supabaseAdmin.storage.from(GROUP_FILES_BUCKET);
  const oldPath = rows.find((r) => r.id === (plan as { id?: string }).id)?.path ?? null;

  if (plan.action === "upload-url") {
    const { data, error } = await bucket.createSignedUploadUrl(plan.path, { upsert: true });
    if (error || !data) return NextResponse.json({ error: error?.message ?? "تعذّر تجهيز الرفع." }, { status: 400 });
    return NextResponse.json({ id: plan.id, path: data.path, token: data.token });
  }

  if (plan.action === "delete") {
    if (oldPath) await bucket.remove([oldPath]);
    const { error } = await supabaseAdmin.from("group_data_files").delete().eq("team", team).eq("id", plan.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();
  if (plan.action === "audience") {
    const { error } = await supabaseAdmin.from("group_data_files")
      .update({ audience: plan.audience, member_ids: plan.memberIds, updated_by: g.who.uid })
      .eq("team", team).eq("id", plan.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // commit — ملف جديد أو ملف اتغيّر (لو امتداده اتغيّر القديم بيتشال)
  const fields = {
    path: plan.path, file_name: plan.fileName, row_count: plan.rowCount, plate_count: plan.plateCount,
    audience: plan.audience, member_ids: plan.memberIds, updated_at: now, updated_by: g.who.uid,
  };
  const { error } = plan.isNew
    ? await supabaseAdmin.from("group_data_files").insert({ id: plan.id, team, ...fields })
    : await supabaseAdmin.from("group_data_files").update(fields).eq("team", team).eq("id", plan.id);
  if (error) return NextResponse.json({ error: isMissing(error) ? MISSING_MSG : error.message }, { status: 400 });
  if (oldPath && oldPath !== plan.path) await bucket.remove([oldPath]);
  return NextResponse.json({ ok: true });
}
