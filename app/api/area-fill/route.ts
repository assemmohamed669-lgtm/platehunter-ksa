/**
 * 📍 «املأ الحي والشارع» للسجلات اللي اتصدّرت من غير حي — `lib/areaBackfill.ts`.
 *
 * POST /api/area-fill
 *   { action: "scan",  agentId?, after? }        → سجلات المندوب اللي **ليها موقع ومن غير حي** (رقم + موقع بس) على صفحات
 *   { action: "apply", agentId?, items: [...] }  → يضيف الحي على `extra` (العمود بتاع مصدر السجل) ومابيلمسش أي حاجة تانية
 *
 *  · السوبر أدمن ⇒ أي مندوب بالـID بتاعه. غيره ⇒ سجلاته هو بس، ولما الزرار يتفتح للكل (`AREA_FILL_FOR_ALL`).
 *  · كل تحديث مقفول على (المعرّف، المندوب) ⇒ سجل مندوب تاني مستحيل يتلمس حتى لو رقمه اتبعت.
 *  · السيرفر بيختم `updated_at` لوحده (docs/sql/field-checks-updated-at.sql) ⇒ موبايل المندوب بينزّل الحي أول ما يفتح التشييك.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AREA_FILL_FOR_ALL, applyAreaFill, coordNum, needsAreaFill } from "@/lib/areaBackfill";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/** صفحة البحث (سجلات بتتقري في المرة). */
const SCAN_PAGE = 1000;
/** أقصى سجلات في دفعة حفظ واحدة. */
const APPLY_MAX = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clip = (v: unknown, n = 160) => String(v ?? "").trim().slice(0, n);
const bad = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  const jwt = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!jwt) return bad(401, "مفيش جلسة — سجّل دخول الأول.");
  const { data: u } = await supabaseAdmin.auth.getUser(jwt);
  const uid = u?.user?.id;
  if (!uid) return bad(401, "الجلسة انتهت — سجّل خروج ودخول وجرّب تاني.");

  const { data: me } = await supabaseAdmin.from("profiles").select("role, is_super, is_active").eq("id", uid).maybeSingle();
  const caller = me as { role?: string; is_super?: boolean; is_active?: boolean } | null;
  if (!caller || caller.is_active === false) return bad(403, "الحساب مقفول.");
  const isSuper = caller.role === "admin" && caller.is_super === true;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const target = clip(body.agentId, 64) || uid;
  if (!UUID_RE.test(target)) return bad(400, "الـID ده مش مظبوط — انسخه تاني من صفحة المندوب.");
  if (target !== uid && !isSuper) return bad(403, "ده للسوبر أدمن بس.");
  if (target === uid && !isSuper && !AREA_FILL_FOR_ALL) return bad(403, "الخدمة دي لسه مش متاحة.");

  const { data: tp } = await supabaseAdmin.from("profiles").select("id, username").eq("id", target).maybeSingle();
  const targetProfile = tp as { id: string; username?: string | null } | null;
  if (!targetProfile) return bad(404, "الحساب ده مش موجود — اتأكد من الـID.");

  const action = clip(body.action, 16);

  if (action === "scan") {
    const after = clip(body.after, 64);
    let q = supabaseAdmin.from("field_checks").select("id, local_id, lat, lng, extra, checked_at")
      .eq("agent_id", target).not("lat", "is", null).not("lng", "is", null);
    if (after) q = q.gt("id", after);
    const { data, error } = await q.order("id", { ascending: true }).limit(SCAN_PAGE);
    if (error) return bad(500, error.message || "تعذّر قراية السجلات.");
    const rows = (data ?? []) as { id: string; local_id: string | null; lat: unknown; lng: unknown; extra: unknown; checked_at: string | null }[];
    const items = rows.filter((r) => needsAreaFill(r))
      .map((r) => ({ id: r.local_id as string, lat: coordNum(r.lat) as number, lng: coordNum(r.lng) as number, at: r.checked_at ?? null }));
    const next = rows.length === SCAN_PAGE ? String(rows[rows.length - 1].id) : null;
    return NextResponse.json({ items, next, scanned: rows.length, name: targetProfile.username ?? null });
  }

  if (action === "apply") {
    const raw = Array.isArray(body.items) ? body.items : [];
    if (raw.length > APPLY_MAX) return bad(400, "الدفعة كبيرة.");
    const items = raw.map((i) => i as Record<string, unknown>)
      .map((i) => ({ id: clip(i.id, 200), street: clip(i.street), district: clip(i.district) }))
      .filter((i) => i.id);
    if (!items.length) return NextResponse.json({ updated: 0, skipped: 0 });

    const { data, error } = await supabaseAdmin.from("field_checks").select("id, local_id, extra")
      .eq("agent_id", target).in("local_id", items.map((i) => i.id));
    if (error) return bad(500, error.message || "تعذّر قراية السجلات.");
    const rows = (data ?? []) as { id: string; local_id: string; extra: unknown }[];
    const byLocal = new Map(rows.map((r) => [r.local_id, r]));

    let updated = 0;
    let skipped = 0;
    let firstError: string | null = null;
    for (const it of items) {
      const r = byLocal.get(it.id);
      const cur = r?.extra && typeof r.extra === "object" ? (r.extra as Record<string, unknown>) : null;
      const next = r ? applyAreaFill(it.id, cur, { street: it.street, district: it.district }) : null;
      if (!r || !next) { skipped++; continue; }
      const { error: ue } = await supabaseAdmin.from("field_checks").update({ extra: next })
        .eq("id", r.id).eq("agent_id", target);
      if (ue) { firstError ??= ue.message; skipped++; continue; }
      updated++;
    }
    if (firstError && !updated) return bad(500, firstError);
    return NextResponse.json({ updated, skipped });
  }

  return bad(400, "طلب مش مفهوم.");
}
