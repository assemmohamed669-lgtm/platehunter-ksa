-- 🕐 فهرس «المتعدّل بعد كذا» لكل مندوب — شغّله **لوحده** بعد field-checks-updated-at.sql.
-- concurrently = بيتبني من غير ما يوقّف رفع المناديب (بياخد دقيقة أو اتنين). فاضي في الأول (السجلات المتعدّلة بس).
create index concurrently if not exists field_checks_agent_updated_idx
  on public.field_checks (agent_id, updated_at)
  where updated_at is not null;
