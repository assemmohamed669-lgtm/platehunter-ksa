"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getStoredSessionToken, clearStoredSessionToken } from "@/lib/device";

/**
 * Enforces "one active login at a time".
 *
 * On mount, subscribes to realtime updates on the signed-in agent's
 * `profiles` row. If `session_token` changes to a value that doesn't
 * match the token stored locally (set during loginAgent), it means
 * another device just logged into this account — so this session is
 * signed out and redirected to /login with an explanation.
 *
 * Also performs a one-time check on mount in case the token changed
 * while this device was offline / the tab was closed.
 */
export default function SessionGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [kicked, setKicked] = useState(false);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        router.replace("/login");
        return;
      }

      const localToken = getStoredSessionToken();

      // One-time check on load.
      const { data: profile } = await supabase
        .from("profiles")
        .select("session_token, is_active")
        .eq("id", userId)
        .single();

      if (profile && profile.is_active === false) {
        await forceLogout("تم تعطيل هذا الحساب من قبل الإدارة.");
        return;
      }

      if (
        profile &&
        localToken &&
        profile.session_token &&
        profile.session_token !== localToken
      ) {
        await forceLogout(
          "تم تسجيل الدخول إلى هذا الحساب من جهاز آخر، وتم إنهاء هذه الجلسة."
        );
        return;
      }

      // Live updates while the app is open.
      channel = supabase
        .channel(`profile-session-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${userId}`,
          },
          (payload) => {
            const newToken = (payload.new as { session_token?: string })
              .session_token;
            const stillActive = (payload.new as { is_active?: boolean })
              .is_active;

            if (stillActive === false) {
              forceLogout("تم تعطيل هذا الحساب من قبل الإدارة.");
              return;
            }

            if (newToken && newToken !== getStoredSessionToken()) {
              forceLogout(
                "تم تسجيل الدخول إلى هذا الحساب من جهاز آخر، وتم إنهاء هذه الجلسة."
              );
            }
          }
        )
        .subscribe();
    }

    async function forceLogout(message: string) {
      setKicked(true);
      await supabase.auth.signOut();
      clearStoredSessionToken();
      window.sessionStorage.setItem("pk_logout_reason", message);
      router.replace("/login");
    }

    setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (kicked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-night text-muted">
        جارٍ تسجيل الخروج...
      </div>
    );
  }

  return <>{children}</>;
}
