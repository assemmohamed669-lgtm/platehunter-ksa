/**
 * 🗂️ داتا لكل عضو — **مسئول المجموعة** (المالك ١٥ أكتوبر ٢٠٢٦ — `lib/memberData.ts`).
 *
 * GET  /api/group/member-data?team=…  → أعضاء المجموعة دي بس وملف كل واحد.
 * POST /api/group/member-data          Body: { action: "upload-url" | "commit" | "clear", team, agentId, fileName?, path?, rowCount?, plateCount? }
 *
 * الحماية على السيرفر: مسئول المجموعة دي (وصفحته مفتوحة) أو السوبر أدمن، والعضو لازم يكون من المجموعة، والمسار محسوب هنا
 * (`planMemberAction`). الرفع بلينك مؤقت للمسار ده بس. الجدول والمخزن: `docs/sql/member-data.sql`.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { leaderAccess, planMemberAction, MEMBER_DATA_BUCKET } from "@/lib/memberData";

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
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /member_data_files/.test(e.message ?? ""));

async function guard(req: NextRequest, team: string) {
  const who = await caller(req);
  if (!who) return { res: NextResponse.json({ error: "مفيش جلسة." }, { status: 401 }) };
  if (!team) return { res: NextResponse.json({ error: "المجموعة مطلوبة." }, { status: 400 }) };
  const { data: g } = await supabaseAdmin.from("group_settings").select("team, leader_id, leader_page_enabled").eq("team", team).maybeSingle();
  if (!leaderAccess(g as { leader_id?: string | null; leader_page_enabled?: boolean | null } | null, who.uid, who.isSuper)) {
    return { res: NextResponse.json({ error: "دي لمسئول المجموعة بس." }, { status: 403 }) };
  }
  return { who };
}

export async function GET(req: NextRequest) {
  const team = String(req.nextUrl.searchParams.get("team") ?? "").trim();
  const g = await guard(req, team);
  if ("res" in g) return g.res;
  const members = await membersOf(team);
  const { data, error } = await supabaseAdmin.from("member_data_files")
    .select("agent_id, file_name, updated_at, row_count, plate_count").eq("team", team);
  const files = new Map(((data ?? []) as { agent_id: string; file_name: string; updated_at: string; row_count: number | null; plate_count: number | null }[])
    .map((f) => [f.agent_id, { fileName: f.file_name, updatedAt: f.updated_at, rowCount: f.row_count, plateCount: f.plate_count }]));
  return NextResponse.json({
    rows: members.map((m) => ({ agentId: m.id, username: m.username, file: files.get(m.id) ?? null })),
    missing: isMissing(error),
  });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const team = String(b.team ?? "").trim();
  const g = await guard(req, team);
  if ("res" in g) return g.res;
  const plan = planMemberAction(b, (await membersOf(team)).map((m) => m.id));
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });
  const bucket = supabaseAdmin.storage.from(MEMBER_DATA_BUCKET);

  if (plan.action === "upload-url") {
    const { data, error } = await bucket.createSignedUploadUrl(plan.path, { upsert: true });
    if (error || !data) return NextResponse.json({ error: error?.message ?? "تعذّر تجهيز الرفع." }, { status: 400 });
    return NextResponse.json({ path: data.path, token: data.token });
  }

  const { data: old } = await supabaseAdmin.from("member_data_files").select("path").eq("team", team).eq("agent_id", plan.agentId).maybeSingle();
  const oldPath = (old as { path?: string } | null)?.path ?? null;

  if (plan.action === "clear") {
    if (oldPath) await bucket.remove([oldPath]);
    const { error } = await supabaseAdmin.from("member_data_files").delete().eq("team", team).eq("agent_id", plan.agentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // commit — الملف الجديد بيستبدل القديم (لو امتداده اتغيّر، القديم بيتشال)
  const { error } = await supabaseAdmin.from("member_data_files").upsert({
    team, agent_id: plan.agentId, path: plan.path, file_name: plan.fileName,
    row_count: plan.rowCount, plate_count: plan.plateCount,
    updated_at: new Date().toISOString(), updated_by: g.who.uid,
  }, { onConflict: "team,agent_id" });
  if (error) return NextResponse.json({ error: isMissing(error) ? "محتاج خطوة على Supabase الأول (member-data.sql)." : error.message }, { status: 400 });
  if (oldPath && oldPath !== plan.path) await bucket.remove([oldPath]);
  return NextResponse.json({ ok: true });
}
