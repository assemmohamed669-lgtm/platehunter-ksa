/**
 * 📂 ملفات داتا من مسئول المجموعة — **العضو نفسه** (المالك ٦ نوفمبر ٢٠٢٦ — `lib/groupDataFiles.ts`).
 *
 * GET /api/my-data-files                → الملفات اللي ليا في المجموعة اللي شغّال لها (أسماء وتواريخ وأعداد بس).
 * GET /api/my-data-files?download=<رقم>  → + لينك تنزيل مؤقت (١٠ دقايق) لملف من بتوعي — للفرز على الموبايل بس.
 *
 * ملف مش ليا مستحيل يوصلني: الملفات بتتجاب بمجموعتي من الجلسة نفسها وبتتفلتر بـ`canSeeGroupFile` (المجموعة كلها / أنا
 * من اللي اتعلّم عليهم)، والمخزن مالوش أي وصول مباشر.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canSeeGroupFile, GROUP_FILES_BUCKET, type GroupFileMeta } from "@/lib/groupDataFiles";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

type FileRow = {
  id: string; path: string; file_name: string; updated_at: string; row_count: number | null; plate_count: number | null;
  audience: "all" | "members"; member_ids: string[] | null;
};

export async function GET(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  const jwt = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });
  const { data: u } = await supabaseAdmin.auth.getUser(jwt);
  const uid = u.user?.id;
  if (!uid) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });

  const { data: p } = await supabaseAdmin.from("profiles").select("team, is_active").eq("id", uid).maybeSingle();
  const prof = p as { team?: string | null; is_active?: boolean } | null;
  if (!prof?.team || prof.is_active === false) return NextResponse.json({ files: [] });

  const [{ data: g }, { data, error }] = await Promise.all([
    supabaseAdmin.from("group_settings").select("leader_id").eq("team", prof.team).maybeSingle(),
    supabaseAdmin.from("group_data_files")
      .select("id, path, file_name, updated_at, row_count, plate_count, audience, member_ids")
      .eq("team", prof.team).order("created_at", { ascending: true }),
  ]);
  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205" || /group_data_files/.test(error.message ?? "");
    return NextResponse.json({ files: [], missing });
  }
  const leaderId = (g as { leader_id?: string | null } | null)?.leader_id ?? null;
  const mine = ((data ?? []) as FileRow[]).filter((f) => canSeeGroupFile({ audience: f.audience, memberIds: f.member_ids ?? [] }, uid, leaderId));
  // العضو مايعرفش مين تاني بياخد الملف — اسمه وتاريخه وعدده بس
  const files: GroupFileMeta[] = mine.map((f) => ({
    id: f.id, fileName: f.file_name, updatedAt: f.updated_at, rowCount: f.row_count, plateCount: f.plate_count,
    audience: f.audience === "members" ? "members" : "all", memberIds: [],
  }));

  const want = req.nextUrl.searchParams.get("download");
  if (!want) return NextResponse.json({ files });
  const f = mine.find((x) => x.id === want);
  if (!f) return NextResponse.json({ files, error: "الملف ده مش ليك." }, { status: 404 });
  const { data: s, error: se } = await supabaseAdmin.storage.from(GROUP_FILES_BUCKET).createSignedUrl(f.path, 600);
  if (se || !s) return NextResponse.json({ files, error: se?.message ?? "تعذّر التنزيل." }, { status: 400 });
  return NextResponse.json({ files, url: s.signedUrl });
}
