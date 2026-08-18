# -*- coding: utf-8 -*-
"""
LITERAL Python port of lib/plateParser.ts (PlateHunter KSA).

Source of truth:
  C:/Users/assem/OneDrive/Dokumente/GitHub/platehunter-ksa/.claude/worktrees/
  competent-varahamihira-f2cf2d/lib/plateParser.ts

Ported (same order, same fallbacks, same edge cases — NOT "improved"):
  remove_diacritics, replace_all, normalize_numerals, is_all_plate_letters,
  extract_letters_from_token, extract_vehicle_type,
  bank_plate_to_arabic, normalize_plate, parse_plate_from_transcript,
  plate_needs_review, levenshtein, similarity_percent,
  VALID_AR_LETTERS, VALID_PLATE_LETTERS, EN_TO_AR, EGYPTIAN_LETTERS,
  LETTER_NAMES, PHONETIC_MERGES, SPOKEN_NUMBERS, VEHICLE_TYPES,
  NOTE_KEYWORDS, ARABIC_INDIC, ZERO_WORD_RE

The lookup tables below were MACHINE-EXTRACTED from the .ts file (see
gen_tables.py) so they cannot drift from the TS by a transcription typo.

=====================================================================
JS/TS  vs  PYTHON  SEMANTIC DIFFERENCES — each one handled explicitly
=====================================================================
(1) `\\d` in JS RegExp is ASCII-ONLY [0-9]. Python's `re` `\\d` on a str
    pattern ALSO matches Unicode decimal digits (Arabic-Indic ٠-٩,
    extended ۰-۹, Devanagari …). Every ported `\\d` is written as the
    explicit class [0-9]. This matters: normalize_numerals only folds
    U+0660-0669, so extended Arabic-Indic U+06F0-06F9 survives the
    pipeline and Python's `\\d` would have wrongly accepted it as a
    digit token where JS does not.
(2) JS String.prototype.replace(stringPattern, ...) replaces only the
    FIRST occurrence; Python str.replace replaces ALL. Every such call
    is ported with count=1 (steps 2, 10, 11).
(3) JS Math.round rounds .5 toward +Infinity; Python round() is
    banker's rounding. similarity_percent uses _js_round = floor(x+0.5).
(4) JS String.prototype.length / charCodeAt / [i] are UTF-16 CODE UNIT
    based; Python str indexing is CODE POINT based. Every character this
    parser touches is BMP (Arabic U+0600-06FF, ASCII, digits), so code
    units == code points and the index arithmetic (incl. the two-char
    "هـ" = U+0647 + U+0640 unit handling) is identical. No surrogate
    pair can reach these paths — step 8 of the pipeline strips
    everything outside [U+0600-U+06FF], digits and whitespace, so any
    astral char (emoji etc.) is gone before indexing happens.
(5) JS tok[i + 1] past the end yields `undefined` (a normal falsy
    compare); Python raises IndexError. Ported with explicit bounds
    checks that reproduce the JS "not equal to 'ـ'" outcome.
(6) JS Array.prototype.sort is stable (ES2019+) and so is Python's
    sorted(); the longest-first table sorts therefore keep the original
    declaration order among equal-length keys in both languages.
(7) JS `\\s` == [\\f\\n\\r\\t\\v\\u0020\\u00a0\\u1680\\u2000-\\u200a
    \\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]. Python `re` `\\s` on str
    adds \\x1c-\\x1f and \\x85 and OMITS \\ufeff. Likewise JS .trim()
    strips \\ufeff while Python .strip() does not. Left as-is (matching
    Python) because no ASR transcript in this corpus contains those
    characters; flagged here for completeness.
(8) JS interpolates the table keys RAW into `new RegExp(...)`; the port
    calls re.escape() on them. The keys are pure Arabic letters plus
    spaces (no regex metacharacters), and Python's re.escape leaves
    letters untouched and turns a space into "\\ " which still matches a
    literal space — so the compiled pattern is equivalent.
(9) JS Number("0080") === 80 and Python int("0080") == 80 — same. Both
    reduce/sum start at 0.
(10) `raw.toUpperCase()` (JS) vs `raw.upper()` (Python): both implement
    Unicode full case mapping incl. length-changing SpecialCasing
    (ß→SS). Arabic and ASCII, the only things bank_plate_to_arabic
    meets in practice, are identical under both.
"""

import re

EGYPTIAN_LETTERS = {
    "الف": "ا",
    "ألف": "ا",
    "الالف": "ا",
    "الألف": "ا",
    "به": "ب",
    "بة": "ب",
    "حه": "ح",
    "حة": "ح",
    "دال": "د",
    "ره": "ر",
    "رة": "ر",
    "سين": "س",
    "طه": "ط",
    "طة": "ط",
    "عين": "ع",
    "قاف": "ق",
    "كاف": "ك",
    "لام": "ل",
    "ميم": "م",
    "نون": "ن",
    "هه": "ه",
    "هة": "ه",
    "واو": "و",
    "يه": "ي",
    "ية": "ي",
    "اليف": "ا",
    "باء": "ب",
    "حاء": "ح",
    "حا": "ح",
    "راء": "ر",
    "طاء": "ط",
    "طا": "ط",
    "هاء": "ه",
    "ها": "ه",
    "ياء": "ي",
    "يا": "ي",
    "صفر": "0",
    "واحد": "1",
    "اتنين": "2",
    "اثنين": "2",
    "تلاتة": "3",
    "ثلاثة": "3",
    "اربعة": "4",
    "أربعة": "4",
    "خمسة": "5",
    "ستة": "6",
    "سبعة": "7",
    "تمانية": "8",
    "ثمانية": "8",
    "تسعة": "9",
}
# count=50

EN_TO_AR = {
    "A": "ا",
    "B": "ب",
    "C": "ح",
    "J": "ح",
    "D": "د",
    "R": "ر",
    "S": "س",
    "X": "ص",
    "T": "ط",
    "E": "ع",
    "G": "ق",
    "K": "ك",
    "L": "ل",
    "M": "م",
    "Z": "م",
    "N": "ن",
    "H": "ه",
    "U": "و",
    "V": "ي",
}
# count=19

VALID_AR_LETTERS_LIST = [
    "ا",
    "ب",
    "ح",
    "د",
    "ر",
    "س",
    "ص",
    "ط",
    "ع",
    "ق",
    "ك",
    "ل",
    "م",
    "ن",
    "هـ",
    "ه",
    "و",
    "ي",
    "ى",
]
# count=19

VEHICLE_TYPES = [
    "ونيت",
    "فان",
    "دباب",
    "شاحنة",
    "باص",
    "صالون",
    "بيكاب",
    "تاكسي",
    "كروزر",
    "باترول",
    "نقليات",
    "مفحوطة",
    "مصدومة",
    "مصدومه",
    "مركونة",
    "مركونه",
    "معطلة",
    "معطله",
]
# count=18

NOTE_KEYWORDS_LIST = [
    "يمين",
    "اليمين",
    "يسار",
    "اليسار",
    "شمال",
    "الشمال",
    "امام",
    "أمام",
    "قدام",
    "خلف",
    "ورا",
    "وراء",
    "جنب",
    "بجانب",
    "فوق",
    "تحت",
    "داخل",
    "جوه",
    "برا",
    "خارج",
    "جراج",
    "الجراج",
    "كراج",
    "الكراج",
    "موقف",
    "الموقف",
    "باركن",
    "باركنج",
    "برحة",
    "بارحة",
    "البرحة",
    "البارحة",
    "حارة",
    "الحارة",
    "طريق",
    "الطريق",
    "شارع",
    "الشارع",
    "دوار",
    "الدوار",
    "كوبري",
    "الكوبري",
    "عمارة",
    "العمارة",
    "فيلا",
    "الفيلا",
    "محل",
    "المحل",
    "مدخل",
    "مخرج",
]
# count=50

LETTER_NAMES_RAW = [
    ("ألف", "ا"),
    ("الف", "ا"),
    ("آلف", "ا"),
    ("باء", "ب"),
    ("بَاء", "ب"),
    ("با", "ب"),
    ("تاء", "ت"),
    ("تَاء", "ت"),
    ("ثاء", "ث"),
    ("ثَاء", "ث"),
    ("جيم", "ج"),
    ("جِيم", "ج"),
    ("حاء", "ح"),
    ("حَاء", "ح"),
    ("حا", "ح"),
    ("خاء", "خ"),
    ("خَاء", "خ"),
    ("دال", "د"),
    ("دَال", "د"),
    ("ذال", "ذ"),
    ("ذَال", "ذ"),
    ("راء", "ر"),
    ("رَاء", "ر"),
    ("را", "ر"),
    ("زاي", "ز"),
    ("زَاي", "ز"),
    ("سين", "س"),
    ("سِين", "س"),
    ("شين", "ش"),
    ("شِين", "ش"),
    ("صاد", "ص"),
    ("صَاد", "ص"),
    ("صادي", "ص"),
    ("ضاد", "ض"),
    ("ضَاد", "ض"),
    ("طاء", "ط"),
    ("طَاء", "ط"),
    ("طا", "ط"),
    ("ظاء", "ظ"),
    ("ظَاء", "ظ"),
    ("عين", "ع"),
    ("عَين", "ع"),
    ("غين", "غ"),
    ("غَين", "غ"),
    ("فاء", "ف"),
    ("فَاء", "ف"),
    ("قاف", "ق"),
    ("قَاف", "ق"),
    ("قافي", "ق"),
    ("ءاف", "ق"),
    ("آف", "ق"),
    ("اف", "ق"),
    ("كاف", "ك"),
    ("كَاف", "ك"),
    ("كي", "ك"),
    ("لام", "ل"),
    ("لَام", "ل"),
    ("ميم", "م"),
    ("مِيم", "م"),
    ("نون", "ن"),
    ("نُون", "ن"),
    ("هاء", "هـ"),
    ("هَاء", "هـ"),
    ("واو", "و"),
    ("وَاو", "و"),
    ("وا", "و"),
    ("ياء", "ي"),
    ("يَاء", "ي"),
    ("يا", "ي"),
    ("الألف", "ا"),
    ("الالف", "ا"),
    ("الفا", "ا"),
    ("الباء", "ب"),
    ("الحاء", "ح"),
    ("حاه", "ح"),
    ("الدال", "د"),
    ("داه", "د"),
    ("الراء", "ر"),
    ("ريه", "ر"),
    ("السين", "س"),
    ("سينه", "س"),
    ("الصاد", "ص"),
    ("صاده", "ص"),
    ("الطاء", "ط"),
    ("طاه", "ط"),
    ("القاف", "ق"),
    ("الكاف", "ك"),
    ("كافه", "ك"),
    ("اللام", "ل"),
    ("الميم", "م"),
    ("ميمه", "م"),
    ("النون", "ن"),
    ("نونه", "ن"),
    ("الهاء", "هـ"),
    ("الواو", "و"),
    ("واوه", "و"),
    ("الياء", "ي"),
]
# count=97

PHONETIC_MERGES_RAW = [
    ("حابة علامة", "ح ب ل"),
    ("حابهـ علامهـ", "ح ب ل"),
    ("حابة علامهـ", "ح ب ل"),
    ("حابهـ علامة", "ح ب ل"),
    ("حابه علامه", "ح ب ل"),
    ("حابه علامة", "ح ب ل"),
    ("حابة علامه", "ح ب ل"),
    ("حابه علامهـ", "ح ب ل"),
    ("حابهـ علامه", "ح ب ل"),
    ("راياء", "ر ي"),
    ("ياسين", "ي س"),
    ("احلام", "ا ح ل"),
    ("احلم", "ا ح ل"),
    ("بالو", "ب ل"),
    ("مالو", "م ل"),
    ("دالو", "د ل"),
    ("سارو", "س ر"),
    ("كادو", "ك د"),
    ("نالو", "ن ل"),
    ("رامو", "ر م"),
]
# count=20

SPOKEN_NUMBERS_RAW = [
    ("صفر", "0"),
    ("واحد", "1"),
    ("وحده", "1"),
    ("اثنين", "2"),
    ("اتنين", "2"),
    ("اثنان", "2"),
    ("تنين", "2"),
    ("ثلاثة", "3"),
    ("تلاتة", "3"),
    ("تلاته", "3"),
    ("ثلاث", "3"),
    ("تلات", "3"),
    ("تلته", "3"),
    ("أربعة", "4"),
    ("اربعة", "4"),
    ("اربعه", "4"),
    ("أربعه", "4"),
    ("أربع", "4"),
    ("اربع", "4"),
    ("ربعة", "4"),
    ("ربعه", "4"),
    ("خمسة", "5"),
    ("خمسه", "5"),
    ("خمس", "5"),
    ("ستة", "6"),
    ("سته", "6"),
    ("ست", "6"),
    ("سبعة", "7"),
    ("سبعه", "7"),
    ("سبع", "7"),
    ("ثمانية", "8"),
    ("تمانية", "8"),
    ("ثمانيه", "8"),
    ("تمانيه", "8"),
    ("تمنية", "8"),
    ("تمنيه", "8"),
    ("ثماني", "8"),
    ("تماني", "8"),
    ("تمان", "8"),
    ("تسعة", "9"),
    ("تسعه", "9"),
    ("تسع", "9"),
    ("الصفر", "0"),
    ("الواحد", "1"),
    ("الاثنين", "2"),
    ("الاتنين", "2"),
    ("الثلاثة", "3"),
    ("التلاتة", "3"),
    ("الأربعة", "4"),
    ("الاربعة", "4"),
    ("الخمسة", "5"),
    ("الستة", "6"),
    ("السبعة", "7"),
    ("الثمانية", "8"),
    ("التمانية", "8"),
    ("التسعة", "9"),
    ("تلات خمسات", "555"),
    ("ثلاث خمسات", "555"),
    ("تلاته خمسات", "555"),
    ("تلات اصفار", "000"),
    ("ثلاث اصفار", "000"),
    ("تلاته اصفار", "000"),
    ("عشرة", "10"),
    ("عشره", "10"),
    ("أحد عشر", "11"),
    ("احد عشر", "11"),
    ("إحدى عشر", "11"),
    ("حداشر", "11"),
    ("حداعشر", "11"),
    ("اثنا عشر", "12"),
    ("اثني عشر", "12"),
    ("اتنا عشر", "12"),
    ("اتناشر", "12"),
    ("اتنعشر", "12"),
    ("ثلاثة عشر", "13"),
    ("تلاتة عشر", "13"),
    ("تلتاشر", "13"),
    ("أربعة عشر", "14"),
    ("اربعة عشر", "14"),
    ("اربعتاشر", "14"),
    ("خمسة عشر", "15"),
    ("خمستاشر", "15"),
    ("خمسطاشر", "15"),
    ("ستة عشر", "16"),
    ("ستاشر", "16"),
    ("سطاشر", "16"),
    ("سبعة عشر", "17"),
    ("سبعتاشر", "17"),
    ("ثمانية عشر", "18"),
    ("تمانية عشر", "18"),
    ("تمانتاشر", "18"),
    ("تسعة عشر", "19"),
    ("تسعتاشر", "19"),
    ("تلاته عشر", "13"),
    ("اربعه عشر", "14"),
    ("خمسه عشر", "15"),
    ("سته عشر", "16"),
    ("سبعه عشر", "17"),
    ("تمانيه عشر", "18"),
    ("ثمانيه عشر", "18"),
    ("تسعه عشر", "19"),
    ("عشرون", "20"),
    ("عشرين", "20"),
    ("ثلاثون", "30"),
    ("ثلاثين", "30"),
    ("تلاتين", "30"),
    ("أربعون", "40"),
    ("أربعين", "40"),
    ("اربعون", "40"),
    ("اربعين", "40"),
    ("خمسون", "50"),
    ("خمسين", "50"),
    ("ستون", "60"),
    ("ستين", "60"),
    ("سبعون", "70"),
    ("سبعين", "70"),
    ("ثمانون", "80"),
    ("ثمانين", "80"),
    ("تمانين", "80"),
    ("تسعون", "90"),
    ("تسعين", "90"),
    ("ثلاثمئة", "300"),
    ("ثلاثمية", "300"),
    ("تلاتمية", "300"),
    ("تلتمية", "300"),
    ("أربعمئة", "400"),
    ("أربعمية", "400"),
    ("اربعمية", "400"),
    ("ربعمية", "400"),
    ("خمسمئة", "500"),
    ("خمسمية", "500"),
    ("ستمئة", "600"),
    ("ستمية", "600"),
    ("سبعمئة", "700"),
    ("سبعمية", "700"),
    ("ثمانمئة", "800"),
    ("ثمانمية", "800"),
    ("تمانمية", "800"),
    ("تسعمئة", "900"),
    ("تسعمية", "900"),
    ("مئتين", "200"),
    ("ميتين", "200"),
    ("مئة", "100"),
    ("مية", "100"),
    ("ميه", "100"),
    ("ثمانية آلاف", "8000"),
    ("تمانية آلاف", "8000"),
    ("ثمانية الاف", "8000"),
    ("تمانية الاف", "8000"),
    ("تسعة آلاف", "9000"),
    ("تسعة الاف", "9000"),
    ("سبعة آلاف", "7000"),
    ("سبعة الاف", "7000"),
    ("ستة آلاف", "6000"),
    ("ستة الاف", "6000"),
    ("خمسة آلاف", "5000"),
    ("خمسة الاف", "5000"),
    ("أربعة آلاف", "4000"),
    ("اربعة آلاف", "4000"),
    ("أربعة الاف", "4000"),
    ("اربعة الاف", "4000"),
    ("ثلاثة آلاف", "3000"),
    ("تلاتة آلاف", "3000"),
    ("ثلاثة الاف", "3000"),
    ("تلاتة الاف", "3000"),
    ("ألفين", "2000"),
    ("الفين", "2000"),
    ("ألف", "1000"),
    ("الف", "1000"),
    ("وتسعمئة", "900"),
    ("وتسعمية", "900"),
    ("وثمانمئة", "800"),
    ("وتمانمية", "800"),
    ("وسبعمئة", "700"),
    ("وسبعمية", "700"),
    ("وستمئة", "600"),
    ("وستمية", "600"),
    ("وخمسمئة", "500"),
    ("وخمسمية", "500"),
    ("وأربعمئة", "400"),
    ("واربعمية", "400"),
    ("وثلاثمئة", "300"),
    ("وتلاتمية", "300"),
    ("ومئتين", "200"),
    ("وميتين", "200"),
    ("ومئة", "100"),
    ("ومية", "100"),
    ("وتسعين", "90"),
    ("وثمانين", "80"),
    ("وتمانين", "80"),
    ("وسبعين", "70"),
    ("وستين", "60"),
    ("وخمسين", "50"),
    ("وأربعين", "40"),
    ("واربعين", "40"),
    ("وثلاثين", "30"),
    ("وتلاتين", "30"),
    ("وعشرين", "20"),
    ("وعشرة", "10"),
    ("وعشره", "10"),
    ("وتسعة", "9"),
    ("وتسعه", "9"),
    ("وتسع", "9"),
    ("وثمانية", "8"),
    ("وتمانية", "8"),
    ("وثمانيه", "8"),
    ("وتمانيه", "8"),
    ("وتمنيه", "8"),
    ("وسبعة", "7"),
    ("وسبعه", "7"),
    ("وسبع", "7"),
    ("وستة", "6"),
    ("وسته", "6"),
    ("وست", "6"),
    ("وخمسة", "5"),
    ("وخمسه", "5"),
    ("وخمس", "5"),
    ("وأربعة", "4"),
    ("واربعة", "4"),
    ("واربعه", "4"),
    ("وأربعه", "4"),
    ("وربعه", "4"),
    ("وأربع", "4"),
    ("وثلاثة", "3"),
    ("وتلاتة", "3"),
    ("وثلاث", "3"),
    ("وتلات", "3"),
    ("واثنين", "2"),
    ("واتنين", "2"),
    ("وواحد", "1"),
    ("ووحده", "1"),
]
# count=231

ARABIC_INDIC = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
}
# count=10

VALID_PLATE_LETTERS = set("ابحدرسصطعقكلمنهوي")
# count=17


# ─── derived sets (TS: new Set([...])) ──────────────────────────────────────
VALID_AR_LETTERS = set(VALID_AR_LETTERS_LIST)
NOTE_KEYWORDS = set(NOTE_KEYWORDS_LIST)

# ─── longest-first table sorts ──────────────────────────────────────────────
# TS: `([...] as [string,string][]).sort((a, b) => b[0].length - a[0].length)`
# JS Array.sort is stable (ES2019+) and Python's sorted() is stable, so equal
# length keys keep their declaration order in both. (JS .length counts UTF-16
# code units; every key here is BMP Arabic so it equals Python len().)
LETTER_NAMES = sorted(LETTER_NAMES_RAW, key=lambda p: -len(p[0]))
PHONETIC_MERGES = sorted(PHONETIC_MERGES_RAW, key=lambda p: -len(p[0]))
SPOKEN_NUMBERS = sorted(SPOKEN_NUMBERS_RAW, key=lambda p: -len(p[0]))

# ─── regexes (code points verified against the .ts bytes) ───────────────────
# TS line 23. The lookbehind/lookahead keep it whole-word so "وزير" is untouched.
ZERO_WORD_RE = re.compile(
    "(?<![\u0600-\u06ff])\u0632\u064a\u0631[\u0648\u0629\u0647\u0627\u0649\u064a]?(?![\u0600-\u06ff])"
)

# TS removeDiacritics: /[ً-ٟ٪-ٰ]/g == [U+064B-U+065F] + [U+066A-U+0670].
#
# CORRECTED 2026-07-30 (was the single range [U+064B-U+0670]).
# That old single range swallowed the Arabic-Indic DIGIT block U+0660-U+0669
# sitting inside it, so "972" in Arabic-Indic form was deleted HERE, long before
# normalize_numerals could fold it to ASCII "972" - and any transcript carrying
# Arabic-Indic digits came out as an EMPTY plate. The TS has since carved that
# block out (see the comment above removeDiacritics in lib/plateParser.ts); this
# port still carried the old buggy range and therefore DISAGREED with the
# shipped TS on exactly those inputs.
# Not academic: Deepgram emits Arabic-Indic digits even with numerals=true.
# Verified 4981/4981 against the transpiled TS after this fix.
_DIACRITICS_RE = re.compile("[ً-ٟ٪-ٰ]")

# TS line 196/1377: Arabic comma/semicolon/question/full-stop + ASCII punctuation.
_PUNCT_RE = re.compile("[\u060c\u061b\u061f\u06d4.,;!?]")

_ALEF_VARIANTS_RE = re.compile("[\u0623\u0625\u0622]")           # أ إ آ
_ARABIC_INDIC_RE = re.compile("[\u0660-\u0669]")
_WS_RUN_RE = re.compile(r"\s+")
_BARE_HEH_RE = re.compile("\u0647(?!\u0640)")                    # ه not followed by ـ
# TS line 1397 — ألف/الف followed by a و-compound is 1000, not the letter ا.
# Variable-length lookahead (\s+) is legal in Python; only LOOKBEHIND is
# fixed-width-only, and this pattern has none.
_ALEF_THOUSAND_RE = re.compile(
    "(?:\u0623\u0644\u0641|\u0627\u0644\u0641)(?=\\s+\u0648)"
    "(?!\\s+(?:\u0648\u0627\u0648|\u0648\u0627)(?:\\s|$))"
)
# TS line 1422: keep Arabic block + ASCII digits + whitespace.
_NON_PLATE_CHARS_RE = re.compile("[^\u0600-\u06ff0-9\\s]")
_ARABIC_CHAR_RE = re.compile("[\u0600-\u06ff]")
_ASCII_DIGITS_ONLY_RE = re.compile("[0-9]+")          # JS /^\d+$/ is ASCII-only
_ONE_TO_FOUR_DIGITS_RE = re.compile("[0-9]{1,4}")     # JS /\d{1,4}/
_TRAILING_DIGITS_RE = re.compile("([0-9]+)$")         # JS /(\d+)$/
_NOT_ARABIC_NOR_DIGIT_RE = re.compile("[^\u0600-\u06ff0-9]")


# ─── Helpers (TS "Helpers" section) ─────────────────────────────────────────

def remove_diacritics(text: str) -> str:
    """TS removeDiacritics (line 968)."""
    return _DIACRITICS_RE.sub("", text)


_pair_re_cache: dict = {}


def _pair_re(frm: str):
    r = _pair_re_cache.get(frm)
    if r is None:
        # TS: new RegExp(`(?<![\u0600-\u06FF])${from}(?![\u0600-\u06FF])`, "g")
        r = re.compile(
            "(?<![\u0600-\u06FF])" + re.escape(frm) + "(?![\u0600-\u06FF])"
        )
        _pair_re_cache[frm] = r
    return r


def replace_all(text: str, pairs) -> str:
    """TS replaceAll (line 973). Surrounds every hit with spaces, then collapses
    runs of whitespace and trims — that is what preserves word boundaries."""
    result = text
    for frm, to in pairs:
        # lambda (not a template string) so a "\\" or "\\1" in `to` could never be
        # read as a Python group reference. (All current values are digits or
        # Arabic, so this is belt-and-braces.)
        rep = " " + to + " "
        result = _pair_re(frm).sub(lambda _m, _r=rep: _r, result)
    return _WS_RUN_RE.sub(" ", result).strip()


def normalize_numerals(text: str) -> str:
    """TS normalizeNumerals (line 985)."""
    return _ARABIC_INDIC_RE.sub(
        lambda m: ARABIC_INDIC.get(m.group(0), m.group(0)), text
    )


def is_all_plate_letters(tok: str) -> bool:
    """TS isAllPlateLetters (line 991). "هـ" is two chars treated as one unit; a
    bare "ه" is accepted too (SR often drops the tatweel).
    JS diff (5): tok[i+1] past the end is `undefined` in JS, so the two-char
    branch simply fails — reproduced with the i+1 bounds check."""
    i = 0
    n = len(tok)
    while i < n:
        if tok[i] == "\u0647" and i + 1 < n and tok[i + 1] == "\u0640":
            i += 2
            continue
        if tok[i] == "\u0647":
            i += 1
            continue
        if tok[i] in VALID_AR_LETTERS:
            i += 1
            continue
        return False
    return i > 0


def egyptian_plate_letter(token: str):
    """TS egyptianPlateLetter (line 1029). An Egyptian letter NAME is ONE letter
    whatever its spelling looks like ("هه" is the letter ه, not ه+ه). Matched
    tatweel-stripped so an already-rewritten "هـهـ" resolves like the raw "هه".
    Must be tried BEFORE the per-character paths, which would split it."""
    clean = remove_diacritics(token).replace("\u0640", "")
    mapped = EGYPTIAN_LETTERS.get(clean)
    if mapped and len(mapped) == 1 and mapped in VALID_AR_LETTERS:
        return mapped
    return None


def extract_letters_from_token(token: str):
    """TS extractLettersFromToken (line 1003). Non-plate chars are SKIPPED
    (not rejected) — that is what makes the salvage paths work."""
    result = []
    i = 0
    n = len(token)
    while i < n:
        if token[i] == "\u0647" and i + 1 < n and token[i + 1] == "\u0640":
            result.append("\u0647\u0640")   # "هـ"
            i += 2
        elif token[i] in VALID_AR_LETTERS:
            result.append(token[i])
            i += 1
        else:
            i += 1
    return result


def extract_vehicle_type(text: str) -> dict:
    """TS extractVehicleType (line 534). JS diff (2): .replace(vt, " ") hits the
    FIRST occurrence only → count=1."""
    for vt in VEHICLE_TYPES:
        if vt in text:
            rest = _WS_RUN_RE.sub(" ", text.replace(vt, " ", 1)).strip()
            return {"vehicleType": vt, "rest": rest}
    return {"vehicleType": None, "rest": text}


# ─── Exported public helpers ────────────────────────────────────────────────

def bank_plate_to_arabic(raw: str) -> str:
    """TS bankPlateToArabic (line 1023)."""
    has_ascii = False
    for ch in raw:
        c = ord(ch)
        if (65 <= c <= 90) or (97 <= c <= 122):
            has_ascii = True
            break
    if not has_ascii:
        # TS: /[^؀-ۿ0-9٠-٩]/g — the ٠-٩ part is redundant (inside ؀-ۿ).
        return _NOT_ARABIC_NOR_DIGIT_RE.sub("", raw)

    upper = raw.upper()   # JS diff (10)
    result = []
    for ch in upper:
        code = ord(ch)
        if 48 <= code <= 57:
            result.append(ch)
            continue
        if 65 <= code <= 90:
            result.append(EN_TO_AR.get(ch, ch))
            continue
        if code >= 0x0600:
            result.append(ch)
            continue
        # else: space, dash, dot, slash, etc. → skip
    return "".join(result)


def normalize_plate(plate: str) -> str:
    """TS normalizePlate (line 1049). Keeps the manual charCode scan (it is a
    hot path in the TS) so the ported control flow is identical."""
    if not plate:
        return ""

    needs_clean = False
    for i in range(len(plate) - 1, -1, -1):
        c = ord(plate[i])
        if (
            (c <= 127 and (c < 48 or c > 57))     # any non-digit ASCII char
            or c == 1571 or c == 1573 or c == 1570  # أ إ آ
            or c == 1609                            # ى
            or c == 1600                            # ـ tatweel
            or (1632 <= c <= 1641)                  # ٠-٩ Arabic-Indic
        ):
            needs_clean = True
            break

    if needs_clean:
        s = _ALEF_VARIANTS_RE.sub("\u0627", plate)
        s = s.replace("\u0649", "\u064a")          # ى → ي (JS /ى/g = all)
        s = s.replace("\u0640", "")                # strip tatweel
        s = normalize_numerals(s)
        s = _NOT_ARABIC_NOR_DIGIT_RE.sub("", s)
    else:
        s = plate

    if not s:
        return ""

    # first contiguous ASCII-digit run
    d_start = -1
    d_end = -1
    in_run = False
    for i, ch in enumerate(s):
        c = ord(ch)
        if 48 <= c <= 57:
            if not in_run:
                d_start = i
                in_run = True
            d_end = i
        elif in_run:
            break

    if d_start == -1:
        return s   # no digits

    letters = "".join(ch for ch in s if not (48 <= ord(ch) <= 57))
    return letters + s[d_start:d_end + 1].rjust(4, "0")


def plate_needs_review(normalized: str) -> bool:
    """TS plateNeedsReview (line 1758)."""
    if not normalized:
        return True
    letters = re.sub("[0-9\u0660-\u0669]", "", normalized)
    digits = re.sub("[^0-9\u0660-\u0669]", "", normalized)
    if len(letters) == 0 or len(digits) == 0:
        return True
    if len(letters) > 3 or len(digits) > 4:
        return True
    for ch in letters:
        if ch not in VALID_PLATE_LETTERS:
            return True
    return False


# ─── Main parser ───────────────────────────────────────────────────────────

def parse_plate_from_transcript(transcript: str) -> dict:
    """TS parsePlateFromTranscript (line 1367).

    Returns {"plate", "vehicleType", "notes", "normalized", "uncertain"} where
    `uncertain` is True or None (TS: `uncertain || undefined`) and
    `vehicleType` is a str or None (TS: `string | undefined`).
    """
    text = transcript.strip()   # JS diff (7): .trim() also strips \ufeff

    # 1. Remove diacritics
    text = remove_diacritics(text)

    # 1b. Punctuation → space (the Arabic comma sits inside the [؀-ۿ] block the
    #     replaceAll lookarounds guard on, so it must go before the word maps).
    text = _PUNCT_RE.sub(" ", text)
    text = ZERO_WORD_RE.sub(" 0 ", text)   # زير/زيرو/زيرة/زيره… = arabized "zero"

    # 2. Detect and strip vehicle type — FIRST match in VEHICLE_TYPES order,
    #    and JS diff (2): only the first occurrence is removed.
    vehicle_type = None
    for vt in VEHICLE_TYPES:
        if vt in text:
            vehicle_type = vt
            text = text.replace(vt, " ", 1).strip()
            break

    # 3. Normalize alef variants (أ إ آ → ا)
    text = _ALEF_VARIANTS_RE.sub("\u0627", text)

    # 3c. ألف/الف before a و-compound = 1000, not the letter ا. MUST run before
    #     LETTER_NAMES consumes "ألف"; excludes the letter name واو/وا.
    text = _ALEF_THOUSAND_RE.sub(" 1000 ", text)

    # 3b. ى (alef maqsura) → ي
    text = text.replace("\u0649", "\u064a")

    # 4. Replace letter names
    text = replace_all(text, LETTER_NAMES)

    # 5. Replace phonetic merges
    text = replace_all(text, PHONETIC_MERGES)

    # 6. Replace spoken numbers (longest-first, so 10-19 beat their parts)
    text = replace_all(text, SPOKEN_NUMBERS)

    # 6b. Remaining bare ه → هـ. MUST be after the word maps above.
    text = _BARE_HEH_RE.sub("\u0647\u0640", text)

    # 7. Normalize Arabic-Indic numerals
    text = normalize_numerals(text)

    # 8. Clean: keep Arabic block + digits + spaces
    text = _WS_RUN_RE.sub(" ", _NON_PLATE_CHARS_RE.sub(" ", text)).strip()

    normalized = text

    # ── 9. Token scan (proximity-based extraction) ───────────────────────────
    tokens = [t for t in _WS_RUN_RE.split(normalized) if t]

    digit_token_indices = []
    digit_token_values = []
    for i, tok in enumerate(tokens):
        # JS diff (1): /^\d+$/ is ASCII-only.
        if _ASCII_DIGITS_ONLY_RE.fullmatch(tok) and len(tok) <= 4:
            digit_token_indices.append(i)
            digit_token_values.append(tok)

    used_idx = set(digit_token_indices)
    letter_buf = []

    plate = ""
    notes = ""
    uncertain = False

    if digit_token_indices:
        first_digit_idx = digit_token_indices[0]

        # Scan BACKWARD from the first digit token — letters adjacent to digits win
        i = first_digit_idx - 1
        while i >= 0 and len(letter_buf) < 3:
            tok = tokens[i]
            # TS 1492: Egyptian letter NAME = ONE letter, tried before the
            # per-character paths below (which would split it). JS `continue`
            # in a for-loop still runs i--, so decrement before continuing.
            eg = egyptian_plate_letter(tok)
            if eg:
                letter_buf.insert(0, eg)
                used_idx.add(i)
                i -= 1
                continue
            if len(tok) <= 2 or (len(tok) <= 4 and is_all_plate_letters(tok)):
                letters = extract_letters_from_token(tok)
                if letters:
                    # TS unshift(...slice) — prepend, preserving left-to-right order
                    letter_buf[0:0] = letters[: 3 - len(letter_buf)]
                    used_idx.add(i)
            i -= 1

        # If still short, scan FORWARD from the last digit token
        if len(letter_buf) < 3:
            last_digit_idx = digit_token_indices[-1]
            i = last_digit_idx + 1
            while i < len(tokens) and len(letter_buf) < 3:
                tok = tokens[i]
                eg = egyptian_plate_letter(tok)          # TS 1513
                if eg:
                    letter_buf.append(eg)
                    used_idx.add(i)
                    i += 1
                    continue
                if len(tok) <= 2 or (len(tok) <= 4 and is_all_plate_letters(tok)):
                    letters = extract_letters_from_token(tok)
                    if letters:
                        letter_buf.extend(letters[: 3 - len(letter_buf)])
                        used_idx.add(i)
                i += 1

        # Combine digit tokens:
        #  – all single digits (0-9) → concatenate   5 9 3 2 → "5932"
        #  – any token ≥ 10          → additive compound  5 + 20 → "25"
        digit_nums = [int(v) for v in digit_token_values]   # JS Number()
        if any(v >= 10 for v in digit_nums):
            digits = str(sum(digit_nums))[:4]
        else:
            digits = "".join(digit_token_values)[:4]

        plate = "".join(letter_buf) + digits
        notes = " ".join(t for i2, t in enumerate(tokens) if i2 not in used_idx)
        uncertain = len(letter_buf) == 0

    # ── 10. Regex fallback: letters-digits or digits-letters as a block ───────
    if not plate:
        AR = "[\u0600-\u06FF]"
        letters_group = "(" + AR + "(?:\\s*" + AR + "){0,2})"
        digits_group = "([0-9](?:\\s*[0-9]){0,3})"   # JS diff (1)

        m_a = re.search(letters_group + "\\s*" + digits_group, text)
        if m_a:
            l = re.sub(r"\s", "", m_a.group(1))
            d = re.sub(r"\s", "", m_a.group(2))
            if 1 <= len(d) <= 4:
                plate = l + d
                # JS diff (2): .replace(string, " ") → first occurrence only.
                notes = _WS_RUN_RE.sub(
                    " ", normalized.replace(m_a.group(0), " ", 1)
                ).strip()
                uncertain = True

        if not plate:
            m_b = re.search(digits_group + "\\s*" + letters_group, text)
            if m_b:
                d = re.sub(r"\s", "", m_b.group(1))
                l = re.sub(r"\s", "", m_b.group(2))
                if 1 <= len(d) <= 4:
                    plate = l + d
                    notes = _WS_RUN_RE.sub(
                        " ", normalized.replace(m_b.group(0), " ", 1)
                    ).strip()
                    uncertain = True

    # ── 11. Char-extraction fallback ─────────────────────────────────────────
    if not plate:
        d_match = _ONE_TO_FOUR_DIGITS_RE.search(text)
        if d_match:
            d = d_match.group(0)
            before = text[: d_match.start()]
            ar_chars = _ARABIC_CHAR_RE.findall(before)
            if len(ar_chars) >= 1:
                l = "".join(ar_chars[:3])
                plate = l + d
                # TS: new RegExp(...) with NO /g → first match only (count=1).
                notes = _WS_RUN_RE.sub(
                    " ",
                    re.sub("[\u0600-\u06FF\\s]*" + d, " ", normalized, count=1),
                ).strip()
            else:
                # Digits found but no letters — save partial plate (digits only)
                plate = d
                notes = _WS_RUN_RE.sub(
                    " ", normalized.replace(d, " ", 1)
                ).strip()
            uncertain = True

    # Zero-pad digit suffix to 4 (حكل80 → حكل0080)
    if plate:
        plate = _TRAILING_DIGITS_RE.sub(
            lambda m: m.group(1).rjust(4, "0"), plate, count=1
        )

    return {
        "plate": plate,
        "vehicleType": vehicle_type,
        "notes": notes,
        "normalized": normalized,
        "uncertain": True if uncertain else None,   # TS: uncertain || undefined
    }


# ─── Fuzzy matching helpers ────────────────────────────────────────────────

def levenshtein(a: str, b: str) -> int:
    """TS levenshtein (line 1791) — two-row optimisation, same recurrence."""
    m = len(a)
    n = len(b)
    if m == 0:
        return n
    if n == 0:
        return m
    prev = list(range(n + 1))
    curr = [0] * (n + 1)
    for i in range(1, m + 1):
        curr[0] = i
        ai = a[i - 1]
        for j in range(1, n + 1):
            if ai == b[j - 1]:
                curr[j] = prev[j - 1]
            else:
                curr[j] = 1 + min(prev[j], curr[j - 1], prev[j - 1])
        prev, curr = curr, prev
    return prev[n]


def _js_round(x: float) -> int:
    """JS diff (3): Math.round ties go toward +Infinity; Python round() is
    banker's rounding. Values here are >= -something small and typically 0..100,
    and Python floats are IEEE-754 doubles like JS numbers, so the arithmetic
    itself is bit-identical — only the rounding rule had to be reproduced."""
    import math
    return math.floor(x + 0.5)


def similarity_percent(a: str, b: str) -> int:
    """TS similarityPercent (line 1809)."""
    dist = levenshtein(a, b)
    max_len = max(len(a), len(b), 1)
    return _js_round((1 - dist / max_len) * 100)
