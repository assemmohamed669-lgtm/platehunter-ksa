/**
 * الدمجات الصوتية — بيانات نقية منقولة حرفياً من `plateParser.ts`
 * ==============================================================
 * نقل حرفي لـ `PHONETIC_MERGES`. لما محرك التفريغ يدمج حروف متقطّعة في كلمة
 * عربية حقيقية (حابة علامة → ح ب ل، راياء → ر ي، ياسين → ي س)، القائمة دي
 * بترجّعها لحروفها. الترتيب النهائي **الأطول-أولاً** محفوظ زي الأصل.
 *
 * ⚠️ عبارة «حابة علامة» متقصورة على العبارة الكاملة (كلمتين مع بعض) عمداً —
 * «علامة»/«حابة» لوحدها كلام ميداني مشروع، ودمج أي واحدة منهم لوحدها بيفسد
 * الملاحظات (اتأكّد بمراجعة عدائية في الأصل). سيبها زي ما هي بالظبط.
 */
export const PHONETIC_MERGES: [string, string][] = ([
  // Whisper merges the 3 spelled letters "حا با لام" into these two real
  // Arabic words when dictated back-to-back ("حابة علامة" → ح ب ل).
  // Deliberately scoped to the WHOLE two-word phrase, never either word
  // alone: bare "علامة" ("sign/mark") and "حابة" ("wants", fem.) are common,
  // legitimate field-note vocabulary ("جنب علامة الطريق", "المالكة حابة
  // تسدد") — merging either unconditionally was found (adversarial review)
  // to corrupt real notes and adjacent plates. The pipeline's ه→هـ rewrite
  // now runs AFTER this table (moved to fix "هاء"/"ميه" getting corrupted if
  // it ran earlier — see the rewrite's own comment below), so raw SR output
  // reaches here with BARE ه, not هـ. Every realistic teh-marbuta/bare-heh/
  // tatweel-heh spelling combination is listed so none of them depend on
  // ordering relative to that rewrite.
  ["حابة علامة", "ح ب ل"], ["حابهـ علامهـ", "ح ب ل"],
  ["حابة علامهـ", "ح ب ل"], ["حابهـ علامة", "ح ب ل"],
  ["حابه علامه", "ح ب ل"], ["حابه علامة", "ح ب ل"],
  ["حابة علامه", "ح ب ل"], ["حابه علامهـ", "ح ب ل"],
  ["حابهـ علامه", "ح ب ل"],
  // "راء ياء" (letters ر ي) glued into one word with no space between them —
  // neither LETTER_NAMES entry can match mid-word, and it's not a real
  // Arabic word otherwise, so low collision risk.
  ["راياء", "ر ي"],
  // "ياء سين" (letters ي س) glued into "ياسين" — same class as راياء. It's
  // also a real name, but in letter-by-letter plate dictation it's always
  // the two letters, and it never appears in this app's note vocabulary.
  ["ياسين", "ي س"],
  ["احلام", "ا ح ل"],
  ["احلم",  "ا ح ل"],
  ["بالو",  "ب ل"],
  ["مالو",  "م ل"],
  ["دالو",  "د ل"],
  ["سارو",  "س ر"],
  ["كادو",  "ك د"],
  ["نالو",  "ن ل"],
  ["رامو",  "ر م"],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);
