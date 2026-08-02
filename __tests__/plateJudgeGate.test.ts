// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  PILOT_OWNER_ID,
  PILOT_ALLOWED_IDS,
  UUID_RE,
  isPilotOwner,
  resolvePlateJudgeEnabled,
  resolveJudgeRpc,
  LS_JUDGE_URL,
  LS_JUDGE_TOKEN,
  readJudgeEndpoint,
  saveJudgeEndpoint,
  clearJudgeEndpoint,
  JUDGE_MIN_TOKEN_LEN,
} from "@/lib/plateJudgeGate";

// ─────────────────────────────────────────────────────────────────────────────
// بوابة الحصرية للطيّار (الرأي التاني من موديلنا) — **المالك وحده**، والافتراضي
// **مقفول** حتى له. الملف ده هو خط الدفاع الأول: أي شكل «فشل مفتوح»
// (fail-open) لازم يتقفل هنا، لأن اللي بعده (الـfetch والتسجيل) بيثق فيه.
//
// التلات أشكال اللي المراجعة العدائية صادتها ولازم يفضلوا مقفولين:
//   (١) مقارنة nullish بـnullish: هوية لسه ماتحلّتش (`undefined`) قدّام ثابت
//       غير مضبوط ⇒ `undefined == undefined` = **true** ⇒ كل الناس ملّاك.
//   (٢) نص فاضي/مسافات على الطرفين: `"" === ""` = **true** (نفس الفكرة، بس
//       بعد `?? ""`)، وكمان لوحة مفاتيح المالك بمسافة لازقة.
//   (٣) قيمة **مش سترنج** بتتساوى بالإجبار: `["af40…"] == "af40…"` = **true**
//       في جافاسكريبت (Array.toString)، وكذلك أي كائن له toString. وبرضه
//       المقارنة الجزئية (startsWith/includes) اللي بتقبل بادئة أو نص أطول.
// العلاج المفروض: فحص شكل UUID على **الطرفين** + `===` صريح على سترنج.
// ─────────────────────────────────────────────────────────────────────────────

const OWNER = "af40c1a6-5e30-49a3-bea2-8d8a5f3aec2d";
/** أخو المالك — تاني صوت في الطيّار. */
const BROTHER = "5659243d-8298-4e6d-88ef-42571491d162";
/** مجرِّب تالت — صوت تالت للقياس. */
const THIRD_TESTER = "7b4bc404-50e7-46ad-935f-aa65e293d6b8";
/** مندوب تاني — UUID سليم الشكل بس مش المالك. */
const OTHER = "11111111-2222-4333-8444-555555555555";
/** توكن سليم للاختبار (٣٢ محرف عشوائي الشكل، بلا مسافات). */
const GOOD_TOKEN = "kK7xQm2ZpR9tVn4bLc6HdW8sYf3jGa5U";

describe("PILOT_OWNER_ID — الثابت نفسه لازم يكون UUID حقيقي (وإلا الشكل الأول بيفتح)", () => {
  it("هو معرّف المالك بالحرف", () => {
    expect(PILOT_OWNER_ID).toBe(OWNER);
  });

  it("سترنج غير فاضي وشكله UUID — عشان فحص الطرف التاني يبقى له معنى", () => {
    expect(typeof PILOT_OWNER_ID).toBe("string");
    expect(PILOT_OWNER_ID.length).toBe(36);
    expect(UUID_RE.test(PILOT_OWNER_ID)).toBe(true);
  });
});

describe("isPilotOwner — الحالات الأساسية", () => {
  it("معرّف المالك (حروف صغيرة، زي ما Supabase بيرجّعه) → true", () => {
    expect(isPilotOwner(OWNER)).toBe(true);
    expect(isPilotOwner(PILOT_OWNER_ID)).toBe(true);
  });

  it("null / undefined (هوية لسه ماتحلّتش أو أوفلاين) → false", () => {
    expect(isPilotOwner(null)).toBe(false);
    expect(isPilotOwner(undefined)).toBe(false);
  });

  it("نص فاضي أو مسافات → false", () => {
    expect(isPilotOwner("")).toBe(false);
    expect(isPilotOwner("   ")).toBe(false);
    expect(isPilotOwner("\t")).toBe(false);
    expect(isPilotOwner("\n")).toBe(false);
  });

  it("نص مش UUID → false", () => {
    expect(isPilotOwner("owner")).toBe(false);
    expect(isPilotOwner("af40c1a6")).toBe(false);
    expect(isPilotOwner("not-a-uuid-at-all-just-text-here-xx")).toBe(false);
    expect(isPilotOwner("af40c1a6_5e30_49a3_bea2_8d8a5f3aec2d")).toBe(false); // شرطة سفلية
    expect(isPilotOwner("zf40c1a6-5e30-49a3-bea2-8d8a5f3aec2d")).toBe(false); // z مش hex
  });

  it("UUID سليم بس مش المالك (أي مندوب تاني) → false", () => {
    expect(isPilotOwner(OTHER)).toBe(false);
    expect(isPilotOwner("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("معرّف المالك بحروف كبيرة → false (**فشل مغلق** مقصود)", () => {
    // UUID نظرياً غير حساس لحالة الحرف، بس `auth.getUser()` بيرجّع صغير دايماً.
    // فرفض الكبير بيضيّق البوابة مايوسّعهاش — وده الاتجاه الآمن الوحيد المسموح.
    expect(isPilotOwner(OWNER.toUpperCase())).toBe(false);
    expect(isPilotOwner("AF40C1A6-5E30-49A3-BEA2-8D8A5F3AEC2D")).toBe(false);
    // ونتأكد إن الحالة دي فعلاً «كبير»، يعني الاختبار بيقيس اللي إحنا قاصدينه.
    expect(OWNER.toUpperCase()).not.toBe(OWNER);
    expect(UUID_RE.test(OWNER.toUpperCase())).toBe(true); // الشكل سليم، والرفض من `===`
  });
});

describe("PILOT_ALLOWED_IDS — قايمة المسموح لهم مقصودة بالاسم (مجرِّب تالت)", () => {
  it("تلات عناصر بالظبط — ولا واحد زيادة (كل إضافة مقصودة بالاسم)", () => {
    expect(PILOT_ALLOWED_IDS.length).toBe(3);
  });

  it("المجرِّب التالت جوّه القايمة، والمالك وأخوه زي ما هُمَّ", () => {
    expect(PILOT_ALLOWED_IDS).toContain(OWNER);
    expect(PILOT_ALLOWED_IDS).toContain(BROTHER);
    expect(PILOT_ALLOWED_IDS).toContain(THIRD_TESTER);
  });

  it("كل عنصر سترنج بدائي وشكله UUID — وإلا الفلترة بتشيله والباب يتقفل عليه", () => {
    for (const id of PILOT_ALLOWED_IDS) {
      expect(typeof id, id).toBe("string");
      expect(id.length, id).toBe(36);
      expect(UUID_RE.test(id), id).toBe(true);
    }
  });

  it("مافيش تكرار — التلاتة معرّفات مختلفة", () => {
    expect(new Set(PILOT_ALLOWED_IDS).size).toBe(3);
  });

  // `readonly` بتاعة TypeScript بتختفي وقت التشغيل — فلازم تجميد حقيقي، وإلا
  // أي كود في نفس الحزمة يقدر يزقّ هوية رابعة ويفتح الطيّار لحد مش مقصود.
  it("القايمة مجمّدة فعلياً وقت التشغيل — مش readonly على الورق بس", () => {
    expect(Object.isFrozen(PILOT_ALLOWED_IDS)).toBe(true);
  });

  it("محاولة إضافة هوية رابعة وقت التشغيل مابتنجحش", () => {
    const before = PILOT_ALLOWED_IDS.length;
    const INTRUDER = "11111111-2222-3333-4444-555555555555";
    // في strict mode الـpush بترمي، وبرّاها بتفضل ساكتة — الاتنين مقبولين،
    // المهم إن القايمة **ماتتغيّرش** والدخيل يفضل مرفوض.
    try {
      (PILOT_ALLOWED_IDS as string[]).push(INTRUDER);
    } catch {
      /* التجميد رمى — ده المطلوب */
    }
    expect(PILOT_ALLOWED_IDS.length).toBe(before);
    expect(PILOT_ALLOWED_IDS).not.toContain(INTRUDER);
    expect(isPilotOwner(INTRUDER)).toBe(false);
  });

  it("محاولة استبدال عنصر موجود بهوية تانية مابتنجحش", () => {
    const INTRUDER = "99999999-8888-7777-6666-555555555555";
    try {
      (PILOT_ALLOWED_IDS as string[])[0] = INTRUDER;
    } catch {
      /* التجميد رمى — ده المطلوب */
    }
    expect(PILOT_ALLOWED_IDS[0]).toBe(OWNER);
    expect(isPilotOwner(INTRUDER)).toBe(false);
    expect(isPilotOwner(OWNER)).toBe(true);
  });

  // مراجعة معادية عدّت **٧ أشكال** للتلاعب، كل واحد فيهم كان بيخلّي هوية رابعة
  // ترجّع true قبل التجميد. بنقفلهم كلهم بالاسم عشان أي رجوع مستقبلي يقع فوراً.
  it("كل أشكال التلاعب السبعة بتفشل مقفول — الدخيل يفضل مرفوض والتلاتة زي ما هُمَّ", () => {
    const IN = "11111111-2222-3333-4444-555555555555";
    const arr = PILOT_ALLOWED_IDS as string[];
    const attacks: Array<[string, () => void]> = [
      ["push", () => arr.push(IN)],
      ["index-assign", () => { arr[3] = IN; }],
      ["splice", () => arr.splice(1, 0, IN)],
      ["unshift", () => arr.unshift(IN)],
      ["fill", () => arr.fill(IN)],
      ["length=0", () => { arr.length = 0; }],
      ["upper-case entry", () => arr.push(IN.toUpperCase())],
    ];

    for (const [name, attack] of attacks) {
      try {
        attack();
      } catch {
        /* التجميد رمى — ده المطلوب */
      }
      // القايمة ماتغيّرتش لا طولاً ولا محتوى.
      expect(PILOT_ALLOWED_IDS.length, name).toBe(3);
      expect(PILOT_ALLOWED_IDS[0], name).toBe(OWNER);
      expect(PILOT_ALLOWED_IDS[1], name).toBe(BROTHER);
      expect(PILOT_ALLOWED_IDS[2], name).toBe(THIRD_TESTER);
      // والدخيل مرفوض بالصيغتين — الفلترة بتقبل شكل UUID بحروف كبيرة، فلو
      // عنصر كبير كان دخل، `includes` كان هيطابق uid كبير بنفس الحالة.
      expect(isPilotOwner(IN), name).toBe(false);
      expect(isPilotOwner(IN.toUpperCase()), name).toBe(false);
      // والتلاتة الأصليين لسه داخلين (التلاعب مافقدهمش وصولهم).
      expect(isPilotOwner(OWNER), name).toBe(true);
      expect(isPilotOwner(BROTHER), name).toBe(true);
      expect(isPilotOwner(THIRD_TESTER), name).toBe(true);
    }
  });
});

describe("isPilotOwner — المجرِّب التالت مسموح له", () => {
  it("معرّف المجرِّب التالت → true", () => {
    expect(isPilotOwner(THIRD_TESTER)).toBe(true);
    expect(isPilotOwner("7b4bc404-50e7-46ad-935f-aa65e293d6b8")).toBe(true);
  });

  it("والمالك وأخوه لسه مسموح لهم (الإضافة مافتحتش ومازوّدتش حاجة)", () => {
    expect(isPilotOwner(OWNER)).toBe(true);
    expect(isPilotOwner(BROTHER)).toBe(true);
  });

  it("نفس التضييق على المجرِّب التالت: كبير/مسافات/جزئي → false", () => {
    expect(isPilotOwner(THIRD_TESTER.toUpperCase())).toBe(false);
    expect(isPilotOwner(` ${THIRD_TESTER}`)).toBe(false);
    expect(isPilotOwner(`${THIRD_TESTER} `)).toBe(false);
    expect(isPilotOwner(THIRD_TESTER.slice(0, 35))).toBe(false);
    expect(isPilotOwner(THIRD_TESTER + "0")).toBe(false);
    expect(isPilotOwner([THIRD_TESTER] as unknown as string)).toBe(false);
  });

  it("وأي مندوب رابع مش في القايمة لسه مرفوض", () => {
    expect(isPilotOwner(OTHER)).toBe(false);
    expect(isPilotOwner("7b4bc404-0000-4000-8000-000000000000")).toBe(false);
  });
});

describe("الشكل ١ (فشل مفتوح): مقارنة nullish بـnullish — مقفول", () => {
  it("كل صور «الهوية ماتحلّتش» بترجع false، مش بتساوي ثابت غايب", () => {
    for (const bad of [null, undefined, void 0]) {
      expect(isPilotOwner(bad as unknown as string)).toBe(false);
    }
  });

  it("nullish مش بيساوي nullish جوّه الدالة (لو الثابت كان غايب كانت هترجع true)", () => {
    // الإثبات البنيوي: الثابت **موجود وسليم**، فالفرع اللي كان بيفتح مستحيل يحصل.
    expect(PILOT_OWNER_ID).toBeTruthy();
    expect(UUID_RE.test(String(PILOT_OWNER_ID))).toBe(true);
    // ولو حد بعت نص "undefined"/"null" حرفياً (بيحصل مع `String(uid)`) → مرفوض.
    expect(isPilotOwner("undefined")).toBe(false);
    expect(isPilotOwner("null")).toBe(false);
  });
});

describe("الشكل ٢ (فشل مفتوح): الفاضي/المسافات كأنه تطابق — مقفول", () => {
  it("فاضي وفاضي مش تطابق", () => {
    expect(isPilotOwner("")).toBe(false);
  });

  it("مسافات حوالين معرّف المالك مش تطابق (مافيش trim ضمني)", () => {
    expect(isPilotOwner(` ${OWNER}`)).toBe(false);
    expect(isPilotOwner(`${OWNER} `)).toBe(false);
    expect(isPilotOwner(` ${OWNER} `)).toBe(false);
    expect(isPilotOwner(`\n${OWNER}\n`)).toBe(false);
    expect(isPilotOwner(`${OWNER} `)).toBe(false);
  });

  it("مسافات لوحدها مش تطابق", () => {
    for (const ws of ["   ", "\t\n", " ", "​"]) {
      expect(isPilotOwner(ws)).toBe(false);
    }
  });
});

describe("الشكل ٣ (فشل مفتوح): إجبار نوع أو مقارنة جزئية — مقفول", () => {
  it("مصفوفة فيها المعرّف (بتساوي بـ== بسبب toString) → false", () => {
    // ⚠️ في جافاسكريبت: `["af40…"] == "af40…"` بترجع **true**. لازم `typeof === "string"`.
    const arrayish = [OWNER] as unknown as string;
    // eslint-disable-next-line eqeqeq
    expect(arrayish == OWNER).toBe(true);                       // إثبات الخطر نفسه
    expect(isPilotOwner(arrayish)).toBe(false);
  });

  it("كائن له toString يرجّع المعرّف → false", () => {
    const sneaky = { toString: () => OWNER } as unknown as string;
    expect(String(sneaky)).toBe(OWNER);                        // إثبات الخطر نفسه
    expect(isPilotOwner(sneaky)).toBe(false);
  });

  it("كائن String المُغلَّف (new String) → false (مش سترنج بدائي)", () => {
    // eslint-disable-next-line no-new-wrappers
    expect(isPilotOwner(new String(OWNER) as unknown as string)).toBe(false);
  });

  it("قيم مش سترنج خالص → false", () => {
    for (const bad of [0, 1, -1, NaN, Infinity, true, false, {}, [], () => OWNER, Symbol("x")]) {
      expect(isPilotOwner(bad as unknown as string)).toBe(false);
    }
  });

  it("مقارنة جزئية (بادئة/لاحقة/احتواء) مرفوضة", () => {
    expect(isPilotOwner(OWNER.slice(0, 35))).toBe(false);                 // ناقص محرف
    expect(isPilotOwner(OWNER + "0")).toBe(false);                        // محرف زيادة
    expect(isPilotOwner(OWNER + OWNER)).toBe(false);                      // مكرّر
    expect(isPilotOwner(`x${OWNER}`)).toBe(false);
    expect(isPilotOwner(`prefix ${OWNER} suffix`)).toBe(false);
    // UUID سليم بيشارك المالك في أول ٨ محارف — لازم يفضل مرفوض.
    expect(isPilotOwner("af40c1a6-0000-4000-8000-000000000000")).toBe(false);
  });

  it("محرف واحد مختلف (خطأ كتابة) → false", () => {
    const typo = OWNER.replace(/d$/, "e");
    expect(typo).not.toBe(OWNER);
    expect(UUID_RE.test(typo)).toBe(true);
    expect(isPilotOwner(typo)).toBe(false);
  });
});

describe("resolvePlateJudgeEnabled — نسخة حرفية من مفتاح التعلّم (الافتراضي مقفول)", () => {
  it("الافتراضي مقفول لو مش محدّد", () => {
    expect(resolvePlateJudgeEnabled(null)).toBe(false);
    expect(resolvePlateJudgeEnabled(undefined)).toBe(false);
    expect(resolvePlateJudgeEnabled("")).toBe(false);
  });

  it("مقفول صراحةً", () => {
    expect(resolvePlateJudgeEnabled(false)).toBe(false);
    expect(resolvePlateJudgeEnabled("0")).toBe(false);
    expect(resolvePlateJudgeEnabled(0)).toBe(false);
    expect(resolvePlateJudgeEnabled("false")).toBe(false);
  });

  it("شغّال بس مع القايمة المسموحة true|1|\"1\"|\"true\"", () => {
    expect(resolvePlateJudgeEnabled(true)).toBe(true);
    expect(resolvePlateJudgeEnabled(1)).toBe(true);
    expect(resolvePlateJudgeEnabled("1")).toBe(true);
    expect(resolvePlateJudgeEnabled("true")).toBe(true);
  });

  it("أي حاجة غريبة → مقفول", () => {
    for (const raw of ["xyz", "TRUE", "yes", "on", 2, -1, {}, [], [true], () => true]) {
      expect(resolvePlateJudgeEnabled(raw)).toBe(false);
    }
  });
});

describe("resolveJudgeRpc — أي خطأ من السيرفر = مقفول", () => {
  it("مفيش خطأ → القيمة بتتحسم بالقايمة المسموحة", () => {
    expect(resolveJudgeRpc(true, null)).toBe(true);
    expect(resolveJudgeRpc("1", null)).toBe(true);
    expect(resolveJudgeRpc(false, null)).toBe(false);
    expect(resolveJudgeRpc(null, undefined)).toBe(false);
  });

  it("فيه خطأ → مقفول، حتى لو الداتا بتقول شغّال", () => {
    expect(resolveJudgeRpc(true, { message: "permission denied" })).toBe(false);
    expect(resolveJudgeRpc("true", new Error("boom"))).toBe(false);
    expect(resolveJudgeRpc(1, "any truthy error")).toBe(false);
  });
});

describe("أسماء مفاتيح localStorage — معلَنة ومثبّتة بالاختبار", () => {
  it("نفس نمط باقي أسرار المندوب (ph:…)", () => {
    expect(LS_JUDGE_URL).toBe("ph:plateJudge:url");
    expect(LS_JUDGE_TOKEN).toBe("ph:plateJudge:token");
  });

  it("مش في الريبو ولا في متغيّر NEXT_PUBLIC — أسماء مفاتيح جهاز بس", () => {
    expect(LS_JUDGE_URL.startsWith("ph:")).toBe(true);
    expect(LS_JUDGE_TOKEN.startsWith("ph:")).toBe(true);
  });
});

describe("readJudgeEndpoint — نصف إعداد = مقفول", () => {
  beforeEach(() => { localStorage.clear(); });

  it("مافيش أي حاجة محفوظة → null", () => {
    expect(readJudgeEndpoint()).toBeNull();
  });

  it("URL بس بلا توكن → null", () => {
    localStorage.setItem(LS_JUDGE_URL, "https://judge.example.com");
    expect(readJudgeEndpoint()).toBeNull();
  });

  it("توكن بس بلا URL → null", () => {
    localStorage.setItem(LS_JUDGE_TOKEN, GOOD_TOKEN);
    expect(readJudgeEndpoint()).toBeNull();
  });

  it("الاتنين موجودين وسليمين → المسار الكامل + التوكن", () => {
    localStorage.setItem(LS_JUDGE_URL, "https://judge.example.com");
    localStorage.setItem(LS_JUDGE_TOKEN, GOOD_TOKEN);
    expect(readJudgeEndpoint()).toEqual({
      base: "https://judge.example.com",
      transcribeUrl: "https://judge.example.com/transcribe",
      token: GOOD_TOKEN,
    });
  });

  it("بيشيل المسافات والشرطة الأخيرة", () => {
    localStorage.setItem(LS_JUDGE_URL, "  https://judge.example.com///  ");
    localStorage.setItem(LS_JUDGE_TOKEN, `  ${GOOD_TOKEN}  `);
    expect(readJudgeEndpoint()?.transcribeUrl).toBe("https://judge.example.com/transcribe");
    expect(readJudgeEndpoint()?.token).toBe(GOOD_TOKEN);
  });

  it("نفق بمسار فرعي بيتحفظ", () => {
    localStorage.setItem(LS_JUDGE_URL, "https://tunnel.example.com/judge/");
    localStorage.setItem(LS_JUDGE_TOKEN, GOOD_TOKEN);
    expect(readJudgeEndpoint()?.transcribeUrl).toBe("https://tunnel.example.com/judge/transcribe");
  });

  it("URL فاضي/مسافات → null", () => {
    for (const u of ["", "   ", "\n"]) {
      localStorage.setItem(LS_JUDGE_URL, u);
      localStorage.setItem(LS_JUDGE_TOKEN, GOOD_TOKEN);
      expect(readJudgeEndpoint()).toBeNull();
    }
  });

  it("URL بايظ/بروتوكول ممنوع → null (مافيش http على الإنترنت: WebView بيقفل mixed-content)", () => {
    for (const u of [
      "judge.example.com",                    // بلا بروتوكول
      "http://judge.example.com",             // http على الإنترنت العام
      "ws://judge.example.com",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,x",
      "https://",
      "https://judge.example.com?token=x",    // استعلام = التوكن ممنوع في الـURL
      "https://judge.example.com#frag",
      "not a url at all",
    ]) {
      localStorage.setItem(LS_JUDGE_URL, u);
      localStorage.setItem(LS_JUDGE_TOKEN, GOOD_TOKEN);
      expect(readJudgeEndpoint(), u).toBeNull();
    }
  });

  it("http مسموح للتجربة المحلية بس (localhost / 127.0.0.1)", () => {
    localStorage.setItem(LS_JUDGE_TOKEN, GOOD_TOKEN);
    for (const u of ["http://127.0.0.1:8756", "http://localhost:8756", "http://[::1]:8756"]) {
      localStorage.setItem(LS_JUDGE_URL, u);
      expect(readJudgeEndpoint()?.transcribeUrl, u).toBe(`${u}/transcribe`);
    }
  });

  it("توكن قصير (أقل من الحد اللي السيرفر نفسه بيفرضه) → null", () => {
    localStorage.setItem(LS_JUDGE_URL, "https://judge.example.com");
    expect(JUDGE_MIN_TOKEN_LEN).toBe(12);
    localStorage.setItem(LS_JUDGE_TOKEN, "short");
    expect(readJudgeEndpoint()).toBeNull();
    localStorage.setItem(LS_JUDGE_TOKEN, "a".repeat(JUDGE_MIN_TOKEN_LEN - 1));
    expect(readJudgeEndpoint()).toBeNull();
    localStorage.setItem(LS_JUDGE_TOKEN, "a".repeat(JUDGE_MIN_TOKEN_LEN));
    expect(readJudgeEndpoint()?.token).toBe("a".repeat(JUDGE_MIN_TOKEN_LEN));
  });

  it("توكن فيه مسافة/سطر جديد/عربي → null (حقن ترويسة + ترويسة غير صالحة)", () => {
    localStorage.setItem(LS_JUDGE_URL, "https://judge.example.com");
    for (const t of [
      "abcdefgh ijklmnop",
      "abcdefghijkl\r\nX-Evil: 1",
      "abcdefghijkl\nX-Evil: 1",
      "abcdefghijkl mnop",
      "توكن-عربي-طويل-كفاية-اوي",
      "a".repeat(300),
    ]) {
      localStorage.setItem(LS_JUDGE_TOKEN, t);
      expect(readJudgeEndpoint(), JSON.stringify(t)).toBeNull();
    }
  });

  it("saveJudgeEndpoint / clearJudgeEndpoint — دورة كاملة", () => {
    expect(saveJudgeEndpoint("https://judge.example.com", GOOD_TOKEN)).toBe(true);
    expect(localStorage.getItem(LS_JUDGE_URL)).toBe("https://judge.example.com");
    expect(localStorage.getItem(LS_JUDGE_TOKEN)).toBe(GOOD_TOKEN);
    expect(readJudgeEndpoint()?.token).toBe(GOOD_TOKEN);

    clearJudgeEndpoint();
    expect(localStorage.getItem(LS_JUDGE_URL)).toBeNull();
    expect(localStorage.getItem(LS_JUDGE_TOKEN)).toBeNull();
    expect(readJudgeEndpoint()).toBeNull();
  });

  it("saveJudgeEndpoint بترفض الإعداد الغلط ومابتكتبش حاجة", () => {
    expect(saveJudgeEndpoint("http://judge.example.com", GOOD_TOKEN)).toBe(false);
    expect(saveJudgeEndpoint("https://judge.example.com", "short")).toBe(false);
    expect(localStorage.getItem(LS_JUDGE_URL)).toBeNull();
    expect(localStorage.getItem(LS_JUDGE_TOKEN)).toBeNull();
  });
});
