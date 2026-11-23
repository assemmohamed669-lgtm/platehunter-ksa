// @vitest-environment node
/**
 * 🔁 `sendPush` + `collapseId` — الإشعار المتكرّر للعربية المطلوبة بيحدّث **نفس** الإشعار (أندرويد `tag` · آيفون
 * `apns-collapse-id`) بدل ١٢ إشعار فوق بعض. من غير `collapseId` ⇒ نفس الرسالة القديمة بالحرف (المجموعة والشهايد).
 */
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const sent: Record<string, unknown>[] = [];

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({
    project_id: "p", client_email: "x@p.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
    sent.push(JSON.parse(String(init?.body)).message);
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => { sent.length = 0; });

describe("sendPush — collapseId", () => {
  it("مع collapseId ⇒ tag للأندرويد و apns-collapse-id للآيفون", async () => {
    const { sendPush } = await import("@/lib/fcm");
    const r = await sendPush(["tok"], { title: "t", body: "b", collapseId: "w-رلع7528" });
    expect(r.sent).toBe(1);
    const m = sent[0] as { android: { notification: Record<string, string> }; apns: { headers?: Record<string, string> } };
    expect(m.android.notification.tag).toBe("w-رلع7528");
    expect(m.apns.headers).toEqual({ "apns-collapse-id": "w-رلع7528" });
  });

  it("من غير collapseId ⇒ الرسالة القديمة بالحرف", async () => {
    const { sendPush } = await import("@/lib/fcm");
    await sendPush(["tok"], { title: "t", body: "b" });
    const m = sent[0] as { android: { notification: Record<string, string> }; apns: Record<string, unknown> };
    expect(m.android.notification).toEqual({ channel_id: "wanted_finds", sound: "default" });
    expect(m.apns).toEqual({ payload: { aps: { sound: "default" } } });
  });
});
