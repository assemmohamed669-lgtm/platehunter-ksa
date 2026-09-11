/**
 * POST /api/group-push
 * Body: { plate, info?, mapsLink? }
 *
 * المندوب لقى سيارة مطلوبة → بنبعت إشعار هاتف (FCM) لباقي مجموعته، حتى
 * والتطبيق مقفول عندهم. الإشعار اللي جوّه التطبيق (GroupFindNotifier) شغّال
 * بالتوازي عن طريق Realtime — ده بيغطّي اللي التطبيق مقفول عنده بس.
 *
 * الإعداد المطلوب: متغيّر البيئة FCM_SERVICE_ACCOUNT = محتوى ملف الـservice
 * account JSON بتاع مشروع Firebase (كامل، سطر واحد). من غيره الراوت بيرجع ok
 * من غير ما يبعت — عشان اللقطة نفسها ماتفشلش.
 */
import { NextRequest, NextResponse } from "next/server";
import { createSign } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const CHANNEL_ID = "wanted_finds";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

// توكن OAuth للسيرفر — صالح ساعة، بنكاشه عشان مانوقّعش JWT كل لقطة.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const claim = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(claim);
  const jwt = claim + "." + signer.sign(sa.private_key, "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  cachedToken = { value: j.access_token, expiresAt: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "مفيش جلسة." }, { status: 401 });

  const { data: userData } = await supabaseAdmin.auth.getUser(jwt);
  const uid = userData.user?.id;
  if (!uid) return NextResponse.json({ error: "الجلسة انتهت." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const plate: string = String(body.plate ?? "").trim();
  if (!plate) return NextResponse.json({ error: "اللوحة مطلوبة." }, { status: 400 });

  // مجموعة اللي لقاها + اسمه (السيرفر هو اللي بيحدّدهم — مش الكلاينت).
  const { data: me } = await supabaseAdmin
    .from("profiles").select("team, username").eq("id", uid).single();
  const team = (me as { team?: string | null } | null)?.team ?? null;
  if (!team) return NextResponse.json({ ok: true, sent: 0 });

  const sa = serviceAccount();
  if (!sa) return NextResponse.json({ ok: true, sent: 0, skipped: "no-credentials" });

  const { data: mates } = await supabaseAdmin
    .from("profiles").select("id").eq("team", team).neq("id", uid);
  const ids = (mates ?? []).map((m: { id: string }) => m.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { data: toks } = await supabaseAdmin
    .from("device_tokens").select("token").in("agent_id", ids);
  const tokens = (toks ?? []).map((t: { token: string }) => t.token);
  if (tokens.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const token = await accessToken(sa);
  if (!token) return NextResponse.json({ ok: true, sent: 0, skipped: "auth-failed" });

  const finder = (me as { username?: string | null } | null)?.username || "زميلك";
  const mapsLink: string = String(body.mapsLink ?? "");
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  // FCM v1 بيبعت لتوكن واحد في الطلب — بنبعتهم على التوازي.
  const results = await Promise.all(tokens.map(async (to) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: to,
          notification: { title: `${finder} لقى سيارة مطلوبة!`, body: plate },
          data: { plate, finder, mapsLink },
          android: {
            priority: "HIGH",
            notification: { channel_id: CHANNEL_ID, sound: "default" },
          },
          apns: { payload: { aps: { sound: "default" } } },
        },
      }),
    });
    return { to, ok: res.ok, status: res.status };
  }));

  // توكنات ماتت (الجهاز شال التطبيق) — امسحها عشان ماتفضلش تتجرّب كل مرة.
  const dead = results.filter((r) => r.status === 404 || r.status === 400).map((r) => r.to);
  if (dead.length) await supabaseAdmin.from("device_tokens").delete().in("token", dead);

  return NextResponse.json({ ok: true, sent: results.filter((r) => r.ok).length });
}
