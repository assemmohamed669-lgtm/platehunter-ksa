// @vitest-environment node
// (نص الصفحة بيتقري بـ`import.meta.url` = ملف — في jsdom مش ملف)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canStopTranscription, mergeChunksPhases, readChunksResponse, withStreamParam } from "../BatchPage";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ⚡ «كامل ⚡» المتدفّق — اللوحات تظهر فوراً، والحقول بعدها
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٣ أكتوبر): «نخلي ال 5 دقايق دول يتفرغو في 10 ثواني … بدون ما
 *  يأثر علي حاجه». السيرفر بيرجّع NDJSON بـ`?stream=1`: سطر «plates» أول
 *  ما اللوحات تخلص، وسطر «done» بالحقول. والسيرفر القديم بيرجّع JSON واحد.
 */

const enc = new TextEncoder();

/** رد متدفّق بيوصل على دفعات — حتى السطر الواحد ممكن يتقسم في النص */
function streamed(pieces: string[], contentType = "application/x-ndjson"): Response {
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const p of pieces) ctrl.enqueue(enc.encode(p));
      ctrl.close();
    },
  });
  return new Response(body, { headers: { "content-type": contentType } });
}

const PLATES = {
  phase: "plates",
  plates: [
    { plate: "ابح1234", support: 3, t_s: 1.2 },
    { plate: "حطس5678", support: 2, t_s: null },
  ],
  dur_s: 197,
};
const DONE = {
  phase: "done",
  ok: true,
  plates: [
    { plate: "ابح1234", support: 3, t_s: 1.2, type: "ونيت", condition: null, place: null },
    { plate: "حطس5678", support: 2, t_s: null, type: null, condition: "مصدومة", place: "جراج" },
  ],
  fields_from: "cohere",
  calls: 6,
  ms: 14800,
};

describe("withStreamParam — stream=1 بيتضاف على الاستعلام اللي موجود", () => {
  it("من غير استعلام / مع استعلام / موجود أصلاً", () => {
    expect(withStreamParam("/api/seg-chunks")).toBe("/api/seg-chunks?stream=1");
    expect(withStreamParam("/api/seg-chunks?edge=2")).toBe("/api/seg-chunks?edge=2&stream=1");
    expect(withStreamParam("/api/seg-chunks?stream=1")).toBe("/api/seg-chunks?stream=1");
  });
});

describe("readChunksResponse — NDJSON", () => {
  it("سطر اللوحات بيتنده **قبل** ما الرد يخلص، والنهائي بنفس شكل الرد القديم", async () => {
    const seen: string[][] = [];
    const lines = `${JSON.stringify(PLATES)}\n${JSON.stringify(DONE)}\n`;
    // متقسّم في نص السطر الأول عمداً
    const res = streamed([lines.slice(0, 17), lines.slice(17, 120), lines.slice(120)]);
    const data = await readChunksResponse(res, (m) =>
      seen.push((m.plates as Array<{ plate: string }>).map((p) => p.plate))
    );
    expect(seen).toEqual([["ابح1234", "حطس5678"]]);
    expect(data.ok).toBe(true);
    expect(data.phase).toBeUndefined();
    expect(data.fields_from).toBe("cohere");
    expect((data.plates as unknown[]).length).toBe(2);
    // معلومات سطر اللوحات (طول الصوت) بتفضل في النهائي
    expect(data.dur_s).toBe(197);
  });

  it("«done» ملفوف في data ⇒ بيتفكّ", async () => {
    const res = streamed([
      `${JSON.stringify(PLATES)}\n`,
      `${JSON.stringify({ phase: "done", data: { ok: true, plates: DONE.plates, calls: 6 } })}\n`,
    ]);
    const data = await readChunksResponse(res, () => {});
    expect(data.ok).toBe(true);
    expect(data.calls).toBe(6);
    expect((data.plates as unknown[]).length).toBe(2);
  });

  it("سطر خطأ ⇒ ok:false بالسبب", async () => {
    const res = streamed([
      `${JSON.stringify(PLATES)}\n`,
      `${JSON.stringify({ phase: "error", ok: false, error: { message: "كوهير وقع" } })}\n`,
    ]);
    const data = await readChunksResponse(res, () => {});
    expect(data.ok).toBe(false);
    expect((data.error as { message: string }).message).toBe("كوهير وقع");
  });

  it("🔴 الرد اتقطع بعد اللوحات وقبل «done» ⇒ ok:false (مش «خلص»)", async () => {
    let plates = 0;
    const res = streamed([`${JSON.stringify(PLATES)}\n`]);
    const data = await readChunksResponse(res, () => plates++);
    expect(plates).toBe(1);
    expect(data.ok).toBe(false);
    expect(String((data.error as { message: string }).message)).toContain("اتقطع");
  });

  it("آخر سطر من غير \\n في الآخر بيتقري برضه", async () => {
    const res = streamed([`${JSON.stringify(PLATES)}\n${JSON.stringify(DONE)}`]);
    const data = await readChunksResponse(res, () => {});
    expect(data.ok).toBe(true);
  });

  it("نوع المحتوى مش ndjson بس الأسطر أسطر مراحل ⇒ بيتقري كتدفّق", async () => {
    const res = streamed([`${JSON.stringify(PLATES)}\n${JSON.stringify(DONE)}\n`], "application/json");
    let plates = 0;
    const data = await readChunksResponse(res, () => plates++);
    expect(plates).toBe(1);
    expect(data.ok).toBe(true);
  });
});

/**
 * 🚦 طابور المجمّع وقت الزحمة بس (١٨ أكتوبر) — الوسيط بيبعت {"phase":"queued","position":n}
 * وبعدين {"phase":"admitted"} لما ييجي الدور. المندوب لازم يشوف «في الطابور» بدل «بيفرّغ» الساكتة،
 * والسطرين مايأثّروش على النتيجة.
 */
describe("readChunksResponse — الطابور", () => {
  it("سطور الطابور بتوصل للصفحة بالترتيب، والنتيجة زي ما هي", async () => {
    const q: Array<number | null> = [];
    const res = streamed([
      JSON.stringify({ phase: "queued", ok: true, position: 2, running: 1 }) + "\n",
      JSON.stringify({ hb: 1 }) + "\n",
      JSON.stringify({ phase: "queued", ok: true, position: 1, running: 1 }) + "\n",
      JSON.stringify({ phase: "admitted", ok: true }) + "\n",
      JSON.stringify(PLATES) + "\n" + JSON.stringify(DONE) + "\n",
    ]);
    let plates = 0;
    const data = await readChunksResponse(res, () => plates++, (p) => q.push(p));
    expect(q).toEqual([2, 1, null]);
    expect(plates).toBe(1);
    expect(data.ok).toBe(true);
    expect((data.plates as unknown[]).length).toBe(2);
  });

  it("اتقطع وهو في الطابور ⇒ ok:false «اتقطع» (مش خلص)", async () => {
    const res = streamed([JSON.stringify({ phase: "queued", ok: true, position: 1 }) + "\n"]);
    const data = await readChunksResponse(res, () => {}, () => {});
    expect(data.ok).toBe(false);
    expect(String((data.error as { message: string }).message)).toContain("اتقطع");
  });

  it("من غير متابع للطابور (الشكل القديم) ⇒ مابيرميش", async () => {
    const res = streamed([JSON.stringify({ phase: "queued", ok: true, position: 1 }) + "\n" + JSON.stringify(PLATES) + "\n" + JSON.stringify(DONE) + "\n"]);
    const data = await readChunksResponse(res, () => {});
    expect(data.ok).toBe(true);
  });
});

describe("readChunksResponse — السيرفر القديم (JSON واحد)", () => {
  it("بيرجّع الرد زي ما هو ومافيش سطر لوحات", async () => {
    const old = { ok: true, plates: DONE.plates, calls: 6, run: "20261003-145922-135" };
    let plates = 0;
    const data = await readChunksResponse(
      new Response(JSON.stringify(old), { headers: { "content-type": "application/json" } }),
      () => plates++
    );
    expect(plates).toBe(0);
    expect(data).toEqual(old);
  });

  it("رفض قديم (ok:false) بيوصل زي ما هو", async () => {
    const data = await readChunksResponse(
      new Response(JSON.stringify({ ok: false, error: { message: "x" } }), {
        headers: { "content-type": "application/json" },
      }),
      () => {}
    );
    expect(data.ok).toBe(false);
  });

  it("رد مش JSON ⇒ بيرمي (زي r.json())", async () => {
    await expect(readChunksResponse(new Response("<html>502</html>"), () => {})).rejects.toThrow();
  });
});

describe("mergeChunksPhases — الحقول بتتربط بنص اللوحة بس", () => {
  it("«done» فيه plates كاملة ⇒ هي اللي بتكسب", () => {
    const out = mergeChunksPhases(PLATES, { ...DONE, phase: undefined } as never);
    expect((out.plates as Array<{ type: string | null }>)[0].type).toBe("ونيت");
  });

  it("🔴 «done» فيه fields بترتيب مختلف ⇒ كل نوع على لوحته هو، مش على اللي في نفس الترتيب", () => {
    const out = mergeChunksPhases(PLATES, {
      ok: true,
      fields: [
        { plate: "حطس5678", type: null, condition: "مصدومة", place: "جراج" },
        { plate: "ابح1234", type: "ونيت" },
      ],
    });
    const rows = out.plates as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.plate)).toEqual(["ابح1234", "حطس5678"]);
    expect(rows[0].type).toBe("ونيت");
    expect(rows[0].condition).toBeUndefined();
    expect(rows[1].condition).toBe("مصدومة");
    expect(rows[1].type).toBeNull();
    // 🔴 (عيب ٢) وقت سطر اللوحات **مبدئي** — مايوصلش للنهائي (الدبوس بيتحسب منه)
    expect(rows[0].t_s).toBeNull();
  });

  it("🔴 الدبوس من الأوقات النهائية بس: وقت «done» بيكسب، والمبدئي بيتساب إلا لو السيرفر قال إنه نهائي", () => {
    // ابح1234: وقته في سطر اللوحات بس (1.2) · حطس5678: وقته في «done» (4.4)
    const done = { ok: true, fields: [{ plate: "ابح1234", type: "ونيت" }, { plate: "حطس5678", t_s: 4.4 }] };
    const a = mergeChunksPhases({ ...PLATES, t_s_final: false }, done).plates as Array<Record<string, unknown>>;
    expect(a.map((r) => r.t_s)).toEqual([null, 4.4]);
    const b = mergeChunksPhases({ ...PLATES, t_s_final: true }, done).plates as Array<Record<string, unknown>>;
    expect(b.map((r) => r.t_s)).toEqual([1.2, 4.4]);
  });

  it("لوحة مالهاش حقول ⇒ بتفضل من غير نوع (مش بتاخد حقول جارتها)", () => {
    const out = mergeChunksPhases(PLATES, { ok: true, fields: [{ plate: "حطس5678", type: "فان" }] });
    const rows = out.plates as Array<Record<string, unknown>>;
    expect(rows[0].type).toBeUndefined();
    expect(rows[1].type).toBe("فان");
  });

  it("الفشل بيعدّي زي ما هو", () => {
    const fail = { ok: false, error: { message: "x" } };
    expect(mergeChunksPhases(PLATES, fail)).toBe(fail);
  });
});

/* ------------------------------------------------ حرّاس على نص الصفحة */

// 🧮 قناص: checkout على ويندوز = CRLF (text=auto) ⇒ الحرّاس اللي فيها `\n` كانت هتفشل
const SRC = readFileSync(fileURLToPath(new URL("../BatchPage.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");

describe("🔒 حرّاس الصفحة", () => {
  it("«كامل ⚡» بيطلب التدفّق ويقرا الرد بالقارئ الجديد", () => {
    // 🧮 قناص: وسيط المجمّع على إيطاليا مباشرةً (`chunksUrl` = …/chunks?stream=1)
    expect(SRC).toMatch(/fetch\(chunksUrl\(srv\.base\)/);
    expect(SRC).toMatch(/headers: chunksHeaders\(\{ token: srv\.token/);
    expect(SRC).toMatch(/readChunksResponse\(/);
    expect(SRC).not.toMatch(/data = await r\.json\(\)/);
  });

  it("🔴 «خلص» بييجي من finishRun بس — أي محرّك ماوصلش لآخره = «فشل» (عيب ٢)", () => {
    const bare = SRC.match(/setPhase\("done"\)/g) ?? [];
    // الوحيدة المسموحة جوّه finishRun نفسها
    expect(bare.length).toBe(1);
    expect(SRC).toMatch(/const finishRun = [^\n]*\n[^\n]*runSucceededRef\.current = true;\n[^\n]*setPhase\("done"\)/);
    // 🧮 قناص: محرك واحد («كامل ⚡») ⇒ نداء واحد في آخره (المعمل: ٨ لكل المحركات)
    expect((SRC.match(/finishRun\(\);/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("🔴 المحركات اللي بتقصّ ببادئة بتقصّ من أجزاء **المقطع اللي بيتفرّغ** مش chunksRef (عيب ٣)", () => {
    expect(SRC).not.toMatch(/chunksRef\.current\.slice\(0, endIdx\)/);
    expect(SRC).not.toMatch(/chunksRef\.current\.length > 0\s*\)/);
  });
});

/* ------------------------------------------------ مراجعة ٣ أكتوبر (جولة ٢) */

/** جسم دالة/بلوك في نص الصفحة — من أوله لحد أول قفلة بنفس المسافة */
function block(start: string, close = "\n    };"): string {
  const i = SRC.indexOf(start);
  expect(i).toBeGreaterThanOrEqual(0);
  const j = SRC.indexOf(close, i);
  expect(j).toBeGreaterThan(i);
  return SRC.slice(i, j);
}

describe("🔴 عيب ٢ + ٣: سطر اللوحات بلا دبوس وبلا تعديل — الدبوس من سطر «done» بس", () => {
  it("سطر اللوحات بيتعرض «📍 بيتحدّد…» لوحده: مافيش دبوس ولا لمس للجدول اللي بيتحفظ/بيتصدّر", () => {
    const body = block("const onPlates = ");
    expect(body).toMatch(/preliminaryEntries\(/);
    expect(body).toMatch(/setPrelim\(/);
    expect(body).not.toMatch(/stampEntriesWithTrack/);
    expect(body).not.toMatch(/setEntries\(/);
    expect(body).not.toMatch(/entriesRef\.current =/);
  });

  it("الرد اتقطع/رفض/اتوقف بعد اللوحات ⇒ اللوحات تفضل بلا دبوس، والمقطع «الأنواع ماوصلتش — فرّغ تاني»", () => {
    const body = block("const giveUpAfterPlates = ");
    expect(body).toMatch(/platesOnlyEntries\(/);
    expect(body).toMatch(/platesOnlyRef\.current = true/);
    expect(body).toMatch(/PLATES_ONLY_ERROR/);
    // كل مخارج الفشل في «كامل ⚡» بتعدّي عليها
    expect((SRC.match(/giveUpAfterPlates\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(SRC).toMatch(/platesOnly: platesOnlyRef\.current/);
  });

  it("اللوحات المبدئية بتتعرض للقراية بس، و«بيكمّل الأنواع…» قدامها", () => {
    expect(SRC).toMatch(/\{prelim && prelim\.length > 0 && \(/);
    expect(SRC).toMatch(/PIN_PENDING/);
    expect(SRC).toMatch(/بيكمّل الأنواع…/);
  });

  it("«اعرض لوحاته» مابيبدّلش الجدول وفيه تفريغ شغّال (كان هيتمسح من غير ما يحس)", () => {
    const body = block("const showClipPlates = ", "\n  };");
    expect(body).toMatch(/canStopTranscription\(clipsRef\.current\)/);
  });
});

describe("🔴 عيب ٦: سجل الأخطاء — رسالة حفظ واحدة لكل مقطع لكل نوع", () => {
  it("فشل الحفظ وقت التسجيل بيتسجّل مرة، والسبب بتاع التفريغ مايتاخدش من رسالة حفظ", () => {
    expect(SRC).toMatch(/saveErrOnceRef\.current\.first\(/);
    expect(SRC).toMatch(/SAVE_LOG_TAG/);
    expect(SRC).toMatch(/lastLog: runFailureLog\(sinceJob\)/);
  });
});

describe("🔴 عيب ١: القفل مايعلّقش «بدء التسجيل»", () => {
  it("قفل المقطع ليه حد أقصى — بعده الصوت الكامل في الذاكرة والحفظ بيكمّل ورا", () => {
    const body = block("const finalizeClip = useCallback(", "\n  );");
    expect(body).toMatch(/withDeadline\(/);
    expect(body).toMatch(/FINALIZE_MAX_MS/);
    expect(body).toMatch(/holdAudio\(/);
  });

  it("التفريغ والاستماع بيرجعوا للصوت اللي في الذاكرة لو التخزين مابيردّش", () => {
    expect(block("const transcribeClip = ", "\n  };")).toMatch(/memoryAudio\(/);
    expect(block("const playClip = ", "\n  };")).toMatch(/memoryAudio\(/);
  });

  it("💾 الصوت المحجوز بيتحفظ تاني لما المساحة تفضى (مع أي حركة + كل شوية)", () => {
    expect(SRC).toMatch(/retryPending\(\)/);
    expect(SRC).toMatch(/RETRY_SAVE_MS/);
  });
});

describe("🔴 عيب ٨: «وقّف التفريغ» موجود طول ما فيه تفريغ شغّال — حتى وهو بيسجّل أو بعد ما وقف التسجيل", () => {
  it("canStopTranscription = فيه مهمة شغّالة في الطابور", () => {
    expect(canStopTranscription([])).toBe(false);
    expect(canStopTranscription([{ status: "waiting" }, { status: "done" }])).toBe(false);
    expect(canStopTranscription([{ status: "done" }, { status: "working" }])).toBe(true);
  });

  it("الزرار مربوط بالطابور مش بحالة الصفحة", () => {
    expect(SRC).not.toMatch(/\{busy && phase === "transcribing" && \(/);
    expect(SRC).toMatch(/\{canStopTranscription\(clips\) && \(/);
  });
});


/* ------------------------------------------------ 🧮 قناص: السيرفر مباشرةً (١٦ أكتوبر) */

describe("🧮 قناص — رد مش 200 من السيرفر مباشرةً = فشل بسببه (مش «خلص بـ٠ لوحة»)", () => {
  const plain = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("401 التوكن ⇒ ok:false بالكود والسبب، ومافيش سطر لوحات", async () => {
    let plates = 0;
    const data = await readChunksResponse(plain(401, { error: "bad token" }), () => plates++);
    expect(data.ok).toBe(false);
    expect((data.error as { status: number }).status).toBe(401);
    expect(String((data.error as { message: string }).message)).toContain("التوكن");
    expect(plates).toBe(0);
  });

  it("503 / 524 (نفق) / 413 ⇒ ok:false", async () => {
    for (const st of [503, 524, 413, 400]) {
      const data = await readChunksResponse(plain(st, { error: "x" }), () => {});
      expect(data.ok).toBe(false);
      expect((data.error as { status: number }).status).toBe(st);
    }
  });

  it("نبضات الحياة من الوسيط (`{\"hb\":n}` من غير phase) بتتجاهل", async () => {
    const NL = String.fromCharCode(10);
    const pieces = [
      '{"hb":1}' + NL,
      JSON.stringify(PLATES) + NL,
      '{"hb":2}' + NL + '{"hb":3}' + NL,
      JSON.stringify({ ...DONE, run: "20261016-161219-554" }) + NL,
    ];
    let plates = 0;
    const data = await readChunksResponse(streamed(pieces), () => plates++);
    expect(plates).toBe(1);
    expect(data.ok).toBe(true);
    expect(data.run).toBe("20261016-161219-554");
  });

  it("غلط الوسيط بعد اللوحات (`error` كائن) ⇒ ok:false برسالته", async () => {
    const err = { phase: "error", ok: false, error: { where: "موديل المقاطع", status: 0, message: "الاتصال اتقطع" } };
    const NL = String.fromCharCode(10);
    const data = await readChunksResponse(streamed([JSON.stringify(PLATES) + NL, JSON.stringify(err) + NL]), () => {});
    expect(data.ok).toBe(false);
    expect((data.error as { message: string }).message).toBe("الاتصال اتقطع");
  });
});

describe("🧮 قناص — حرّاس النقل", () => {
  it("مافيش نداء لسيرفرات المعمل (Express): seg-chunks / edit-log / corrections / check-sheet", () => {
    for (const path of ["/api/seg-chunks", "/api/edit-log", "/api/corrections", "/api/correction-clip", "/api/check-sheet"]) {
      expect(SRC).not.toContain(`"${path}`);
    }
  });

  it("«مطلوبة» من ملف التشييك بتاع قناص بقواعده (مش شيت بنك بيترفع هنا)", () => {
    expect(SRC).toMatch(/useAppCheckSheet\(errorLog\)/);
    expect(SRC).not.toMatch(/matchInBankSheet\(/);
    // الملف الحالي من ref (عامل الطابور closure قديم — مراجعة ١٦ أكتوبر)
    expect((SRC.match(/matchInCheckSheet\(sheetRef\.current, review\.plate\)/g) ?? []).length).toBe(2);
  });

  it("النداء بياخد السيرفر والاسم من refs (عامل الطابور closure قديم)", () => {
    expect(SRC).toMatch(/const srv = serverRef\.current;/);
    expect(SRC).toMatch(/agent: agentNameRef\.current/);
  });

  it("كارت «النوع ماجاش من كوهير» بعد التفريغ بس، ومعاه علامة كوهير الواقع (٠ نداء)", () => {
    const body = block("const runChunksTranscription = ", String.fromCharCode(10) + "  };");
    expect(body).toMatch(/setWitnessUsed\(null\)/);
    expect(body).not.toMatch(/setWitnessUsed\(false\)/);
    expect(body).toMatch(/Number\(data\.cohere_calls\) === 0 && rows\.length > 0/);
    expect(SRC).not.toContain("اشتغلنا بلا شاهد Deepgram");
  });
});
