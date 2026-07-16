-- ════════════════════════════════════════════════════════════════════════
-- تعلّم تصحيح اللوحات المشترك (يشغّله الأدمن مرة واحدة في Supabase → SQL Editor)
-- ────────────────────────────────────────────────────────────────────────
-- الفكرة: كل مندوب لما يصحّح لوحة اتفرّغت غلط، التصحيح بيتجمّع على السيرفر،
-- فكل الفريق يستفيد ويوصل التعلّم للحدّ أسرع. المفتاح الصوتي بيفضل خاص بكل مندوب
-- (ده منفصل تماماً). لحد ما السطور دي تتنفّذ، التطبيق شغّال عادي بالتعلّم المحلي
-- على كل جهاز، والمزامنة بتتفعّل تلقائياً بعد التنفيذ.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.plate_corrections (
  kind       text    not null check (kind in ('letter','blend')), -- نوع التعلّم
  heard      text    not null,                                    -- اللي اتفرّغ (غلط)
  corrected  text    not null,                                    -- اللي المندوب صحّحه
  count      integer not null default 0,                          -- كام مرة اتصحّح كده
  updated_at timestamptz not null default now(),
  primary key (kind, heard, corrected)
);

alter table public.plate_corrections enable row level security;

-- القراءة: أي مستخدم مسجّل يقدر يقرا التعلّم المشترك.
drop policy if exists "read shared corrections" on public.plate_corrections;
create policy "read shared corrections" on public.plate_corrections
  for select to authenticated using (true);

-- الكتابة عبر دالة آمنة بس (مفيش INSERT/UPDATE مباشر من العميل) — زيادة ذرّية
-- تتفادى تعارض الكتابة المتزامنة، مع تحقّق بسيط يمنع البيانات الغلط/الضخمة.
create or replace function public.bump_plate_correction(
  p_kind text, p_heard text, p_corrected text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('letter','blend') then return; end if;
  if p_heard is null or p_corrected is null then return; end if;
  if char_length(p_heard) > 24 or char_length(p_corrected) > 24 then return; end if;
  insert into public.plate_corrections (kind, heard, corrected, count, updated_at)
  values (p_kind, p_heard, p_corrected, 1, now())
  on conflict (kind, heard, corrected)
  do update set count = plate_corrections.count + 1, updated_at = now();
end;
$$;

grant execute on function public.bump_plate_correction(text, text, text) to authenticated;
