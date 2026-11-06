-- 📂 ملفات داتا من مسئول المجموعة — المالك (٦ نوفمبر ٢٠٢٦): «مسئول المجموعه يقدر يرفع اكتر من ملف داتا من صفحه ادارة
-- مجموعتي ويختار الداتا دي تظهر ل مين في مجموعته بالظبط … لحد معين او للمجموعه كلها».
--
-- • كل ملف صف: «المجموعة كلها» (audience = 'all') أو «أعضاء معيّنين» (audience = 'members' + member_ids).
-- • الجدول **مالوش أي وصول مباشر** من التطبيق — كل حاجة من السيرفر بعد ما يتأكد:
--     /api/group/data-files  ← المسئول (مسئول المجموعة دي وصفحته مفتوحة) بيرفع/يغيّر/يحدد مين/يشيل.
--     /api/my-data-files     ← العضو بياخد الملفات اللي ليه بس بلينك تنزيل مؤقت (١٠ دقايق).
-- • الملفات نفسها في نفس المخزن الخاص بتاع «داتا الأعضاء» (`member-data` — من غير سياسات) في فولدر `files/`.
-- آمن تشغّله أكتر من مرة. ⚠️ الجدول جديد ⇒ الصلاحيات (grant) مكتوبة صريحة تحت (Supabase وقّفت المنح التلقائي).

create table if not exists public.group_data_files (
  id          uuid primary key default gen_random_uuid(),
  team        text not null,
  path        text not null,
  file_name   text not null,
  row_count   integer,
  plate_count integer,
  audience    text not null default 'all' check (audience in ('all', 'members')),
  member_ids  uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create index if not exists group_data_files_team_idx on public.group_data_files (team);

alter table public.group_data_files enable row level security;
-- مفيش أي سياسة ⇒ التطبيق مايقدرش يقرا ولا يكتب مباشرة (السيرفر بس).
revoke all on public.group_data_files from public, anon, authenticated;
grant select, insert, update, delete on public.group_data_files to service_role;

-- نفس المخزن الخاص بتاع «داتا الأعضاء» (لو member-data.sql ماتشغّلش قبل كده).
insert into storage.buckets (id, name, public) values ('member-data', 'member-data', false)
on conflict (id) do nothing;

select 'ملفات داتا المسئول تمام' as done;
