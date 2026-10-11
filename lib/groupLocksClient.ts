/**
 * 🔒 أقفال عضو المجموعة على الشاشة — الجلب من السيرفر + الهوك. القواعد نفسها في `lib/groupLocks.ts`
 * (منفصلة عشان راوت السيرفر `/api/group-push` بيستخدمها من غير React).
 */
import { useEffect, useState } from "react";
import {
  memberLocks, NO_LOCKS, loadCachedLocks, saveCachedLocks, GROUP_LOCKS_EVENT as EVENT,
  type GroupLockSettings, type MemberLocks,
} from "./groupLocks";

// ── الجلب من السيرفر ───────────────────────────────────────────────────────

let inflight: Promise<MemberLocks | null> | null = null;
let lastAt = 0;

/** بيجيب أقفالي من السيرفر ويحفظها. فشل (مافيش نت) ⇒ null والمحفوظ يفضل زي ما هو. */
export function refreshMemberLocks(force = false): Promise<MemberLocks | null> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastAt < 30_000) return Promise.resolve(loadCachedLocks());
  inflight = (async () => {
    try {
      const { supabase } = await import("./supabaseClient");
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return null;
      const { data: prof, error } = await supabase.from("profiles").select("team, role, is_super").eq("id", uid).single();
      if (error || !prof) return null;
      const p = prof as { team?: string | null; role?: string | null; is_super?: boolean | null };
      let s: GroupLockSettings | null = null;
      if (p.team) {
        // «*» مش أسماء الأعمدة: لو SQL الأعمدة الجديدة لسه ماتشغّلش، الطلب مايفشلش (ومفيش قفل).
        const { data: gs, error: gErr } = await supabase.from("group_settings").select("*").eq("team", p.team).maybeSingle();
        if (gErr) return null;
        s = (gs as GroupLockSettings | null) ?? null;
      }
      const locks = memberLocks(s, { id: uid, team: p.team ?? null, role: p.role, isSuper: p.is_super === true });
      saveCachedLocks(locks);
      lastAt = Date.now();
      try { window.dispatchEvent(new CustomEvent<MemberLocks>(EVENT, { detail: locks })); } catch { /* */ }
      return locks;
    } catch { return null; }
    finally { inflight = null; }
  })();
  return inflight;
}

/**
 * خروج ⇒ الأقفال بتتشال من الجهاز، ودخول ⇒ بتتجاب من جديد — عشان مندوبين على نفس الموبايل ماياخدوش أقفال بعض.
 * اشتراك واحد للبرنامج كله (مش لكل مكوّن).
 */
let authWatched = false;
function watchAuthOnce(): void {
  if (authWatched) return;
  authWatched = true;
  void import("./supabaseClient").then(({ supabase }) => {
    supabase.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_OUT") {
        saveCachedLocks(NO_LOCKS);
        lastAt = 0;
        try { window.dispatchEvent(new CustomEvent<MemberLocks>(EVENT, { detail: NO_LOCKS })); } catch { /* */ }
      } else if (ev === "SIGNED_IN") {
        void refreshMemberLocks(true);
      }
    });
  }).catch(() => { authWatched = false; });
}

/** أقفالي في أي مكوّن — المحفوظ على طول، وبيتحدّث من السيرفر عند الفتح والرجوع للبرنامج. */
export function useMemberLocks(): MemberLocks {
  const [locks, setLocks] = useState<MemberLocks>(NO_LOCKS);
  useEffect(() => {
    watchAuthOnce();
    setLocks(loadCachedLocks());
    const on = (e: Event) => setLocks((e as CustomEvent<MemberLocks>).detail ?? loadCachedLocks());
    window.addEventListener(EVENT, on);
    void refreshMemberLocks();
    const onVis = () => { if (document.visibilityState === "visible") void refreshMemberLocks(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener(EVENT, on); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return locks;
}
