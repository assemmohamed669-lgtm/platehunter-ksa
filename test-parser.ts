// Run: npx tsx test-parser.ts

import { parsePlateFromTranscript } from "./lib/plateParser";

const cases = [
  "حاء باء دال خمسة تسعة ثلاثة اثنين",
  "قاف نون صاد خمسة وعشرين",
  "ثلاثة أربعة خمسة ستة حاء باء دال",
  "ونيت حاء باء دال واحد اثنين تلاتة أربعة",
  "ه باء دال خمسة تسعة",
  "سين ميم ثلاثة عشر واحد",
  "اللوحة هي حاء باء دال والأرقام خمسة تسعة ثلاثة اثنين",
  "شكراً للتواصل",
  "خمسة تسعة ثلاثة اثنين",
];

const SEP = "─".repeat(60);
console.log(SEP);
for (const input of cases) {
  const r = parsePlateFromTranscript(input);
  console.log(`INPUT : ${input}`);
  console.log(`PLATE : ${r.plate || "(—)"}`);
  console.log(`TYPE  : ${r.vehicleType ?? "(—)"}`);
  console.log(`NOTES : ${r.notes || "(—)"}`);
  console.log(`NORM  : ${r.normalized}`);
  console.log(SEP);
}
