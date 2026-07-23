-- ─────────────────────────────────────────────────────────────────────────
-- إصلاح: "Database error deleting user" عند حذف مستخدم من Supabase.
-- السبب: جداول (زي recordings و field_checks) بتشير لـ auth.users(id) بدون
-- ON DELETE CASCADE، فحذف المستخدم بيتمنع لوجود صفوف مربوطة بيه.
-- الحل: نعيد بناء كل مفتاح أجنبي بيشير لـ auth.users أو public.profiles
-- بحيث يبقى ON DELETE CASCADE — فحذف المستخدم بيمسح بياناته المربوطة وينجح.
-- شغّل الملف ده مرة واحدة في Supabase → SQL Editor. آمن — بيلمس روابط المستخدم بس.
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select con.conname,
           ns.nspname  as sch,  cl.relname  as tbl,  att.attname as col,
           fns.nspname as fsch, fcl.relname as ftbl
    from pg_constraint con
    join pg_class     cl  on cl.oid  = con.conrelid
    join pg_namespace ns  on ns.oid  = cl.relnamespace
    join pg_class     fcl on fcl.oid = con.confrelid
    join pg_namespace fns on fns.oid = fcl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confdeltype <> 'c'                 -- مش cascade أصلاً
      and (
        (fns.nspname = 'auth'   and fcl.relname = 'users')
        or (fns.nspname = 'public' and fcl.relname = 'profiles')
      )
  loop
    execute format('alter table %I.%I drop constraint %I', r.sch, r.tbl, r.conname);
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references %I.%I(id) on delete cascade',
      r.sch, r.tbl, r.conname, r.col, r.fsch, r.ftbl);
    raise notice 'Fixed FK % on %.% -> %.%', r.conname, r.sch, r.tbl, r.fsch, r.ftbl;
  end loop;
end $$;
