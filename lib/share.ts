/**
 * share.ts — share a plate finding (text + photo) to WhatsApp / any app.
 *
 * Native (Capacitor): writes the image to the cache dir and opens the system
 * share sheet with the text + file attached. Web: uses the Web Share API with
 * the image file when the browser/OS supports file sharing, otherwise falls
 * back to a text-only wa.me link (URLs can't carry an image attachment).
 */

/** Build the WhatsApp/share caption for a wanted-plate finding. */
export function buildPlateShareText(opts: {
  plate: string;
  status?: string;                 // e.g. "متشيكة بالكاميرا"
  details?: [string, string][];    // [label, value] extra columns
  mapsLink?: string;
  dateText?: string;
}): string {
  const lines = [`🚗 لوحة مطلوبة: ${opts.plate}`];
  if (opts.status) lines.push(`✅ ${opts.status}`);
  for (const [k, v] of opts.details ?? []) {
    if (!String(v).trim()) continue;
    lines.push(`${k}: ${v}`);
  }
  if (opts.mapsLink) lines.push(`📍 الموقع: ${opts.mapsLink}`);
  if (opts.dateText) lines.push(`التاريخ: ${opts.dateText}`);
  return lines.join("\n");
}

/** Decode a base64 data URL into a Blob. Defaults to image/jpeg. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = head.match(/data:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ASCII-safe cache filename (Android FileProvider chokes on Arabic names).
function safeCacheName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = (dot > 0 ? filename.slice(dot + 1) : "").replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  return `plate-share.${ext}`;
}

export type ShareOutcome = "shared" | "whatsapp-text" | "cancelled";

/**
 * Share an image (data URL) plus a text caption. Prefers a real file share
 * (native sheet / Web Share API) so the photo is attached; falls back to a
 * text-only WhatsApp link when file sharing isn't available.
 */
export async function shareImageWithText(
  imageDataUrl: string,
  text: string,
  filename: string,
  title: string
): Promise<ShareOutcome> {
  // ── Native (Capacitor) ──────────────────────────────────────────────────
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      try {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const base64 = imageDataUrl.split(",")[1] ?? "";
        const { uri } = await Filesystem.writeFile({
          path: safeCacheName(filename),
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({ title, text, url: uri, dialogTitle: title });
        return "shared";
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError" || /cancel/i.test(e?.message ?? "")) return "cancelled";
        // real native failure — fall through to the web/text path
      }
    }
  } catch {
    /* @capacitor/core unavailable — treat as web */
  }

  // ── Web Share API with the image file ───────────────────────────────────
  try {
    const blob = dataUrlToBlob(imageDataUrl);
    const file = new File([blob], filename, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean };
    if (typeof navigator !== "undefined" && nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title });
      return "shared";
    }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "AbortError") return "cancelled";
    /* fall through to text-only */
  }

  // ── Fallback: WhatsApp text only (a URL can't attach the image) ──────────
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  return "whatsapp-text";
}
