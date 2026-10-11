/**
 * 🧭 «إدارة مجموعتي» — مسئول المجموعة بيغيّر إعدادات مجموعته بنفسه (المالك ١١ أكتوبر ٢٠٢٦).
 *
 * GET  /api/group/leader-settings → المجموعات اللي أنا مسئولها والسوبر أدمن فاتحلي صفحتها + أعضاءها + إعداداتها
 * POST /api/group/leader-settings  Body: { team, notifyMode?, notifyMemberIds?, findsLeaderOnly?, shareRecords?,
 *                                          sharedCheck?, lockSort?, lockDownload?, lockEdit? }
 *
 * الحماية على السيرفر: لازم أكون `leader_id` للمجموعة **و** `leader_page_enabled` مفتوح. اللي يتغيّر = القايمة البيضا
 * في `lib/leaderSettings.ts` بس (الأعضاء والمسئول والباقي للسوبر أدمن من صفحة المجموعات).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { leaderSettingsPatch, leaderView } from "@/lib/leaderSettings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

async function caller(req: NextRequest): Promise<string | null> {
  const h = req.headers.get("authorization") ?? "";
  const jwt = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!jwt) return null;
  const { data } = await supabaseAdmin.auth.getUser(jwt);
  return data.user?.id ?? null;
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

export async function GET(req: NextRequest) {
  const uid = await caller(req);
  if (!uid) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("group_settings").select("*").eq("leader_id", uid);
  if (error) return NextResponse.json({ groups: [] });
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => r.leader_page_enabled === true);
  const groups = await Promise.all(rows.map(async (r) => ({
    team: String(r.team),
    settings: leaderView(r),
    members: await membersOf(String(r.team)),
  })));
  const { data: me } = await supabaseAdmin.from("profiles").select("team").eq("id", uid).maybeSingle();
  return NextResponse.json({ groups, activeTeam: (me as { team?: string | null } | null)?.team ?? null, me: uid });
}

export async function POST(req: NextRequest) {
  const uid = await caller(req);
  if (!uid) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const team = String(b.team ?? "").trim();
  if (!team) return NextResponse.json({ error: "المجموعة مطلوبة." }, { status: 400 });

  const { data: row } = await supabaseAdmin.from("group_settings").select("*").eq("team", team).maybeSingle();
  const r = row as Record<string, unknown> | null;
  if (!r || r.leader_id !== uid || r.leader_page_enabled !== true) {
    return NextResponse.json({ error: "الصفحة دي لمسئول المجموعة بس (والإدارة لازم تكون فاتحاها)." }, { status: 403 });
  }
  const members = (await membersOf(team)).map((m) => m.id);
  const patch = leaderSettingsPatch(b, members);
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, settings: leaderView(r) });

  const { data: upd, error } = await supabaseAdmin.from("group_settings")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: uid })
    .eq("team", team).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, settings: leaderView(upd as Record<string, unknown>) });
}
