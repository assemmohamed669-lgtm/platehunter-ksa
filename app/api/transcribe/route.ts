import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const { audio, mimeType, apiKey } = await req.json();
    if (typeof audio !== "string" || !audio || typeof apiKey !== "string" || !apiKey) {
      return NextResponse.json({ text: null, error: "missing_audio_or_key" }, { status: 400 });
    }

    let buffer: Buffer = Buffer.from(audio, "base64");
    let ext = (mimeType?.split("/")[1] ?? "m4a").split(";")[0];
    ext = MIME_SUBTYPE_ALIASES[ext] ?? ext;

    if (ext === "aac") {
      try {
        buffer = await remuxAacToM4a(buffer);
        ext = "m4a";
      } catch (err) {
        console.error("AAC remux failed:", err instanceof Error ? err.message : err);
        return NextResponse.json(
          { text: null, error: "remux_failed", detail: err instanceof Error ? err.message : String(err) },
          { status: 500 }
        );
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

    // Whisper's `prompt` biases both vocabulary and formatting toward
    // whatever text it's given — without it, the model treats spelled-out
    // plate letters as ordinary speech and blends them into real words it
    // knows (observed: "حاء باء لام" → "حابة علامة", "واو" → "راو"). Priming
    // it with the actual letter names and digit words steers it toward
    // recognizing this as letter-by-letter dictation instead.
    const PLATE_DICTATION_PROMPT =
      "تسجيل لوحة سيارة سعودية: يُملي المسجّل حروف اللوحة حرفاً حرفاً بأسمائها الفصيحة مثل ألف باء حاء دال راء سين صاد طاء عين قاف كاف لام ميم نون هاء واو ياء، ثم يُملي الأرقام رقماً رقماً مثل صفر واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة.";

    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "ar");
    form.append("response_format", "json");
    form.append("prompt", PLATE_DICTATION_PROMPT);

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
    return NextResponse.json({ text: data.text ?? "" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("transcribe error:", msg);
    return NextResponse.json({ text: null, error: "server_error", detail: msg }, { status: 500 });
  }
}
