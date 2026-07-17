/**
 * POST /api/reanalyze
 * Body: { audio: base64, mimeType, engine, transcribeKey, groqKey }
 * signed-in agents only.
 *
 * إعادة تحليل تسجيل محفوظ بدقة أعلى (مش مستعجل زي اللحظي):
 *  (١) يعيد تفريغ الصوت بالأداة المختارة **على السيرفر** (مفيش قيود CORS) —
 *      ElevenLabs Scribe / Deepgram pre-recorded / Groq Whisper.
 *  (٢) يبعت النص لـ Groq llama يرتّبه لصفوف {plate, vehicleType, notes} بالسياق
 *      الكامل ويتحقّق (٣ حروف + ٤ أرقام).
 * بيرجّع { transcript, rows, engineUsed }.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import ffmpegPath from "ffmpeg-static";
import { buildStructurePrompt, extractJsonObject, normalizeStructuredRows } from "@/lib/structuredPlates";

export const runtime = "nodejs";
const execFileAsync = promisify(execFile);
const GROQ_STRUCTURE_MODEL = "llama-3.3-70b-versatile";

function resolveFfmpegPath(): string | null {
  const binName = os.platform() === "win32" ? "ffmpeg.exe" : "ffmpeg";
  for (const c of [ffmpegPath, path.join(process.cwd(), "node_modules", "ffmpeg-static", binName)]) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

// ينضّف الصوت (highpass + تسوية مستوى) ويحوّله m4a — لازم لـ Groq Whisper (بيرفض
// AAC الخام). لو ffmpeg مش متاح بنرجّع الأصلي.
async function cleanToM4a(input: Buffer, inputExt: string): Promise<{ buf: Buffer; ext: string }> {
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) return { buf: input, ext: inputExt || "m4a" };
  const id = Math.random().toString(36).slice(2);
  const inPath = path.join(os.tmpdir(), `re-${id}.${inputExt || "dat"}`);
  const outPath = path.join(os.tmpdir(), `re-${id}.m4a`);
  try {
    await writeFile(inPath, input);
    await execFileAsync(ffmpeg, ["-y", "-i", inPath, "-af", "highpass=f=80,dynaudnorm", "-ac", "1", "-c:a", "aac", "-b:a", "96k", outPath]);
    return { buf: await readFile(outPath), ext: "m4a" };
  } catch {
    return { buf: input, ext: inputExt || "m4a" };
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

const PLATE_PROMPT =
  "إملاء لوحات سيارات سعودية، كل حرف كلمة منفصلة وكل رقم منفصل، بدون تعليق أو تلخيص. الحروف المتشابهة متمايزة: حه غير هه، سين غير صاد، قاف غير كاف، دال غير طاء، عين غير ألف.";

async function transcribeElevenLabs(buf: Buffer, ext: string, key: string): Promise<string> {
  const { buf: clean, ext: cleanExt } = await cleanToM4a(buf, ext);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(clean)], { type: "audio/mp4" }), `audio.${cleanExt}`);
  form.append("model_id", "scribe_v1");
  form.append("language_code", "ar");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST", headers: { "xi-api-key": key }, body: form,
  });
  if (!r.ok) throw new Error(`elevenlabs ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const j = await r.json();
  return (j.text ?? "").trim();
}

async function transcribeDeepgram(buf: Buffer, mimeType: string, key: string): Promise<string> {
  const url = "https://api.deepgram.com/v1/listen?model=nova-3&language=ar&smart_format=true&numerals=true&punctuate=false";
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": mimeType || "audio/mp4" },
    body: new Uint8Array(buf),
  });
  if (!r.ok) throw new Error(`deepgram ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const j = await r.json();
  return (j?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
}

async function transcribeGroq(buf: Buffer, ext: string, key: string): Promise<string> {
  const { buf: clean, ext: cleanExt } = await cleanToM4a(buf, ext);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(clean)], { type: "audio/mp4" }), `audio.${cleanExt}`);
  form.append("model", "whisper-large-v3");
  form.append("language", "ar");
  form.append("prompt", PLATE_PROMPT);
  form.append("temperature", "0");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  if (!r.ok) throw new Error(`groq ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const j = await r.json();
  return (j.text ?? "").trim();
}

async function structure(transcript: string, groqKey: string): Promise<ReturnType<typeof normalizeStructuredRows>> {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: GROQ_STRUCTURE_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "أنت بترتّب نص مفرّغ لصفوف JSON فقط." },
        { role: "user", content: buildStructurePrompt(transcript) },
      ],
    }),
  });
  if (!r.ok) throw new Error(`structure ${r.status}`);
  const j = await r.json();
  return normalizeStructuredRows(extractJsonObject(j?.choices?.[0]?.message?.content ?? ""));
}

export async function POST(req: NextRequest) {
  try {
    const userId = await verifySession(req.headers.get("authorization"));
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!rateLimit(`reanalyze:${userId}`, 30, 60_000)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const { audio, mimeType, engine, transcribeKey, groqKey } = await req.json();
    if (typeof audio !== "string" || !audio) {
      return NextResponse.json({ error: "missing_audio" }, { status: 400 });
    }
    const buf = Buffer.from(audio, "base64");
    let ext = (String(mimeType || "").split("/")[1] ?? "m4a").split(";")[0];
    if (ext === "x-m4a" || ext === "mp4a-latm") ext = "m4a";

    // مفتاح Groq للترتيب (وللتفريغ لو المحرك groq/غير مدعوم) — مفتاح المندوب أو السيرفر.
    const gk = (typeof groqKey === "string" && groqKey.trim()) || process.env.GROQ_API_KEY || "";
    const tk = (typeof transcribeKey === "string" && transcribeKey.trim()) || "";

    // (١) تفريغ بالأداة المختارة — fallback لـ Groq لو الأداة مش مدعومة batch أو مفيش مفتاحها.
    let transcript = "";
    let engineUsed = engine;
    try {
      if (engine === "elevenlabs" && tk) transcript = await transcribeElevenLabs(buf, ext, tk);
      else if (engine === "deepgram" && tk) transcript = await transcribeDeepgram(buf, mimeType, tk);
      else { engineUsed = "groq"; transcript = await transcribeGroq(buf, ext, tk || gk); }
    } catch (e) {
      // الأداة المختارة فشلت → جرّب Groq كخطة بديلة قبل ما نستسلم.
      if (engineUsed !== "groq" && gk) {
        try { transcript = await transcribeGroq(buf, ext, gk); engineUsed = "groq"; }
        catch { return NextResponse.json({ error: "transcribe_failed", detail: String(e).slice(0, 200) }, { status: 500 }); }
      } else {
        return NextResponse.json({ error: "transcribe_failed", detail: String(e).slice(0, 200) }, { status: 500 });
      }
    }

    if (!transcript.trim()) return NextResponse.json({ transcript: "", rows: [], engineUsed });

    // (٢) ترتيب + تحقّق.
    if (!gk) return NextResponse.json({ transcript, rows: [], engineUsed, error: "missing_groq_key" });
    let rows: ReturnType<typeof normalizeStructuredRows> = [];
    try { rows = await structure(transcript, gk); }
    catch (e) { return NextResponse.json({ transcript, rows: [], engineUsed, error: "structure_failed", detail: String(e).slice(0, 160) }); }

    return NextResponse.json({ transcript, rows, engineUsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("reanalyze error:", msg);
    return NextResponse.json({ error: "server_error", detail: msg }, { status: 500 });
  }
}
