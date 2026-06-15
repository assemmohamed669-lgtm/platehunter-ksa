# قناص اللوحات — PlateHunter KSA

PWA scaffold for vehicle-recovery field agents, built with Next.js (App
Router) + Tailwind CSS + Supabase. This is **Phase 1** of the master spec:
navigation shell + authentication with device binding and single-session
enforcement. Phases 2–4 (voice recorder/GPS capture, Whisper transcription,
sorting & Excel export) build on top of this foundation.

## What's included (Phase 1)

- **RTL Arabic UI** with the green / dark-green theme and an OLED
  battery-saver mode (toggle in the header, persisted per device).
- **Bottom navigation** with the four tabs: الفرز، التشيك، التسجيل، الخرائط
  (each currently a placeholder describing what its phase will add).
- **Username/password login** (agents never see an email — usernames are
  mapped internally to `username@platehunter.local` for Supabase Auth).
- **Hardware/device lock**: on first login, the device is bound to the
  account via `handle_device_login()`. A login from a different device is
  rejected until an admin clears `device_fingerprint` for that agent.
- **Single active session**: every successful login rotates a
  `session_token`. `SessionGuard` listens for that change via Supabase
  Realtime and signs out any other open session immediately.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project**, then in the SQL editor run
   `supabase/schema.sql`. This creates the `profiles` table, RLS policies,
   the `handle_device_login` function, and enables Realtime on `profiles`.

3. **Copy environment variables**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   from Supabase → Project Settings → API.

4. **Create an agent**
   - Supabase Dashboard → Authentication → Users → Add user.
     - Email: `agent01@platehunter.local` (must match `<username>@platehunter.local`)
     - Set a password.
   - In the SQL editor:
     ```sql
     insert into public.profiles (id, username, role)
     values ('<the new user's UUID>', 'agent01', 'agent');
     ```
   - The agent can now log in with username `agent01` and that password.
     The first login on a device binds the account to it.

5. **Resetting a device** (admin task): set
   `device_fingerprint = null` for that agent's row in `profiles`. Their
   next login will bind to whichever device they use.

6. **Run the app**

   ```bash
   npm run dev
   ```

## Notes & next steps

- **Device lock caveat**: browsers don't expose a real hardware serial
  number. `lib/device.ts` persists a UUID in `localStorage` plus a coarse
  browser/screen signature — this behaves as a hardware lock in normal use,
  but clearing site data or reinstalling the PWA changes it (which is why
  the admin-reset flow exists).
- **PWA icons**: `public/manifest.json` references `icon-192.png` and
  `icon-512.png` — add real app icons before shipping.
- **Offline mode, GPS tracking, and audio recording** (Phase 2) will store
  data in IndexedDB and sync to Supabase. Given the app continuously
  records agent location and audio in the field, plan for: agent consent
  /authorization documentation, a data-retention policy, and review against
  Saudi Arabia's Personal Data Protection Law (PDPL) before deployment.
- **Phase 2** — `app/(app)/registration`: Web Audio recorder, background
  GPS pings (5s interval) + manual pin, reverse geocoding for
  street/district, IndexedDB-backed offline queue with background sync.
- **Phase 3** — Whisper transcription endpoint (server route using
  `OPENAI_API_KEY`), Saudi plate-format parsing and the
  English→Arabic bank-letter mapping table.
- **Phase 4** — `app/(app)/checking` and `app/(app)/sorting`: virtualized
  50k+ row table with duplicate highlighting, bank-list import/matching,
  and the `.xlsx` export (columns A–F as specified).
