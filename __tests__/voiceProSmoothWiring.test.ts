import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🧈 «سلاسة» Voice PRO — توصيل الصفحة. المالك (٣ أكتوبر ٢٠٢٦): «أنا عايز سلاسة في
 * كل حاجة في البرنامج» + قاعدته الدايمة: **السوبر أدمن الأول**. حارس على نص
 * الصفحة (الدوال جوّه مكوّن كبير مالهاش مدخل تاني): كل سلوك جديد ورا `isSuper`
 * (`sup` جوّه `start`)، والمسار القديم للمناديب لسه موجود بالحرف — ومقارن بنسخة
 * حرفية من origin/main (04433e5) تحت.
 */
const src = readFileSync(path.resolve(__dirname, "../app/(app)/registration-v2/page.tsx"), "utf8").replace(/\r\n/g, "\n");
const instantSrc = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8");
const between = (a: string, b: string) => {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + 1);
  return i >= 0 && j > i ? src.slice(i, j) : "";
};
const startFn = between("async function start()", "function stopTimer()");
const stopFn = between("function stop(why", "const stopRef = useRef(stop);");
const exportFn = between("async function exportRowsInner()", "function buildReportText()");
const loadCheckFn = between("const loadCheck = useCallback(", "const onCheckParsed = useCallback(");


describe("الحارس بيقيس المكان الصح", () => {
  it("الدوال اتلقت", () => {
    for (const s of [startFn, stopFn, exportFn, loadCheckFn]) expect(s.length).toBeGreaterThan(400);
  });
  it("بيستورد من lib/voiceProSmooth", () => {
    expect(src).toMatch(/from "@\/lib\/voiceProSmooth"/);
  });
});

describe("① 📶 النت الضعيف — للسوبر أدمن بس", () => {
  it("العلم بيتبعت جوّه فرع sup بس (المناديب: نفس الخيارات بالحرف)", () => {
    expect(startFn).toMatch(/const sup = isSuper;/);
    expect(startFn).toMatch(/\.\.\.\(sup \? \{[\s\S]{0,400}?netResilience: true,[\s\S]{0,400}?onWeakNet: /);
    // الخيار نفسه (مش التعليقات) مكتوب مرة واحدة بس — جوّه فرع sup
    expect(src.match(/netResilience:/g)?.length).toBe(1);
  });
  it("الشريط من weakNetBanner وللسوبر أدمن بس، وبيتشال في البداية والإيقاف", () => {
    expect(src).toMatch(/isSuper \? weakNetBanner\(weakSince, Date\.now\(\)\) : null/);
    expect(startFn).toMatch(/setWeakSince\(null\)/);
    expect(stopFn).toMatch(/setWeakSince\(null\)/);
  });
  it("🔴 الشريط بيتحسب من **بداية الانقطاع** (أول طلب فشل بعد آخر رد ناجح) — مش لحظة «ضعيف»", () => {
    // ساعة الانقطاع لكل جلسة، للسوبر أدمن بس (المناديب: null ⇒ ولا نداء بيعمل حاجة)
    expect(startFn).toMatch(/const outage = sup \? createOutageClock\(\) : null;/);
    expect(startFn.match(/createOutageClock\(/g)?.length).toBe(1);
    // الطلب الفاشل بيبدأها، وأي رد ناجح (onRead) بينهيها
    expect(startFn).toMatch(/onSkip: \(reason: string\) => \{ if \(outage && isRequestFailSkip\(reason\)\) outage\.fail\(Date\.now\(\)\); tel\?\.skip\(reason\); setSkips\(/);
    expect(startFn).toMatch(/onRead: \(r\) => \{\s*outage\?\.ok\(\);[^\n]*\n\s*tel\?\.read\(r\);/);
    // «ضعيف» ⇒ الشريط من بداية الانقطاع (ولو مش معروفة ⇒ دلوقتي)
    expect(startFn).toMatch(/setWeakSince\(weak \? \(outage\?\.since\(\) \?\? Date\.now\(\)\) : null\);/);
  });
  it("🔴 «صوتي» (instant-check) مابتبعتش وضع النت الضعيف خالص", () => {
    expect(instantSrc.length).toBeGreaterThan(1000);
    expect(instantSrc).not.toMatch(/netResilience/);
    expect(instantSrc).not.toMatch(/onWeakNet/);
    expect(instantSrc).not.toMatch(/checkReachable/);
  });
  it("🔌 فحص الوصول (نفق واقع ولا نت الموبايل؟) جوّه فرع sup بس، على /health بتاع سيرفر الصوت نفسه", () => {
    // نفس العنوان اللي `transcribeUrl` مبني منه — مش سيرفر تاني
    expect(startFn).toMatch(/transcribeUrl: modelUrl\.trim\(\)\.replace\(\/\\\/\+\$\/, ""\) \+ "\/transcribe",/);
    expect(startFn).toMatch(
      /\.\.\.\(sup \? \{\s*netResilience: true,[\s\S]{0,600}?checkReachable: reachabilityCheck\(modelUrl\.trim\(\)\.replace\(\/\\\/\+\$\/, ""\) \+ "\/health"\),\s*\} : \{\}\),/,
    );
    // الخيار نفسه مكتوب مرة واحدة بس (المناديب: الخيارات من غيره بالحرف)
    expect(src.match(/checkReachable:/g)?.length).toBe(1);
    expect(src).toMatch(/import \{[^}]*\breachabilityCheck\b[^}]*\} from "@\/lib\/voiceProSmooth";/);
  });
});

describe("② 🔒 جلسة قديمة ماتوقّفش جلسة أحدث — للسوبر أدمن", () => {
  it("كل بداية ليها رقم، والإيقاف بيقفله", () => {
    expect(startFn).toMatch(/const sid = sessionRef\.current\.begin\(\);/);
    expect(startFn).toMatch(/const live = \(\) => !sup \|\| sessionRef\.current\.isCurrent\(sid\);/);
    expect(stopFn).toMatch(/sessionRef\.current\.end\(\);/);
  });
  it("كل نداء بيوقّف التسجيل بيتجاهل لو مش من الجلسة الحالية", () => {
    expect(startFn).toMatch(/onMicLost: \(reason\) => \{\s*if \(!live\(\)\) return;/);
    expect(startFn).toMatch(/onFatal: \(reason: string, code\?: string\) => \{\s*if \(!live\(\)\) return;/);
    expect(startFn).toMatch(/onWeakNet: \(weak: boolean\) => \{\s*if \(!live\(\)\) return;/);
  });
  it("نص الوقوع من fatalText بالكود (المناديب: النص القديم لأي كود — مثبّت في voiceProSmooth.test)", () => {
    expect(startFn).toMatch(/setError\(fatalText\(reason, sup, code\)\);/);
    expect(startFn).not.toMatch(/setError\(fatalText\(reason, sup\)\);/);
    expect(src).not.toMatch(/"السيرفر فصل وسط التسجيل/);
  });
  it("🩺 الكود بيتسجّل في المراقبة (tel للسوبر أدمن بس) — ومن غير كود نفس الحدث القديم", () => {
    expect(startFn).toMatch(/tel\?\.event\("fatal", code === undefined \? \{ reason \} : \{ reason, code \}\);/);
    expect(src).toMatch(/telRef\.current = !isSuper \? null : startTelemetrySession\(/);
  });
  it("🔴 startingRef بيتحط **جوّه** الـtry اللي finally بتاعه بيرجّعه (رمية في النص ماتعلّقش الهيكل)", () => {
    expect(startFn).toMatch(/try \{\s*(?:\/\/[^\n]*\n\s*)*startingRef\.current = true;\s*(?:\/\/[^\n]*\n\s*)*const \{ startVoicexEngine \} = await import\("@\/lib\/voicexEngine"\);/);
    expect(startFn.match(/startingRef\.current = true;/g)?.length).toBe(1);
    expect(startFn).toMatch(/finally \{\s*setStarting\(false\);\s*startingRef\.current = false;/);
  });
});

describe("③ 🔧 الهيكل في الخلفية — للكل (المالك ٣ أكتوبر: «ابدأ واعملهم كلهم»)", () => {
  /**
   * 🔴 آيفون ١١ لمندوب «صوت فقط» كان بيلفّ في «جارٍ التحقق» ويهنّج: طريق المناديب
   * القديم كان بيحلّل ملف التشييك كله (`readAllSheets` على الخيط الرئيسي) مع كل
   * فتحة باردة — ٨–١٦ ثانية و١٢٠–٢٥٠ ميجا — والآيفون بيقفل الصفحة فتتفتح تاني
   * وتحلّل تاني. المحمّل اللي في الخلفية (اتجرّب عند السوبر أدمن من الصبح) بقى للكل.
   */
  it("🔴 مافيش تحليل للملف كله على الخيط الرئيسي في loadCheck — ولا طريق قديم للمناديب", () => {
    expect(loadCheckFn).not.toMatch(/readAllSheets/);
    expect(loadCheckFn).not.toMatch(/requestIdleCallback/);
    expect(loadCheckFn).not.toMatch(/getCachedChassis|setCachedChassis/);
    expect(src).not.toMatch(/superDecRef/);
  });
  it("🔴 الملف الأساسي: الكل بيطلب المحمّل الجديد بتذكرة (من غير شرط سوبر أدمن)", () => {
    expect(loadCheckFn).toMatch(/const ticket = chassisJobsRef\.current!\.begin\(\);/);
    expect(loadCheckFn).toMatch(/chassisJobsRef\.current!\.request\(ticket, \{[\s\S]{0,300}?fileStamp: rec\.uploadedAt/);
    // وأي خروج تاني (مافيش ملف / رمية) بيسيب التذكرة ⇒ التصدير مايستناش على الفاضي
    expect(loadCheckFn).toMatch(/finally \{\s*chassisJobsRef\.current!\.release\(ticket\);\s*\}/);
    expect(src).toMatch(/run: \(job\) => loadChassisMap\(job\)/);
  });
  it("🔴 مافيش ملف أساسي (الإضافية بس): الكل عبر «أحدث تحميل بس» — نفس الخريطة بالحرف", () => {
    expect(loadCheckFn).toMatch(
      /chassisJobsRef\.current!\.request\(ticket, \{ fingerprint: null, sources: extrasOnly, blob: null, fileName: null \}\);\s*return;/,
    );
    expect(loadCheckFn).not.toMatch(/const chassisOnly = new Map/);
  });
  it("المناديب مابيستنّوش حاجة زيادة: سطور await في loadCheck هي قراية الملفات بس", () => {
    const awaits = loadCheckFn.split("\n").filter((l) => /\bawait\b/.test(l)).map((l) => l.trim());
    expect(awaits).toEqual([
      "const rec = await getUploadedFile(\"local\", \"check\").catch(() => null);",
      "const x = await getUploadedFile(\"local\", `check-${n}`).catch(() => null);",
      "const x = await getUploadedFile(\"local\", `check-${n}`).catch(() => null);",
    ]);
  });
  it("مابيقراش الملف وقت التسجيل (ولا وهو بيجهّز المايك)، والكاش بس مسموح، والقراية بعد الإيقاف", () => {
    expect(src).toMatch(/busy: \(\) => !!engineRef\.current \|\| startingRef\.current/);
    expect(src).toMatch(/quick: \(job\) => quickChassisMap\(job\)/);
    const settle = stopFn.indexOf("STOP_SETTLE_MAX_MS");
    const flush = stopFn.indexOf("chassisJobsRef.current?.flush()");
    expect(settle).toBeGreaterThan(0);
    expect(flush).toBeGreaterThan(settle);
    expect(flush).toBeLessThan(stopFn.indexOf("if (why !== \"manual\" || !autoExportRef.current) return;"));
  });
});

/**
 * ④ اتفتح **للكل** — المالك (٤ أكتوبر ٢٠٢٦): المناديب «بيقول لوحة مطلوبة ويقول بعدها
 * ٣ لوحات، بتظهر المطلوبة بعد ما يقول الـ٣ لوحات» ⇒ «يلا ارفعها للمناديب». السبب:
 * المؤشّر بيعيد رسم الصفحة كلها ~٦٠ مرة/ث، ومع كل رسمة التقرير المستخبّي (لحد ٤٠٠
 * قراية) + كل الصفوف + مقارنة القرايات بالصفوف ⇒ الخيط الرئيسي بيتشبّع والصفوف بتتأخر.
 */
describe("④ 🎚️ المؤشّر مايعيدش رسم الصفحة كلها ٦٠ مرة/ث — للكل (المناديب كمان)", () => {
  it("المؤشّر بيقرا من مخزن لوحده للكل — مافيش setLevel لكل فريم", () => {
    expect(startFn).toMatch(/onLevel: levelThrottle\(\(v\) => levelStoreRef\.current!\.set\(v\)\),/);
    expect(startFn).not.toMatch(/\(lvl: number\) => setLevel\(lvl\)/);
    expect(src).toMatch(/<LiveVuMeter store=\{levelStoreRef\.current!\} speaking=\{speaking\} \/>/);
    // الصفحة مابترسمش `VuMeter` بحالة الصفحة — المرة الوحيدة جوّه `LiveVuMeter` (بمخزنه)
    expect(src.match(/<VuMeter level=\{level\} speaking=\{speaking\} \/>/g)?.length).toBe(1);
    expect(src).toMatch(/return <VuMeter level=\{level\} speaking=\{speaking\} \/>;/);
    expect(src).toMatch(/useSyncExternalStore\(store\.subscribe, store\.get, store\.get\)/);
  });
  it("وقت الصف بمنسّق واحد للكل، والمقارنات التقيلة محسوبة مرة لكل تغيير للكل", () => {
    expect(src).toMatch(/\{formatRowTime\(r\.shownAt\)\}/);
    expect(src).not.toMatch(/isSuper \? formatRowTime\(r\.shownAt\)/);
    expect(src).toMatch(/useMemo\(\s*\(\) => \(\{ missed: heardNotShown\(reads, rows\), lost: blockedNotShown\(reads, rows\) \}\),\s*\[reads, rows\]/);
  });
  it("التقرير الشامل (لحد ٤٠٠ قراية) مابيترسمش خالص عند المناديب — كان مستخبّي بالـCSS بس", () => {
    expect(src).toMatch(/\{isSuper && showReport && \(/);
    expect(src).not.toMatch(/\n\s*\{showReport && \(/);
  });
});

describe("⑤ 📤 تصدير ١٠٠٠+ لوحة مايهنّجش — للسوبر أدمن", () => {
  it("السوبر أدمن: دفعات + تقدّم؛ المناديب: Promise.allSettled زي ما هو", () => {
    expect(exportFn).toMatch(/isSuper\s*\?\s*await saveFieldCheckEntriesChunked\(entries, \{ onProgress: /);
    expect(exportFn).toContain("await Promise.allSettled(entries.map((e) => saveFieldCheckEntry(e)))");
    expect(exportFn).toMatch(/exportProgressText\(/);
  });
  it("كل الحراس القديمة قبل الحفظ", () => {
    const save = exportFn.indexOf("saveFieldCheckEntriesChunked(");
    expect(exportFn.indexOf("if (!uid)")).toBeGreaterThan(0);
    expect(exportFn.indexOf("if (!uid)")).toBeLessThan(save);
    expect(exportFn.indexOf("const mineReady = ready.filter((r) => isMine(r, uid));")).toBeLessThan(save);
    expect(exportFn.indexOf("if (!ready.length)")).toBeLessThan(save);
    expect(exportFn).toMatch(/firstFailureReason\(settled\)/);
    expect(exportFn).toMatch(/savedIds\(entries\.map\(\(e\) => e\.id\), settled\)/);
  });
  it("بحث بـSet للسوبر أدمن (مش includes على كل صف) و setRows واحدة", () => {
    expect(exportFn).toMatch(/isSuper\s*\?\s*mineReady\.filter\(\(r\) => okSet\.has\(entryId\(r\)\)\)/);
    expect(exportFn.match(/setRows\(/g)?.length).toBe(1);
  });
  it("الصفوف بتتجهّز على دفعات للسوبر أدمن، و map زي ما هو للمناديب", () => {
    expect(exportFn).toMatch(/isSuper \? await mapInChunks\(mineReady, toEntry\) : mineReady\.map\(toEntry\)/);
  });
  it("الرفع للسيرفر على دفعات للسوبر أدمن (بعد التصدير، عند الفتح، ورجوع النت)", () => {
    expect(exportFn).toMatch(/isSuper \? m\.pushPendingFieldChecksBatched\(uid\) : m\.pushPendingFieldChecks\(uid\)/);
    expect(src).toMatch(/sup \? m\.pushPendingFieldChecksBatched\(userId as string\) : m\.pushPendingFieldChecks\(userId as string\)/);
    expect(src).toMatch(/isSuperRef\.current \? m\.pushPendingFieldChecksBatched\(uid\) : m\.pushPendingFieldChecks\(uid\)/);
  });
});

describe("⑤ 🔧 الهيكل في التصدير — لازم يتكتب (السوبر أدمن)", () => {
  it("🔴 بيشغّل التحميل المستني (حتى وقت التسجيل) وبيستناه بحد سخي — مش settled() اللي بترجع null", () => {
    expect(exportFn).toMatch(/withinMs\(jobs\.ensure\(\), CHASSIS_EXPORT_WAIT_MS\)/);
    expect(exportFn).not.toMatch(/\.settled\(\)/);
    expect(src).not.toMatch(/const CHASSIS_EXPORT_WAIT_MS = 15_000;/);
    expect(exportFn).toMatch(/const vin = chassisMap\.get\(/);
  });
  it("🔴 بيقول «بجهّز أرقام الهيكل…» وهو مستني (مش «ببعت للسجلات…» ساكتة)", () => {
    const text = exportFn.indexOf("setBusy(CHASSIS_WAIT_TEXT)");
    expect(text).toBeGreaterThan(0);
    expect(text).toBeLessThan(exportFn.indexOf("jobs.ensure()"));
    expect(exportFn).toMatch(/const waitChassis = !jobs\.idle;/);
  });
  it("🔴 لو ماخلصش في الوقت ⇒ بيصدّر باللي موجود وبيقول كده في رسالة النتيجة", () => {
    expect(exportFn).toMatch(/else if \(waitChassis\) chassisNote = CHASSIS_MISSING_NOTE;/);
    expect(exportFn).toMatch(/\+ chassisNote/);
  });
  it("🔴 للكل مش للسوبر أدمن بس — الهيكل بقى في الخلفية عند المناديب، فتصديرهم لازم يستناه برضه", () => {
    const head = exportFn.slice(exportFn.indexOf("let chassisNote = \"\";"), exportFn.indexOf("const jobs = chassisJobsRef.current!;"));
    expect(head.length).toBeGreaterThan(0);
    expect(head).not.toMatch(/if \(isSuper\)/);
  });
});

describe("⑤ 🔒 سباق التصدير — السوبر أدمن", () => {
  it("🔴 الصفوف بتتاخد **بعد** انتظار الهيكل (مش من لحظة الضغطة)", () => {
    const wait = exportFn.indexOf("jobs.ensure()");
    const snap = exportFn.indexOf("const snapRows = rowsRef.current;");
    const mine = exportFn.indexOf("const mineReady = ready.filter((r) => isMine(r, uid));");
    expect(wait).toBeGreaterThan(0);
    expect(snap).toBeGreaterThan(wait);
    expect(mine).toBeGreaterThan(snap);
    expect(exportFn).toMatch(/ready = exportableTrialRows\(snapRows\);/);
  });
  it("🔴 بيتشال بس الصف اللي لسه **نفس الكائن** اللي اتصدّر (المناديب: بالـid زي ما هو)", () => {
    expect(exportFn).toMatch(/setRows\(\(prev\) => prev\.filter\(isSuper \? \(r\) => !savedSame\.has\(r\) : \(r\) => !savedRowIds\.has\(r\.id\)\)\);/);
    expect(exportFn).toMatch(/const savedSame = new Set<LiveRow>\(isSuper \? savedRows : \[\]\);/);
  });
  it("🔴 التعديل والمسح مقفولين طول التصدير (وبيتفتحوا في finally)", () => {
    expect(exportFn).toMatch(/if \(isSuper\) lockRows\(true\);/);
    expect(exportFn).toMatch(/finally \{ setBusy\(null\); if \(isSuper\) lockRows\(false\); \}/);
    expect(exportFn.indexOf("lockRows(true)")).toBeLessThan(exportFn.indexOf("await supabase.auth.getSession()"));
    expect(src).toMatch(/const rowsLocked = isSuper && rowsLockedState;/);
  });
  it("🔴 أزرار المسح وتعديل اللوحة والمسح الكلّي disabled وقت القفل، والنوع/الملاحظة مايتغيّروش", () => {
    expect(src.match(/disabled=\{rowsLocked\}/g)?.length).toBe(3);
    expect(src).toMatch(/const saveCell = useCallback\(\(id: string, field: "type" \| "note", value: string\) => \{\s*(?:\/\/[^\n]*\n\s*)*if \(rowLockRef\.current > 0\) return;/);
    expect(src).toMatch(/\{rowsLocked && \(/);
  });
});

describe("🏷️ أسماء أسباب التخطّي (لوحة التشخيص)", () => {
  const labels = between("const SKIP_LABEL: Record<string, string> = {", "};");
  const label = (k: string) => new RegExp("\\n\\s*" + k + ': "([^"]+)",').exec(labels)?.[1] ?? null;
  it("الجدول اتلقى", () => {
    expect(labels.length).toBeGreaterThan(200);
  });
  it("🔴 الأسباب الجديدة (netResilience — السوبر أدمن بس) ليها اسم عربي مش المفتاح الخام", () => {
    for (const k of ["weak_net", "utterance_expired", "net_lost"]) {
      const t = label(k);
      expect(t, k).not.toBeNull();
      expect(t!).toMatch(/[؀-ۿ]/);
    }
    // ٧٥ث = عمر الصوت الفايت في الذاكرة (REPLAY_MAX_AGE_SEC)
    expect(label("utterance_expired")).toContain("٧٥");
  });
  it("المحرّك بيبعت السببين دول فعلاً (مش اسم متخيَّل)", () => {
    const engine = readFileSync(path.resolve(__dirname, "../lib/voicexEngine.ts"), "utf8");
    expect(engine).toContain('opts.onSkip?.("utterance_expired")');
    expect(engine).toMatch(/onSkip\?\.\("weak_net"\)/);
    expect(engine).toContain('opts.onSkip?.("net_lost")');
  });
});
