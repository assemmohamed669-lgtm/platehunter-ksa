/**
 * 📄🔔 إشعار الشهايد الجديدة — التوصيل بالداتابيز وFCM (سيرفر بس — مفتاح الخدمة). المنطق كله في `lib/certPush.ts`.
 * الجدول: `docs/sql/cert-push.sql`. لو لسه ماتشغّلش ⇒ الدورة بترجع غلط والشهايد اليومية بتكمّل عادي.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import { sendPush } from "./fcm";
import { riyadhDayStart } from "./certDaily";
import { certPushTick, isActiveSubscriber, certPushUrl, type CertPushResult, type SubscriberRow } from "./certPush";

export async function runCertPush(): Promise<CertPushResult> {
  return certPushTick({
    now: () => new Date(),
    today: () => riyadhDayStart(new Date()).day,

    async readMark() {
      const { data, error } = await supabaseAdmin.from("cert_push_state").select("last_created_at").eq("id", 1).maybeSingle();
      if (error) throw new Error(error.message);
      return ((data as { last_created_at?: string | null } | null)?.last_created_at) ?? null;
    },

    async newest(today) {
      const { data, error } = await supabaseAdmin.from("cert_daily").select("created_at")
        .eq("day", today).order("created_at", { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      return ((data ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null;
    },

    async claim(prev, next) {
      let q = supabaseAdmin.from("cert_push_state")
        .update({ last_created_at: next, last_sent_at: new Date().toISOString() }).eq("id", 1);
      q = prev ? q.eq("last_created_at", prev) : q.is("last_created_at", null);
      const { data, error } = await q.select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length === 1;
    },

    async uploadersBetween(afterIso, untilIso) {
      const out: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabaseAdmin.from("cert_daily").select("uploader")
          .gt("created_at", afterIso).lte("created_at", untilIso)
          .order("created_at", { ascending: true }).order("file_id", { ascending: true })
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as { uploader?: string }[];
        out.push(...rows.map((r) => r.uploader ?? ""));
        if (rows.length < 1000) return out;
      }
    },

    async recipients(today) {
      const { data, error } = await supabaseAdmin.from("profiles")
        .select("id, role, is_active, is_trial, subscription_end, rest_pages_enabled, is_super");
      if (error) throw new Error(error.message);
      const groups = new Map<string, string[]>();
      for (const p of (data ?? []) as (SubscriberRow & { id: string })[]) {
        if (!isActiveSubscriber(p, today)) continue;
        const url = certPushUrl(p);
        groups.set(url, [...(groups.get(url) ?? []), p.id]);
      }
      const out: { url: string; tokens: string[] }[] = [];
      for (const [url, ids] of groups) {
        const tokens: string[] = [];
        for (let i = 0; i < ids.length; i += 200) {
          const { data: t } = await supabaseAdmin.from("device_tokens").select("token").in("agent_id", ids.slice(i, i + 200));
          tokens.push(...((t ?? []) as { token: string }[]).map((x) => x.token));
        }
        out.push({ url, tokens });
      }
      return out;
    },

    send: sendPush,
    async dropDead(tokens) { await supabaseAdmin.from("device_tokens").delete().in("token", tokens); },
  });
}
