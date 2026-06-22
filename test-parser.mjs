// Run with: node test-parser.mjs
// Quick smoke-test for parsePlateFromTranscript

import { parsePlateFromTranscript } from "./lib/plateParser.ts";

const cases = [
  // حروف + أرقام فردية
  "حاء باء دال خمسة تسعة ثلاثة اثنين",
  // حروف + عشرات
  "قاف نون صاد خمسة وعشرين",
  // أرقام قبل الحروف
  "ثلاثة أربعة خمسة ستة حاء باء دال",
  // مع ونيت
  "ونيت حاء باء دال واحد اثنين تلاتة أربعة",
  // حرف ه بدون تطويل
  "ه باء دال خمسة تسعة",
  // 10-19
  "سين ميم ثلاثة عشر واحد",
  // نص مع ضوضاء في النص
  "اللوحة هي حاء باء دال والأرقام خمسة تسعة ثلاثة اثنين",
  // فارغ / بدون لوحة
  "شكراً للتواصل",
  // أرقام فقط بدون حروف
  "خمسة تسعة ثلاثة اثنين",
];

console.log("─".repeat(60));
for (const input of cases) {
  const r = parsePlateFromTranscript(input);
  console.log(`INPUT : ${input}`);
  console.log(`PLATE : ${r.plate || "(—)"}`);
  console.log(`TYPE  : ${r.vehicleType ?? "(—)"}`);
  console.log(`NOTES : ${r.notes || "(—)"}`);
  console.log(`NORM  : ${r.normalized}`);
  console.log("─".repeat(60));
}
