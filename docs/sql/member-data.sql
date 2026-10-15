-- 🗂️ داتا لكل عضو — مسئول المجموعة بيرفع ملف داتا لعضو معيّن (مكة لمحمد، الطايف لمحمود…)، والعضو ده بس بيفرز عليه.
-- المالك (١٥ أكتوبر ٢٠٢٦): «الداتا دي تظهر للشخص دة بعينو … الشخص التاني ميقدرش يفتح الداتا دي ولا يحملها … هو يفرز فقط
-- عليها … مسئول المجموعه ميظهرلوش … غير اعضاء المجموعه دي فقط». قراره: ملف واحد لكل عضو (الجديد بيستبدل).
--
-- • الجدول والمخزن **مالهمش أي وصول مباشر** من التطبيق — كل حاجة من السيرفر بعد ما يتأكد:
--     /api/group/member-data  ← المسئول (مسئول المجموعة دي والعضو منها) بيرفع/يشيل بلينك مؤقت.
--     /api/member-data        ← العضو بياخد ملفه هو بس بلينك تنزيل مؤقت (١٠ دقايق).
-- آمن تشغّله أكتر من مرة. ⚠️ الجدول جديد ⇒ الصلاحيات (grant) مكتوبة صريحة تحت.

create table if not exists public.member_data_files (
  team        text not null,
  agent_id    uuid not null references public.profiles(id) on delete cascade,
  path        text not null,
  file_name   text not null,
  row_count   integer,
  plate_count integer,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (team, agent_id)
);

alter table public.member_data_files enable row level security;
-- مفيش أي سياسة ⇒ التطبيق مايقدرش يقرا ولا يكتب مباشرة (السيرفر بس).
revoke all on public.member_data_files from public, anon, authenticated;
grant select, insert, update, delete on public.member_data_files to service_role;

-- المخزن خاص ومن غير سياسات ⇒ مفيش تنزيل مباشر لأي حد.
insert into storage.buckets (id, name, public) values ('member-data', 'member-data', false)
on conflict (id) do nothing;

select 'داتا الأعضاء تمام' as done;
