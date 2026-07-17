/**
 * المرحلة ٧ — التقطيع + توجيه الملاحظات + سحب النوع
 * ================================================
 * بتقطّع النص المطبّع لتوكنات مصنّفة وبتوزّعها:
 *  - كلمات الاتجاه/المكان (`NOTE_KEYWORDS`) → خانة الملاحظات (note routing).
 *  - أنواع المركبات (`VEHICLE_TYPES`) → خانة النوع.
 *  - أرقام / حروف صالحة → توكنات لوحة.
 *  - توكن ملزوق حروف+أرقام → بيتفك.
 *
 * ⚠️ note routing (هنا) **غير** noise removal (في `removeNoise`): دي كلمات ليها
 * معنى بتتحفظ في الملاحظات، مش كلام بيتشال.
 *
 * مبدأ «ممنوع الإسقاط الصامت»: أي توكن مش متعرّف عليه **بيتحفظ** كـ unknown بثقة
 * منخفضة ويتسجّل في الـ trace — ماينفعش يختفي.
 */
import { NormalizationContext, addTrace } from "./types";
import { VALID_PLATE_LETTERS, extractPlateLetters } from "./plateShape";
import { NOTE_KEYWORDS } from "../dictionaries/noiseWords";
import { VEHICLE_TYPES } from "../dictionaries/vehicleTypes";

export function normalizeWords(ctx: NormalizationContext): void {
  const rawTokens = ctx.text.split(/\s+/).filter(Boolean);
  let classified = 0;

  for (const raw of rawTokens) {
    // ── توجيه الملاحظات (اتجاه/مكان) ──────────────────────────────────────
    if (NOTE_KEYWORDS.has(raw)) {
      ctx.notes.push(raw);
      addTrace(ctx, "normalizeWords", raw, "", "توجيه ملاحظة (اتجاه/مكان)");
      continue;
    }
    // ── نوع المركبة ───────────────────────────────────────────────────────
    const vt = VEHICLE_TYPES.find((v) => raw.includes(v));
    if (vt) {
      ctx.vehicleTypes.push(vt);
      ctx.tokens.push({ text: vt, kind: "vehicle", confidence: "high", origin: "vehicleTypes" });
      addTrace(ctx, "normalizeWords", raw, vt, "سحب نوع مركبة");
      continue;
    }
    // ── أرقام بحتة ────────────────────────────────────────────────────────
    if (/^\d+$/.test(raw)) {
      for (const d of raw) ctx.tokens.push({ text: d, kind: "digit", confidence: "high", origin: "digits" });
      classified++;
      continue;
    }
    // ── توكن ملزوق حروف+أرقام (حمل8121) ───────────────────────────────────
    const glued = raw.match(/^([؀-ۿ]+)(\d+)$/);
    if (glued) {
      const letters = extractPlateLetters(glued[1]);
      if (letters.length > 0) {
        for (const l of letters) ctx.tokens.push({ text: l, kind: "letter", confidence: "high", origin: "glued" });
        for (const d of glued[2]) ctx.tokens.push({ text: d, kind: "digit", confidence: "high", origin: "glued" });
        addTrace(ctx, "normalizeWords", raw, letters.join("") + glued[2], "فك توكن ملزوق حروف+أرقام");
        classified++;
        continue;
      }
    }
    // ── حروف لوحة صالحة (١..٣) ─────────────────────────────────────────────
    const chars = [...raw];
    if (chars.length >= 1 && chars.length <= 3 && chars.every((c) => VALID_PLATE_LETTERS.has(c))) {
      for (const c of chars) ctx.tokens.push({ text: c, kind: "letter", confidence: "high", origin: "letters" });
      classified++;
      continue;
    }
    // ── غير معروف — بيتحفظ بثقة منخفضة (لا إسقاط صامت) ─────────────────────
    ctx.tokens.push({ text: raw, kind: "unknown", confidence: "low", origin: "normalizeWords" });
    addTrace(ctx, "normalizeWords", raw, raw, "توكن غير معروف — محتفظ بيه بثقة منخفضة للمراجعة", "low");
  }

  addTrace(ctx, "normalizeWords", ctx.text, `${ctx.tokens.length} توكن`, `تقطيع (${classified} مجموعة لوحة)`);
}
