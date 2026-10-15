/**
 * 🗂️ داتا لكل عضو — **العضو نفسه** (المالك ١٥ أكتوبر ٢٠٢٦ — `lib/memberData.ts`).
 *
 * GET /api/member-data             → فيه ملف مخصوص ليا في المجموعة اللي شغّال لها؟ (اسمه وتاريخه وعدده بس)
 * GET /api/member-data?download=1  → + لينك تنزيل مؤقت (١٠ دقايق) — للفرز على الموبايل بس.
 *
 * ملف عضو تاني مستحيل يوصله: الصف بيتجاب بـ(مجموعتي، رقمي أنا) من الجلسة نفسها، والمخزن مالوش أي وصول مباشر.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MEMBER_DATA_BUCKET } from "@/lib/memberData";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  const jwt = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });
  const { data: u } = await supabaseAdmin.auth.getUser(jwt);
  const uid = u.user?.id;
  if (!uid) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });

  const { data: p } = await supabaseAdmin.from("profiles").select("team, is_active").eq("id", uid).maybeSingle();
  const prof = p as { team?: string | null; is_active?: boolean } | null;
  if (!prof?.team || prof.is_active === false) return NextResponse.json({ file: null });

  const { data, error } = await supabaseAdmin.from("member_data_files")
    .select("path, file_name, updated_at, row_count, plate_count")
    .eq("team", prof.team).eq("agent_id", uid).maybeSingle();
  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205" || /member_data_files/.test(error.message ?? "");
    return NextResponse.json({ file: null, missing });
  }
  const f = data as { path: string; file_name: string; updated_at: string; row_count: number | null; plate_count: number | null } | null;
  if (!f) return NextResponse.json({ file: null });

  const file = { fileName: f.file_name, updatedAt: f.updated_at, rowCount: f.row_count, plateCount: f.plate_count };
  if (req.nextUrl.searchParams.get("download") !== "1") return NextResponse.json({ file });
  const { data: s, error: se } = await supabaseAdmin.storage.from(MEMBER_DATA_BUCKET).createSignedUrl(f.path, 600);
  if (se || !s) return NextResponse.json({ file, error: se?.message ?? "تعذّر التنزيل." }, { status: 400 });
  return NextResponse.json({ file, url: s.signedUrl });
}
