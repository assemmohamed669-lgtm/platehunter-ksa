/**
 * /api/admin/cert-private — 🔒 **الشهايد الخاصة**: لوحة التحكّم — **السوبر أدمن بس**.
 *
 * المالك (١٧ نوفمبر ٢٠٢٦): «انا بس ك سوبر ادمن عندي الصلاحيه اختار حد معين من المشتركين هو فقط او مجموعه هما
 * فقط اللي يشوفو ويظهرهم الاشعارات والاكسيل بتاع الشهادات دي». قراراته: الاختيار **بالاسم** (يضيف ويشيل) ولكل واحد
 * «الجديد بس» أو «الجديد والقديم» (`lib/certPrivate.ts`).
 *
 *  · GET            ⇒ `{ configured, setup?, today, members: [{agentId, name, team, mode}] }`
 *  · GET `?q=اسم`   ⇒ `{ matches: [{agentId, name, team}] }` (أول ٢٠)
 *  · POST `{ action: "add" | "mode", agentId, mode }` · `{ action: "remove", agentId }`
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, verifyAdminContext } from "@/lib/supabaseAdmin";
import { listCertAccess, setCertAccess, removeCertAccess } from "@/lib/certAccessStore";
import { countDayCerts } from "@/lib/certDailyStore";
import { privateDriveConfigured } from "@/lib/gdrive";
import { parseAccessMode, CERT_SOURCE_TABLES } from "@/lib/certPrivate";
import { riyadhDayStart } from "@/lib/certDaily";
import { likeExact } from "@/lib/certPush";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "private, no-store" };
const isMissingTable = (e: unknown) => /42P01|PGRST205|does not exist/.test(`${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? ""}`);

async function superOnly(req: NextRequest) {
  const admin = await verifyAdminContext(req.headers.get("authorization"));
  return admin?.isSuper ? admin : null;
}

export async function GET(req: NextRequest) {
  if (!(await superOnly(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 🔎 البحث بالاسم
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q) {
    const { data, error } = await supabaseAdmin.from("profiles").select("id, username, team")
      .ilike("username", `%${likeExact(q)}%`).order("username", { ascending: true }).limit(20);
    if (error) return NextResponse.json({ error: "db_failed" }, { status: 502 });
    const matches = ((data ?? []) as { id: string; username: string | null; team: string | null }[])
      .map((p) => ({ agentId: p.id, name: p.username ?? "", team: p.team ?? null }));
    return NextResponse.json({ matches }, { headers: NO_STORE });
  }

  const configured = privateDriveConfigured();
  let rows;
  try {
    rows = await listCertAccess();
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ configured, setup: true, today: null, members: [] }, { headers: NO_STORE });
    return NextResponse.json({ error: "db_failed" }, { status: 502 });
  }
  const ids = rows.map((r) => r.agent_id);
  const names = new Map<string, { name: string; team: string | null }>();
  if (ids.length) {
    const { data } = await supabaseAdmin.from("profiles").select("id, username, team").in("id", ids);
    for (const p of (data ?? []) as { id: string; username: string | null; team: string | null }[]) {
      names.set(p.id, { name: p.username ?? "", team: p.team ?? null });
    }
  }
  const members = rows.map((r) => ({
    agentId: r.agent_id, name: names.get(r.agent_id)?.name ?? "", team: names.get(r.agent_id)?.team ?? null, mode: r.mode,
  }));
  const today = await countDayCerts(riyadhDayStart(new Date()).day, CERT_SOURCE_TABLES.private).catch(() => null);
  return NextResponse.json({ configured, today, members }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const admin = await superOnly(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { action?: unknown; agentId?: unknown; mode?: unknown };
  const agentId = typeof body.agentId === "string" && /^[0-9a-f-]{1,64}$/i.test(body.agentId) ? body.agentId : "";
  if (!agentId) return NextResponse.json({ error: "bad_agent" }, { status: 400 });

  try {
    if (body.action === "add" || body.action === "mode") {
      const mode = parseAccessMode(body.mode);
      if (!mode) return NextResponse.json({ error: "bad_mode" }, { status: 400 });
      await setCertAccess(agentId, mode, admin.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "remove") {
      await removeCertAccess(agentId);
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: "setup" }, { status: 409 });
    return NextResponse.json({ error: "db_failed" }, { status: 502 });
  }
  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
