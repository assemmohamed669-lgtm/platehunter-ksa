import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import ffmpegPath from "ffmpeg-static";

// ffmpeg-static computes its binary path from __dirname, which webpack
// rewrites when it inlines the package into the route bundle — the module
// then points at <bundle-dir>/ffmpeg, which doesn't exist (the ENOENT seen
// on Vercel). serverComponentsExternalPackages in next.config.mjs prevents
// that inlining, but resolve defensively anyway: verify the module's path
// actually exists, else fall back to the real node_modules location that
// outputFileTracingIncludes ships with the function.
function resolveFfmpegPath(): string | null {
  const binName = os.platform() === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    ffmpegPath,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", binName),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

// A phone/browser can report a MIME subtype Groq doesn't recognize even
// though the underlying audio is a format it accepts fine once correctly
// labeled (e.g. some Android recorders/older browsers report "audio/x-wav"
// or "audio/mp4a-latm" instead of the bare "wav"/"m4a" Groq expects).
// Groq's accepted set (from its own rejection message): flac mp3 mp4 mpeg
// mpga m4a ogg opus wav webm.
const MIME_SUBTYPE_ALIASES: Record<string, string> = {
  "x-wav": "wav",
  "wave": "wav",
  "vnd.wave": "wav",
  "x-m4a": "m4a",
  "mp4a-latm": "m4a",
  "x-mp4": "mp4",
  "x-mp3": "mp3",
  "mpeg3": "mp3",
  "x-mpeg-3": "mp3",
};

// Voice-to-text for plate registration via Groq's hosted Whisper. Uses the
// AGENT'S OWN API key (sent from the client, not a shared server key) — each
// field agent has their own free Groq account, so usage never pools onto one
// account's rate limit no matter how many agents use the app.

// The native Android recorder plugin hardcodes MediaRecorder.OutputFormat.AAC_ADTS
// with no way to configure it — always a raw AAC/ADTS elementary stream, not a
// proper container. Groq's Whisper endpoint sniffs actual file content (not just
// the extension) and rejects raw AAC outright, even though the codec itself is
// fine. Remux (not re-encode — instant, lossless) into a real .m4a container
// before uploading so Groq's format check passes.
async function remuxAacToM4a(input: Buffer): Promise<Buffer> {
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) throw new Error("ffmpeg binary unavailable");

  const id = Math.random().toString(36).slice(2);
  const inPath = path.join(os.tmpdir(), `rec-${id}.aac`);
  const outPath = path.join(os.tmpdir(), `rec-${id}.m4a`);

  try {
    await writeFile(inPath, input);
    await execFileAsync(ffmpeg, ["-y", "-i", inPath, "-c:a", "copy", outPath]);
    return await readFile(outPath);
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

// Light, speech-safe cleanup before transcription. Field recordings carry
// wind/engine rumble and uneven levels (agent near/far from the mic).
//   • highpass=f=80  → cut low-frequency rumble/wind without touching speech
//   • dynaudnorm     → even out loudness so a quietly-spoken plate isn't lost
// Deliberately NO low-pass / aggressive denoise: the HIGH-frequency energy of
// fricative letters (س ص ش) is exactly what distinguishes them, and denoise
// smears it. Re-encoding to a real m4a container also doubles as the raw-AAC→
// m4a fix Groq's format sniffer needs.
async function cleanAudio(input: Buffer, inputExt: string): Promise<Buffer> {
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) throw new Error("ffmpeg binary unavailable");

  const id = Math.random().toString(36).slice(2);
  const inPath = path.join(os.tmpdir(), `clean-${id}.${inputExt || "dat"}`);
  const outPath = path.join(os.tmpdir(), `clean-${id}.m4a`);

  try {
    await writeFile(inPath, input);
    await execFileAsync(ffmpeg, [
      "-y", "-i", inPath,
      "-af", "highpass=f=80,dynaudnorm",
      "-ac", "1",
      "-c:a", "aac", "-b:a", "96k",
      outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  try {
    // Auth: signed-in agents only. Rate-limit per agent.
    const userId = await verifySession(req.headers.get("authorization"));
    if (!userId) return NextResponse.json({ text: null, error: "unauthorized" }, { status: 401 });
    if (!rateLimit(`transcribe:${userId}`, 120, 60_000)) {
      return NextResponse.json({ text: null, error: "rate_limited" }, { status: 429 });
    }

    const { audio, mimeType, apiKey } = await req.json();
    if (typeof audio !== "string" || !audio || typeof apiKey !== "string" || !apiKey) {
      return NextResponse.json({ text: null, error: "missing_audio_or_key" }, { status: 400 });
    }

    let buffer: Buffer = Buffer.from(audio, "base64");
    let ext = (mimeType?.split("/")[1] ?? "m4a").split(";")[0];
    ext = MIME_SUBTYPE_ALIASES[ext] ?? ext;

    // Clean + normalize the audio (also produces a Groq-friendly m4a container).
    try {
      buffer = await cleanAudio(buffer, ext);
      ext = "m4a";
    } catch (err) {
      console.warn("audio clean failed, falling back:", err instanceof Error ? err.message : err);
      // Cleaning failed — raw AAC MUST still be remuxed or Groq rejects it.
      // Any other format is sent as-is (unchanged from the prior behavior).
      if (ext === "aac") {
        try {
          buffer = await remuxAacToM4a(buffer);
          ext = "m4a";
        } catch (err2) {
          console.error("AAC remux failed:", err2 instanceof Error ? err2.message : err2);
          return NextResponse.json(
            { text: null, error: "remux_failed", detail: err2 instanceof Error ? err2.message : String(err2) },
            { status: 500 }
          );
        }
      }
    }

    // Send Content-Type derived from the (possibly normalized/aliased) ext,
    // not the original raw mimeType — the whole point of the alias table
    // above is to correct a mislabeled type before it reaches Groq again.
    const EXT_TO_CONTENT_TYPE: Record<string, string> = {
      m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", mpga: "audio/mpeg",
      wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/opus",
      webm: "audio/webm",
    };
    const blob = new Blob([new Uint8Array(buffer)], { type: EXT_TO_CONTENT_TYPE[ext] ?? mimeType ?? "audio/mp4" });

    // Whisper's `prompt` is a STYLE/vocabulary exemplar prepended to the decoder
    // (not an instruction) — it shifts the language-model prior toward whatever
    // text it's given. Two things matter, both verified against Whisper docs:
    //   • Only the LAST ~224 tokens are read (Whisper drops the head), and Arabic
    //     tokenizes heavier than English — so the load-bearing content (the
    //     throat-letter pairs + "space out every letter" style) goes at the END.
    //   • It works as a soft prior for spelling-disambiguation of acoustically
    //     close tokens (exactly our ح/ه case) but is NOT reliable on its own —
    //     the wanted-list anchor (anchorPlateToWanted) is the authoritative net;
    //     this only reduces how often a plate reaches it already-wrong.
    //
    // Observed failures this targets: adjacent Egyptian letter-names merged into
    // real words ("حاء باء لام"→"حابة علامة", "حه هه"→"حهة"), ح heard as bare ه,
    // and repeated digits collapsed/summarized ("صفر صفر صفر"→"ثلاثة صفار") or the
    // model editorializing ("أو مثلاً"). The style exemplar shows: every letter is
    // its own spaced word, ح and ه appear as TWO distinct adjacent tokens
    // (balanced so the prior doesn't over-swing either way), and repeated digits
    // are written out literally, never summarized.
    // ملاحظة: الأمثلة كلها بالصيغة الصحيحة فقط — ممنوع إدراج صيغ خاطئة (زي «رهع»
    // بدل «رحع») لأن Whisper بيميل يكرّر أمثلة الـ prompt حرفياً في المخرجات
    // (bias-hallucination)، فمثال غلط بيعلّمه يطلّع الغلط. وممنوع سرد لوحات
    // كاملة كأمثلة عشان مايهلوسهاش كنتائج — الأمثلة أسلوب إملاء فقط.
    const PLATE_DICTATION_PROMPT =
      "إملاء لوحة سيارة سعودية، مأمور مصري، كل حرف كلمة منفصلة وكل رقم منفصل، بدون أي تعليق أو تلخيص، والأرقام المكررة تُكتب كما تُنطق: صفر صفر صفر مش ثلاثة أصفار. أسلوب الإملاء: دال به نون اتنين اربعة ستة تمانية. حه ميم كاف خمسة ستة سبعة واحد. الحروف المتشابهة تُكتب متمايزة كل واحدة لحالها: حه غير هه، حاء غير هاء، سين غير صاد، قاف غير كاف، دال غير طاء، عين غير ألف.";

    // whisper-large-v3 (not the "-turbo" variant) — turbo trades accuracy for
    // speed, and this app's whole failure mode today has been mishearing
    // (letter names blended into real words, wrong digits) rather than
    // latency, so the slower full model is the better trade for this use case.
    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", "whisper-large-v3");
    form.append("language", "ar");
    // verbose_json exposes each segment's no_speech_prob — Whisper's own
    // estimate of "there's no real speech here" — needed to catch
    // hallucinated text (see below) instead of just the plain transcript.
    form.append("response_format", "verbose_json");
    form.append("prompt", PLATE_DICTATION_PROMPT);
    // Greedy/deterministic decoding — plate dictation is short, high-stakes
    // content where a confident single guess beats sampling, and temperature 0
    // reduces the hallucinated-text failure mode on quiet/short clips.
    form.append("temperature", "0");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Groq transcription error:", res.status, body.slice(0, 300));
      // Distinguish "the file's format/container isn't one Groq accepts"
      // from every other failure (bad key, rate limit, server error) — the
      // caller uses this to decide whether re-encoding the file client-side
      // and retrying is actually likely to help, instead of retrying blindly.
      let isUnsupportedFormat = false;
      try {
        const parsed = JSON.parse(body);
        isUnsupportedFormat =
          parsed?.error?.type === "invalid_request_error" &&
          /file must be one of the following types/i.test(parsed?.error?.message ?? "");
      } catch { /* not JSON — treat as a generic error below */ }
      return NextResponse.json(
        {
          text: null,
          error: isUnsupportedFormat ? "unsupported_format" : "groq_error",
          detail: res.status,
          hint: body.slice(0, 200),
        },
        { status: 500 }
      );
    }

    const data = await res.json();

    // On silence/noise/very short clips, Whisper doesn't reliably return
    // empty text — it can hallucinate plausible-sounding text from its
    // training data instead (observed in the wild: "ترجمة نانسي قنقر", a
    // subtitle-translator credit — a well-documented Whisper failure mode on
    // low-content audio). Each segment carries Whisper's own estimate of
    // "there's no real speech here" (no_speech_prob, 0-1); drop any segment
    // above a conservative threshold rather than pass its likely-fabricated
    // text through as if it were a real (mis-)transcription. Threshold kept
    // high (0.7) specifically to avoid discarding real-but-quiet speech —
    // false positives here (keeping a hallucination) are far less costly
    // than false negatives (silently dropping a genuine plate).
    const NO_SPEECH_THRESHOLD = 0.7;
    const segments: Array<{ text: string; no_speech_prob?: number }> = data.segments ?? [];
    const text = segments.length > 0
      ? segments
          .filter((s) => (s.no_speech_prob ?? 0) <= NO_SPEECH_THRESHOLD)
          .map((s) => s.text)
          .join(" ")
          .trim()
      : (data.text ?? "");

    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("transcribe error:", msg);
    return NextResponse.json({ text: null, error: "server_error", detail: msg }, { status: 500 });
  }
}
