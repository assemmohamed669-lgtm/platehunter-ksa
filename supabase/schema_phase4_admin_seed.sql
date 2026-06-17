-- =====================================================================
-- PlateHunter KSA — Phase 4 notes
-- No new tables needed: the admin panel reuses `profiles` (Phase 1) and
-- `recordings` (Phase 2). This file just documents how to create the
-- FIRST admin account (every subsequent agent can be created through
-- the in-app admin panel itself).
-- =====================================================================

-- Step 1: Create the auth user normally —
--   Supabase Dashboard > Authentication > Users > Add user
--   Email:    admin@platehunter.local
--   Password: (choose a strong one)

-- Step 2: Promote that user to admin by inserting/upgrading their profile.
-- Replace the UUID below with the new user's id from the Users table.
insert into public.profiles (id, username, role)
values ('PASTE-ADMIN-USER-UUID-HERE', 'admin', 'admin')
on conflict (id) do update set role = 'admin';

-- That's it — log in to the app with username "admin" and the password
-- you chose. The "الأدمن" button will appear in the header, leading to
-- /admin where you can create, activate/deactivate, and reset the
-- device lock for every agent account from then on.
