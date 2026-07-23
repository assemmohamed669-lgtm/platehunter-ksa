/**
 * استخدام بيانات الكلمات من Deepgram (توقيت + ثقة) لتحسين تقسيم اللوحات —
 * الخطوة ٤. جوّه المحلّل فقط، بلا أي واجهة مراجعة.
 *
 * المشكلة اللي بيحلها (اتّأكدت بتجربة ميدانية): لما المندوب يقول لوحات ورا بعض،
 * Deepgram أحياناً بيرجّعهم في نتيجة نهائية واحدة، فأرقام لوحة بتتلخبط مع حروف
 * اللوحة اللي بعدها. الحل: نفصلهم عند **الفجوة الزمنية** بين الكلمات (الوقفة
 * الطبيعية بين لوحتين أطول من الفجوة بين حروف/أرقام نفس اللوحة).
 *
 * دوال نقية قابلة للاختبار — القراءة من رسالة WebSocket في الصفحة.
 */

export interface DgWord {
  word: string;
  start?: number;      // ثانية بداية الكلمة
  end?: number;        // ثانية نهاية الكلمة
  confidence?: number; // 0..1 (لترجيح التصحيح لاحقاً — خطوة ٥)
}

/**
 * يفصل قائمة الكلمات لمقاطع عند أي فجوة زمنية ≥ gapSec (بين نهاية كلمة وبداية
 * اللي بعدها). كل مقطع = نص كلماته بمسافات. توقيتات ناقصة → مفيش فصل (مقطع
 * واحد آمن، مايضيّعش لوحات).
 */
export function segmentByGap(words: DgWord[], gapSec = 0.65): string[] {
  if (!Array.isArray(words) || words.length === 0) return [];
  const segments: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i > 0) {
      const prevEnd = words[i - 1].end;
      const curStart = words[i].start;
      if (typeof prevEnd === "number" && typeof curStart === "number") {
        const gap = curStart - prevEnd;
        if (gap >= gapSec && cur.length > 0) {
          segments.push(cur.join(" "));
          cur = [];
        }
      }
    }
    const text = (words[i].word ?? "").trim();
    if (text) cur.push(text);
  }
  if (cur.length > 0) segments.push(cur.join(" "));
  return segments.filter(Boolean);
}

/** يقرأ words[] من رسالة Deepgram (channel.alternatives[0].words) بأمان. */
export function readDeepgramWords(msg: unknown): DgWord[] {
  const raw = (msg as { channel?: { alternatives?: Array<{ words?: unknown }> } })
    ?.channel?.alternatives?.[0]?.words;
  if (!Array.isArray(raw)) return [];
  const out: DgWord[] = [];
  for (const w of raw) {
    const o = w as Record<string, unknown>;
    const word = typeof o?.word === "string" ? o.word : "";
    if (!word) continue;
    out.push({
      word,
      start: typeof o.start === "number" ? o.start : undefined,
      end: typeof o.end === "number" ? o.end : undefined,
      confidence: typeof o.confidence === "number" ? o.confidence : undefined,
    });
  }
  return out;
}
