import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";

const PROMPT = `Look at the license plate in this image.

Output ONLY the 7 characters from the BOTTOM English row: 3 letters then 4 digits, no spaces, nothing else.

Valid letters on Saudi plates: A B D E G H J K L M N R S T U V X Z

Examples of correct output:
JTT8877
NKD5678
ABD1234

Do NOT describe the plate. Do NOT write any other words. Just the 7 characters.
If no plate is visible at all, output: NONE`;

// Chassis / VIN mode. The agent photographs the VIN etched on the windshield —
// a single line of 11–17 uppercase Latin letters and digits (no I/O/Q in a true
// VIN, but read exactly what's printed). Clean printed text → easy for the model.
const CHASSIS_PROMPT = `Look at the image. It shows a vehicle VIN / chassis number — one line of 11 to 17 uppercase letters and digits, no spaces.

Output ONLY that code, in uppercase, with no spaces and nothing else.

Examples of correct output:
WAUBHCFC8DN029594
KNADN4126G6555369
3KPA241A5JE017513

Do NOT add words or explanation. If no such code is visible, output: NONE`;

// Pull the VIN out of the model's reply: the longest 11–17 char alphanumeric run.
function extractChassis(text: string): string | null {
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9\s]/g, " ");
  const runs = cleaned.match(/[A-Z0-9]{11,17}/g);
  if (!runs || !runs.length) return null;
  // Prefer a run that has BOTH letters and digits (a real VIN), else the longest.
  const mixed = runs.filter((r) => /[A-Z]/.test(r) && /[0-9]/.test(r));
  const pool = mixed.length ? mixed : runs;
  return pool.sort((a, b) => b.length - a.length)[0];
}

// Extract plate from model response and normalise letter order.
// Saudi plates display letters RIGHT-to-LEFT (rightmost = first letter).
// Vision models read left-to-right, so they return letters reversed — we flip them back.
// e.g. model reads "TTJ8877" → reverse letters → "JTT8877"
function extractPlate(text: string): string | null {
  const cleaned = text.replace(/\s+/g, "").toUpperCase();

  // Prefer letters-then-digits (most common model output format)
  let m = cleaned.match(/([A-Z]{2,3})([0-9]{3,4})/);
  if (m) {
    const letters = m[1].split("").reverse().join(""); // reverse: TTJ → JTT
    return letters + m[2];
  }
  // Digits-then-letters fallback
  m = cleaned.match(/([0-9]{3,4})([A-Z]{2,3})/);
  if (m) {
    const letters = m[2].split("").reverse().join(""); // reverse: TTJ → JTT
    return letters + m[1];
  }
  return null;
}

/**
 * 🔴 **موديلات الرؤية على Groq بتتشال من غير إنذار — حصلت مرتين.**
 *
 *   ٢٠٢٦/٦/١٧  `meta-llama/llama-4-scout-17b-16e-instruct` اتشال
 *   ٢٠٢٦/٩/٢٦  `qwen/qwen3.6-27b` اتشال (Groq رفّعه لـ3.8)
 *
 * وفي المرتين الكاميرا والشاص وقفوا **عند كل المناديب** والرسالة اللي وصلتهم
 * كانت JSON خام. عشان كده الموديل بقى:
 *   · في **قايمة** بترتيب الأفضلية — لو الأول اتشال بنجرّب اللي بعده فوراً
 *   · قابل للتغيير من **متغيّر بيئة** (`GROQ_VISION_MODEL`، مفصول بفواصل) —
 *     يعني المرة الجاية بتتصلّح من إعدادات Vercel في دقيقة، بلا نشر ولا كود
 *
 * الحالي (متحقَّق من `console.groq.com/docs/vision` يوم ٢٦ سبتمبر ٢٠٢٦):
 * `qwen/qwen3.8-27b` هو **الوحيد** اللي بياخد صور على Groq دلوقتي.
 */
const VISION_MODELS: string[] = (process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b")
  .split(",").map((m) => m.trim()).filter(Boolean);

/** رد Groq بيقول إن الموديل نفسه مش موجود/مش متاح؟ (مش أي خطأ تاني) */
function isModelGone(status: number, body: string): boolean {
  if (status !== 400 && status !== 404) return false;
  const b = body.toLowerCase();
  return b.includes("does not exist") || b.includes("model_not_found") || b.includes("decommissioned");
}

export async function POST(req: NextRequest) {
  try {
    // Auth: only signed-in agents may call — blocks anonymous abuse of the
    // server API key. Rate-limit per agent as a second layer.
    const userId = await verifySession(req.headers.get("authorization"), req);
    if (!userId) return NextResponse.json({ plate: null, error: "unauthorized" }, { status: 401 });
    if (!rateLimit(`read-plate:${userId}`, 60, 60_000, req)) {
      return NextResponse.json({ plate: null, error: "rate_limited" }, { status: 429 });
    }

    const { image, mediaType, apiKey: clientKey, mode } = await req.json();
    if (!image || !mediaType) {
      return NextResponse.json({ plate: null, error: "missing image" }, { status: 400 });
    }
    const isChassis = mode === "chassis";

    // Prefer the agent's OWN key (sent from the client, same key as voice) so
    // camera usage is billed to each agent's account instead of pooling onto
    // one shared account. Falls back to the server key only if the agent
    // hasn't set one. If neither exists the client silently falls back to the
    // free on-device TextDetector, so return a plain (non-fatal) signal.
    const apiKey = (typeof clientKey === "string" && clientKey.trim()) || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ plate: null, error: "missing_api_key" }, { status: 200 });
    }

    // نجرّب الموديلات بالترتيب — الموديل المشال بيتخطّى فوراً للّي بعده.
    let res: Response | null = null;
    let lastStatus = 0;
    let lastBody = "";
    let allGone = true;
    for (const model of VISION_MODELS) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          // reasoning_effort:"none" بيطفّي وضع التفكير فتطلع اللوحة مباشرة
          // (من غير ما التوكنز تتاكل في التفكير).
          model,
          reasoning_effort: "none",
          max_tokens: 40,
          temperature: 0,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${image}` } },
              { type: "text", text: isChassis ? CHASSIS_PROMPT : PROMPT },
            ],
          }],
        }),
      });
      if (r.ok) { res = r; allGone = false; break; }
      lastStatus = r.status;
      lastBody = await r.text().catch(() => "");
      if (!isModelGone(r.status, lastBody)) { allGone = false; break; }   // خطأ تاني — مانكمّلش
      console.error("Groq vision model gone:", model, lastBody.slice(0, 200));
    }

    if (!res) {
      // 🔴 كل الموديلات اتشالت = العطل عندنا مش عند المندوب. الرسالة لازم تقول
      //    كده بالعربي بدل ما نرمي JSON خام في وشه (ده اللي حصل ٢٦ سبتمبر).
      if (allGone) {
        console.error("Groq: كل موديلات الرؤية في القايمة اتشالت:", VISION_MODELS.join(","));
        return NextResponse.json(
          { plate: null, chassis: null, error: "vision_model_gone",
            hint: "خدمة قراءة الصور اتغيّرت عند المزوّد — بلّغ الإدارة. اكتب الرقم يدوياً دلوقتي." },
          { status: 503 }
        );
      }
      console.error("Groq error:", lastStatus, lastBody.slice(0, 300));
      return NextResponse.json(
        { plate: null, error: "groq_error", detail: lastStatus, hint: lastBody.slice(0, 200) },
        { status: 500 }
      );
    }

    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw || raw.toUpperCase().includes("NONE")) {
      return NextResponse.json(isChassis ? { chassis: null } : { plate: null });
    }

    if (isChassis) {
      return NextResponse.json({ chassis: extractChassis(raw), raw });
    }
    // If model returned just the plate — use it directly; otherwise extract from response
    const plate = extractPlate(raw) ?? null;
    return NextResponse.json({ plate, raw });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("read-plate error:", msg);
    return NextResponse.json({ plate: null, error: "server_error", detail: msg }, { status: 500 });
  }
}
