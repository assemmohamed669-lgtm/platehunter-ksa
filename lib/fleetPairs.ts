/**
 * ══════════════════════════════════════════════════════════════════════
 *  🚚 أسطول الأرقام المتسلسلة — «حبل1234 حبل1235 حبل1236»
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٤ سبتمبر ٢٠٢٦): «لما بيبقى فيه أسطول سيارات لشركة أرقامها متسلسلة…
 * لما بيقول السيارات بالتسلسل ده مش بيظهروا، بيعدّل على السيارة اللي قالها
 * ومش بيكتب التسلسل».
 *
 * السبب: طبقتين بيلمّوا «نفس الحروف + فرق خانة» على إنها **نفس العربية
 * اتقرت غلط** — الإجماع (`digitDist ≤ 1`) ولمّ الصفوف (`sameCarTwin`، ≤ خانتين
 * في ١٢ث). وده صح لأغلاط السمع (`دطس2112`/`دطس2177`)، بس الأسطول شكله نفس
 * الشكل بالظبط.
 *
 * ── الدليل اللي بيفرّقهم ─────────────────────────────────────────────
 * **النافذة الواحدة سمعت الاتنين مع بعض.** العربية الواحدة بتتقري مرة في
 * النافذة؛ لوحتين في نفس النافذة = المندوب قال لوحتين.
 *
 * بس ده لوحده مش كفاية — مقيس على ٧٦ تسجيل مناديب (٤٬٠٤٥ لوحة، موديل ٧٥٠٠):
 * لوحتين بنفس الحروف في نافذة واحدة:
 *     أسطول حقيقي : دعن6156/6157 · داط5801/5803 · رعو2472/2473   (فرق ١–٢)
 *     غلط سمع     : بمم8788/6789 · الن6337/6077 · ارع5333/5773 … (فرق ٢٦٠+)
 * الموديل ساعات بيكرّر نفس اللوحة في النافذة بأرقام مختلفة — بس **بعيدة**.
 * ⇒ الشرطين مع بعض: **نفس النافذة + فرق الرقم ≤ ١٠**. صفر غلط سمع عدّاه.
 *
 * القياس (نفس خط الصفحة بالحرف — `__tests__/jadeedReplay.eval.test.ts`):
 *     الشارع  ٧٦ تسجيل · ٤٬٠٤٥ لوحة : صح ٣٧٨٧ ⇐ ٣٧٩٠ (رجعت داط5803 · دعن6157 ·
 *                                      رعو2473) · زيادة ٣٠٧ ⇐ ٣٠٧ · مكرر ٦ ⇐ ٦
 *     المالك  ٧ جلسات · ٤٣١ لوحة    : نفس النتيجة بالحرف
 *
 * ⚠️ اللي مش متغطّي: أسطول بيتقال **بطيء** (كل لوحة لوحدها في نوافذها) —
 *    مفيش دليل يفرّقه عن غلط سمع لنفس العربية (`دعع1670`/`دعع1676` كانت غلط
 *    سمع بفرق ٦)، فبيفضل زي ما كان. **واتجرّب ومانفعش:** «الاتنين اتأكّدوا
 *    بنافذتين + فرق ≤ ١٠» بلا نافذة مشتركة طلّع **٢ لوحة غلط** (سطل6787 ·
 *    حنل7229) ومارجّعش ولا عربية حقيقية.
 */

const WELL = /^[ء-ي]{3}\d{4}$/;

/** أقصى فرق في الرقم عشان نعتبرهم أسطول متسلسل (١٢٣٩ ⇐ ١٢٤٠ فرقها ١). */
export const FLEET_MAX_STEP = 10;

/** نفس الحروف + رقمين قريبين (≤ ١٠) + مش نفس اللوحة. */
export function isFleetPair(a: string, b: string): boolean {
  const pa = String(a ?? ""), pb = String(b ?? "");
  if (!WELL.test(pa) || !WELL.test(pb) || pa === pb) return false;
  if (pa.slice(0, 3) !== pb.slice(0, 3)) return false;
  return Math.abs(Number(pa.slice(3)) - Number(pb.slice(3))) <= FLEET_MAX_STEP;
}

/** التسلسل الفوري: اللوحة اللي قبلها لازم تكون اتسمعت في نافذتين على الأقل. */
export const FLEET_SEQ_PREV_WINDOWS = 2;
/** والنافذة الأخيرة ليها من خلال ١٢ث (نفس نافذة لمّ الصفوف). */
export const FLEET_SEQ_RECENT_MS = 12000;

/**
 * العربيات اللي **اتأكّد إنها عربيات حقيقية في أسطول** — كل واحدة اتسمعت في
 * نافذة واحدة مع جارتها في التسلسل.
 *
 * 🔴 **ليه أعضاء مش أزواج بس:** في الشارع `حبل1234` و`حبل1236` ممكن عمرهم
 * مايتسمعوا في نافذة واحدة (بينهم `حبل1235`)، ولو الدليل أزواج بس كانت
 * `حبل1236` هتتلمّ في `حبل1234` وتعدّل عليها — نفس الباج. عربيتين **الاتنين
 * مؤكّدين** بنفس الحروف = عربيتين، حتى لو بعاد عن بعض في الرقم.
 *
 * واللوحة اللي **عمرها مااتسمعت مع جارة** (`حبل1284` قرب `حبل1234`) مش عضو ⇒
 * ممكن تكون غلط سمع ⇒ اللمّ العادي بيشتغل عليها زي ما كان.
 */
export class FleetMemory {
  private members = new Set<string>();
  /** نوافذ كل إملاء (بزمن النطق) — للتسلسل الفوري بس. */
  private windows = new Map<string, number[]>();
  /**
   * 🔒 التسلسل الفوري **مقفول افتراضياً** — المالك: «ارفعه لسوبر أدمن بس أجرّبه».
   * من غيره الذاكرة زي #315 بالحرف (النافذة المشتركة بس).
   */
  private readonly sequence: boolean;
  /**
   * 🔒 «أول عربية في الأسطول» (`noteFirstCar`) — مقفول افتراضياً. المالك: «متنشرش
   * التعديل غير للسوبر أدمن». من غيره التسلسل الفوري زي #320 بالحرف.
   */
  private readonly firstCar: boolean;

  constructor(opts: { sequence?: boolean; firstCar?: boolean } = {}) {
    this.sequence = opts.sequence === true;
    this.firstCar = opts.firstCar === true;
  }

  /**
   * كل اللوحات اللي نافذة واحدة سمعتها. `tMs` = زمن النافذة (مركزها) — من غيره
   * بيشتغل دليل النافذة المشتركة بس زي الأول.
   */
  note(plates: readonly string[], tMs?: number): void {
    const ps = [...new Set((plates ?? []).map((p) => String(p ?? "").replace(/\s+/g, "")))];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (isFleetPair(ps[i], ps[j])) {
          this.members.add(ps[i]);
          this.members.add(ps[j]);
        }
      }
    }
    if (this.sequence && typeof tMs === "number" && Number.isFinite(tMs)) this.noteSequence(ps, tMs);
  }

  /**
   * 🚚 **التسلسل الفوري** — المالك: «حبل1211 حبل1212 حبل1213… كل اللوحات تطلع
   * زي باقي اللوحات». لوحة بتتسمع **لأول مرة** وفرقها **١ بالظبط** عن لوحة
   * بنفس الحروف اتسمعت في **نافذتين+ قبلها** (خلال ١٢ث) ⇒ الاتنين عربيات —
   * **من أول قراية**، فالعربية الجديدة بتطلع في نفس وقت أي لوحة.
   *
   * مقيس على ٥ مجاري قرايات حقيقية (+١٣ ألف لوحة): الحالة دي كانت عربية حقيقية
   * في كل مرة (الاستثناء الوحيد بعد ١٨ث ⇒ برّه الـ١٢ث). ولو اللي قبلها اتسمعت
   * **مرة** بس ⇒ هي اللي كانت الغلط (٦٢–٧٩ مرة في ٤٠٤٥: طيك1233 ⇐ طيك1234،
   * نافذة قطعت آخر رقم) ⇒ مش دليل، ولا حتى بسكتة.
   *
   * ⚠️ الفرق ٢+ من غير نافذة مشتركة **مش** هنا عن قصد (سطل6787/6789 نطقة واحدة).
   */
  private noteSequence(ps: string[], tMs: number): void {
    const fresh = ps.filter((p) => WELL.test(p) && !(this.windows.get(p)?.length));
    for (const p of fresh) {
      for (const [q, qt] of this.windows) {
        if (q.slice(0, 3) !== p.slice(0, 3) || ps.includes(q)) continue;
        if (Math.abs(Number(q.slice(3)) - Number(p.slice(3))) !== 1) continue;
        // مرة واحدة بتكفي لو هي **عربية مثبتة** خلاص (أسطول سريع: حكم8412 ⇐ 8413 ⇐ 8414 —
        // ٨٤١٤ جت و٨٤١٣ متسمعة مرة، والسلسلة كانت بتتقطع وتعدّل على ٨٤١٣). الخطر في
        // «مرة واحدة» إنها تبقى هي الغلط — والعربية المثبتة مش غلط.
        if (qt.length < FLEET_SEQ_PREV_WINDOWS && !this.members.has(q)) continue;
        const last = Math.max(...qt);
        if (last >= tMs || tMs - last > FLEET_SEQ_RECENT_MS) continue;
        this.members.add(p);
        this.members.add(q);
      }
    }
    for (const p of ps) {
      if (!WELL.test(p)) continue;
      const ws = this.windows.get(p) ?? [];
      if (!ws.includes(tMs)) ws.push(tMs);
      this.windows.set(p, ws);
    }
    if (this.firstCar) this.noteFirstCar(ps);
  }

  /**
   * 🚚 **أول عربية في الأسطول** — جلسة المالك (٢٤ سبتمبر ٧:٣٨م): قال دبح1232 ⇐
   * دبح1239 من غير سكتة، و١٢٣٢ ضاعت. اتقالت في أول ثانيتين فاتسمعت **مرة**،
   * ولما ١٢٣٣ جت مكانش فيه دليل. ١٢٣٣ اتثبتت بعدها في أسطول (سمعت مع ١٢٣٤).
   *
   * ⇒ عربية **مثبتة في أسطول**، واللوحة اللي فرقها **١** واتسمعت **كلها قبل أول
   * قراية ليها** (خلال ١٢ث) ⇒ عربية هي كمان، حتى لو مرة واحدة.
   *
   * ليه ده آمن هنا ومش آمن للوحات العادية: «مرة واحدة قبلها بفرق ١» في اللوحات
   * العادية غالباً قراية مقطوعة لنفس العربية (طيك1233 ⇐ طيك1234) — بس ده
   * بيشتغل **جوّه أسطول مثبت بس**، واللوحات العادية عمرها ماتبقى أعضاء.
   */
  private noteFirstCar(ps: string[]): void {
    const letters = new Set(ps.filter((p) => WELL.test(p)).map((p) => p.slice(0, 3)));
    if (!letters.size) return;
    for (const q of [...this.members]) {
      if (!letters.has(q.slice(0, 3))) continue;
      const qt = this.windows.get(q);
      if (!qt?.length) continue;
      const qFirst = Math.min(...qt);
      // نطقة حقيقية قبلها = نافذتين+ بنفس الحروف قبل أول قراية ليها (١٢٣٠ ثم ١٢٣٢ في جلسة
      // المالك). القراية المقطوعة للعربية نفسها بتبقى نافذة **واحدة** على طول قبلها.
      const before = new Set<number>();
      for (const [x, xt] of this.windows) {
        if (x === q || x.slice(0, 3) !== q.slice(0, 3)) continue;
        for (const t of xt) if (t < qFirst && qFirst - t <= FLEET_SEQ_RECENT_MS) before.add(t);
      }
      if (before.size < FLEET_SEQ_PREV_WINDOWS) continue;
      for (const [p, pt] of this.windows) {
        if (this.members.has(p) || p.slice(0, 3) !== q.slice(0, 3) || !pt.length) continue;
        if (Math.abs(Number(p.slice(3)) - Number(q.slice(3))) !== 1) continue;
        const pLast = Math.max(...pt);
        if (pLast < qFirst && qFirst - pLast <= FLEET_SEQ_RECENT_MS) this.members.add(p);
      }
    }
  }

  isMember(p: string): boolean {
    return this.members.has(String(p ?? ""));
  }

  /** عربيتين مختلفتين أكيد؟ — نفس الحروف والاتنين أعضاء مؤكّدين. */
  distinct(a: string, b: string): boolean {
    const pa = String(a ?? ""), pb = String(b ?? "");
    if (pa === pb || !WELL.test(pa) || !WELL.test(pb) || pa.slice(0, 3) !== pb.slice(0, 3)) return false;
    return this.members.has(pa) && this.members.has(pb);
  }

  reset(): void {
    this.members.clear();
    this.windows.clear();
  }
}
