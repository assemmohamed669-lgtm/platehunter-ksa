// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🚨 `POST /api/wanted-self-push` — إشعار «عربية مطلوبة» لموبايل المندوب **نفسه** وهو برّه البرنامج (`lib/wantedBgAlert.ts`).
 *  · الجلسة بتحدّد مين — مابيبعتش لأي حد تاني.
 *  · مقفول على المناديب لحد ما المالك يجرّب (السوبر أدمن الأول).
 *  · التوكنات الميتة بتتمسح زي `/api/group-push`.
 */
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  deleted: [] as unknown[][],
  sent: [] as { tokens: string[]; p: { title: string; body: string; data?: Record<string, string> } }[],
  dead: [] as string[],
  configured: true,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let del = false;
    const run = () => (h.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const b: Record<string, unknown> = {
      select: () => b,
      delete: () => { del = true; return b; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); if (del) h.deleted.push(vs); return b; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return b;
  }
  return {
    supabaseAdmin: {
      from,
      auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null }, error: null }) },
    },
  };
});

vi.mock("@/lib/fcm", () => ({
  fcmConfigured: () => h.configured,
  sendPush: async (tokens: string[], p: { title: string; body: string }) => {
    h.sent.push({ tokens, p });
    return { sent: tokens.filter((t) => !h.dead.includes(t)).length, dead: tokens.filter((t) => h.dead.includes(t)) };
  },
}));

import { POST } from "@/app/api/wanted-self-push/route";

const SUPER = "11111111-1111-4111-8111-111111111111";
const AGENT = "22222222-2222-4222-8222-222222222222";

function req(jwt: string, body: unknown) {
  return new Request("http://x/api/wanted-self-push", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  h.sent = []; h.deleted = []; h.dead = []; h.configured = true;
  h.tables = {
    profiles: [
      { id: SUPER, role: "admin", is_super: true },
      { id: AGENT, role: "agent", is_super: false },
    ],
    device_tokens: [
      { agent_id: SUPER, token: "tok-super-phone" },
      { agent_id: SUPER, token: "tok-super-old" },
      { agent_id: AGENT, token: "tok-agent" },
    ],
  };
});

describe("/api/wanted-self-push", () => {
  it("من غير جلسة ⇒ 401", async () => {
    const r = await POST(req("", { plate: "رلع7528" }));
    expect(r.status).toBe(401);
    expect(h.sent).toEqual([]);
  });

  it("من غير لوحة ⇒ 400", async () => {
    const r = await POST(req(SUPER, { plate: " " }));
    expect(r.status).toBe(400);
  });

  it("السوبر أدمن ⇒ لموبايلاته هو بس، بالعنوان والبيانات", async () => {
    const r = await POST(req(SUPER, { plate: "رلع7528", info: [["الماركة", "تويوتا"], ["اللون", "أبيض"]] }));
    expect(await r.json()).toEqual({ ok: true, sent: 2 });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].tokens.sort()).toEqual(["tok-super-old", "tok-super-phone"]);
    expect(h.sent[0].p.title).toBe("🚨 عربية مطلوبة: ر ل ع 7528");
    expect(h.sent[0].p.body).toBe("الماركة: تويوتا\nاللون: أبيض");
  });

  it("مندوب عادي ⇒ لموبايله هو بس (مفتوحة للكل — ٢٣ نوفمبر)", async () => {
    const r = await POST(req(AGENT, { plate: "رلع7528", info: [] }));
    expect(await r.json()).toEqual({ ok: true, sent: 1 });
    expect(h.sent[0].tokens).toEqual(["tok-agent"]);
  });

  it("بيانات بشكل غلط ⇒ بتتجاهل، والإشعار يطلع باللوحة", async () => {
    await POST(req(SUPER, { plate: "رلع7528", info: "x" }));
    expect(h.sent[0].p.body).toBe("افتح البرنامج ودوس «تم»");
  });

  it("التوكن الميت بيتمسح", async () => {
    h.dead = ["tok-super-old"];
    const r = await POST(req(SUPER, { plate: "رلع7528", info: [] }));
    expect(await r.json()).toEqual({ ok: true, sent: 1 });
    expect(h.deleted).toEqual([["tok-super-old"]]);
  });

  it("Firebase مش متظبط ⇒ ok من غير إرسال", async () => {
    h.configured = false;
    const r = await POST(req(SUPER, { plate: "رلع7528", info: [] }));
    expect(await r.json()).toEqual({ ok: true, sent: 0, skipped: "no-fcm" });
  });
});
