/**
 * ══════════════════════════════════════════════════════════════════════
 *  🗜️ FLAC — ضغط الصوت **من غير أي فقد** (المالك ٢٦ نوفمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «البرنامج بيستهلك انترنت كتير جدا … استهلك اكتر من ٥٢ جيجا» ⇒ «انا عايز المضمون ميأثرش علي الشغل ابدا وفي نفس
 * الوقت نقلل بقدر المستطاع».
 *
 * Voice PRO بيبعت نافذة WAV ‏١٦ك (~١٧٠ك) كل ١.٥ث وهو بيتكلم ⇒ ~٣٠٠ ميجا/ساعة تسجيل. FLAC = نفس عيّنات PCM ‏١٦-بت **بالبِت**
 * بعد الفك (lossless) — السيرفرين بيقروه: اللوحات `sf.read` (libsndfile) والنوع ffmpeg ⇒ الموديل بيسمع نفس الصوت بالظبط.
 *
 * مُشفّر صغير (مونو ١٦-بت بس — ده اللي `encodeWav` بيطلّعه): كتل ٤٠٩٦ عيّنة، كل كتلة أحسن نوع من
 * CONSTANT / FIXED (رتبة ٠–٤ + Rice بأقسام) / VERBATIM. مافيش LPC (أبطأ وفرقه قليل). مافيش MD5 (اختياري في المواصفة).
 * المواصفة: https://xiph.org/flac/format.html (RFC 9639).
 */

const BLOCK = 4096;
const BLOCK_CODE_4096 = 0b1100;
const MAX_PART_ORDER = 6;

class BitWriter {
  buf: Uint8Array;
  pos = 0;        // بايت
  private acc = 0;  // البِتات اللي لسه ماتكتبتش (أعلى بِت الأول)
  private n = 0;    // عددهم (< ٨ بعد كل كتابة)

  constructor(size: number) {
    this.buf = new Uint8Array(Math.max(64, size));
  }

  private grow(extra: number) {
    if (this.pos + extra <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.pos + extra) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.pos));
    this.buf = nb;
  }

  /** `bits` ≤ ٢٤ في المرة (الأكبر بيتقسم) — القيمة موجبة (الإشارة متعالجة برّه). */
  write(value: number, bits: number) {
    while (bits > 24) {
      const hi = bits - 24;
      this.write(Math.floor(value / 2 ** 24) & ((1 << hi) - 1), hi);
      value = value % 2 ** 24;
      bits = 24;
    }
    if (bits <= 0) return;
    this.acc = (this.acc << bits) | (value & ((1 << bits) - 1));
    this.n += bits;
    this.grow(4);
    while (this.n >= 8) {
      this.n -= 8;
      this.buf[this.pos++] = (this.acc >>> this.n) & 0xff;
    }
    this.acc &= (1 << this.n) - 1;
  }

  /** `q` أصفار وبعدين ١. */
  unary(q: number) {
    while (q >= 24) { this.write(0, 24); q -= 24; }
    this.write(1, q + 1);
  }

  signed(v: number, bits: number) {
    this.write(v < 0 ? v + 2 ** bits : v, bits);
  }

  alignZero() {
    if (this.n > 0) this.write(0, 8 - this.n);
  }

  bytes(): Uint8Array {
    return this.buf.subarray(0, this.pos);
  }
}

const CRC8 = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();
const CRC16 = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t[i] = c;
  }
  return t;
})();
function crc8(b: Uint8Array, from: number, to: number): number {
  let c = 0;
  for (let i = from; i < to; i++) c = CRC8[c ^ b[i]];
  return c;
}
function crc16(b: Uint8Array, from: number, to: number): number {
  let c = 0;
  for (let i = from; i < to; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >>> 8) ^ b[i]];
  return c;
}

/** رقم الفريم بترميز UTF-8 الموسّع (المواصفة). */
function writeUtf8Num(w: BitWriter, v: number) {
  if (v < 0x80) { w.write(v, 8); return; }
  const lens = [0x800, 0x10000, 0x200000, 0x4000000, 0x80000000];
  let extra = 1;
  while (extra < lens.length && v >= lens[extra - 1]) extra++;
  const lead = (0xff << (7 - extra)) & 0xff;
  w.write(lead | Math.floor(v / 2 ** (6 * extra)), 8);
  for (let i = extra - 1; i >= 0; i--) w.write(0x80 | (Math.floor(v / 2 ** (6 * i)) & 0x3f), 8);
}

/** بواقي المتنبّئ الثابت برتبة `order` (من العيّنة `order` لآخر الكتلة) — zigzag. */
/** عيّنات صحيحة: ١٦-بت (نوافذ اللوحات) أو ٢٤-بت في Int32Array (الخام لـ`lib/voiceDelta.ts`). */
type Samples = Int16Array | Int32Array;

function fixedResiduals(x: Samples, from: number, n: number, order: number, out: Uint32Array): void {
  for (let i = order; i < n; i++) {
    const s = from + i;
    let e: number;
    switch (order) {
      case 0: e = x[s]; break;
      case 1: e = x[s] - x[s - 1]; break;
      case 2: e = x[s] - 2 * x[s - 1] + x[s - 2]; break;
      case 3: e = x[s] - 3 * x[s - 1] + 3 * x[s - 2] - x[s - 3]; break;
      default: e = x[s] - 4 * x[s - 1] + 6 * x[s - 2] - 4 * x[s - 3] + x[s - 4]; break;
    }
    out[i] = e >= 0 ? e * 2 : -e * 2 - 1;
  }
}

/** أحسن معامل Rice لقسم (مجموع `sum` على `cnt` بواقي) + تقدير البِتات. */
function riceParam(sum: number, cnt: number): { k: number; bits: number } {
  if (cnt === 0) return { k: 0, bits: 0 };
  let k = 0;
  const mean = sum / cnt;
  while (k < 30 && 2 ** (k + 1) <= mean) k++;
  let best = { k, bits: Infinity };
  for (let kk = Math.max(0, k - 1); kk <= Math.min(30, k + 1); kk++) {
    const bits = cnt * (kk + 1) + Math.floor(sum / 2 ** kk);
    if (bits < best.bits) best = { k: kk, bits };
  }
  return best;
}

interface ResidualPlan { porder: number; params: number[]; bits: number }

/** أحسن تقسيم للبواقي (رتبة الأقسام ٠..٦) بالتقدير. */
function planResidual(u: Uint32Array, n: number, order: number): ResidualPlan {
  let best: ResidualPlan = { porder: 0, params: [], bits: Infinity };
  for (let p = 0; p <= MAX_PART_ORDER; p++) {
    const parts = 1 << p;
    if (n % parts !== 0) break;
    const psize = n / parts;
    if (psize <= order) break;
    const params: number[] = [];
    let bits = 0;
    for (let j = 0; j < parts; j++) {
      const a = j === 0 ? order : j * psize;
      const b = (j + 1) * psize;
      let sum = 0;
      for (let i = a; i < b; i++) sum += u[i];
      const r = riceParam(sum, b - a);
      params.push(r.k);
      bits += 5 + r.bits;
    }
    if (bits < best.bits) best = { porder: p, params, bits };
  }
  return best;
}

function writeBlock(w: BitWriter, x: Samples, from: number, n: number, u: Uint32Array, scratch: Uint32Array, bps: number): void {
  // CONSTANT
  let allSame = true;
  for (let i = 1; i < n && allSame; i++) if (x[from + i] !== x[from]) allSame = false;
  if (allSame) {
    w.write(0b0_000000_0, 8);
    w.signed(x[from], bps);
    return;
  }
  // أحسن FIXED
  let bestOrder = -1;
  let bestPlan: ResidualPlan | null = null;
  let bestBits = bps * n;   // VERBATIM
  for (let order = 0; order <= 4 && order < n; order++) {
    fixedResiduals(x, from, n, order, scratch);
    const plan = planResidual(scratch, n, order);
    const bits = order * bps + 6 + plan.bits;
    if (bits < bestBits) {
      bestBits = bits; bestOrder = order; bestPlan = plan;
      u.set(scratch.subarray(order, n), order);
    }
  }
  if (bestOrder < 0 || !bestPlan) {
    w.write(0b0_000001_0, 8);
    for (let i = 0; i < n; i++) w.signed(x[from + i], bps);
    return;
  }
  w.write(0, 1);
  w.write(0b001000 | bestOrder, 6);
  w.write(0, 1);
  for (let i = 0; i < bestOrder; i++) w.signed(x[from + i], bps);
  const rice2 = bestPlan.params.some((k) => k > 14);
  w.write(rice2 ? 1 : 0, 2);
  w.write(bestPlan.porder, 4);
  const parts = 1 << bestPlan.porder;
  const psize = n / parts;
  for (let j = 0; j < parts; j++) {
    const k = bestPlan.params[j];
    w.write(k, rice2 ? 5 : 4);
    const a = j === 0 ? bestOrder : j * psize;
    const b = (j + 1) * psize;
    for (let i = a; i < b; i++) {
      const v = u[i];
      w.unary(Math.floor(v / 2 ** k));
      if (k > 0) w.write(v % 2 ** k, k);
    }
  }
}

/** عيّنات مونو ⇒ ملف FLAC كامل. ١٦-بت (Int16Array) أو ٢٤-بت (Int32Array بقيم في مدى ٢٤-بت + `bps = 24`). */
export function encodeFlac(pcm: Samples, sampleRate: number, bps: 16 | 24 = 16): Uint8Array {
  const total = pcm.length;
  const w = new BitWriter(Math.ceil(total * 2 * 0.8) + 128);
  // "fLaC" + STREAMINFO (آخر بلوك ميتاداتا)
  w.write(0x664c6143, 32);
  w.write(1, 1); w.write(0, 7); w.write(34, 24);
  w.write(BLOCK, 16); w.write(BLOCK, 16);
  w.write(0, 24); w.write(0, 24);
  w.write(sampleRate, 20); w.write(0, 3); w.write(bps - 1, 5);
  w.write(total, 36);
  for (let i = 0; i < 4; i++) w.write(0, 32);   // MD5 = غير محسوب (مسموح)

  const u = new Uint32Array(BLOCK);
  const scratch = new Uint32Array(BLOCK);
  let frame = 0;
  for (let from = 0; from < total; from += BLOCK, frame++) {
    const n = Math.min(BLOCK, total - from);
    const start = w.pos;
    w.write(0b11111111111110, 14); w.write(0, 1); w.write(0, 1);
    const custom = n !== BLOCK;
    w.write(custom ? 0b0111 : BLOCK_CODE_4096, 4);
    w.write(0b0000, 4);   // معدل العيّنات من STREAMINFO
    w.write(0b0000, 4);   // قناة واحدة
    w.write(bps === 24 ? 0b110 : 0b100, 3);    // ٢٤ / ١٦ بت
    w.write(0, 1);
    writeUtf8Num(w, frame);
    if (custom) w.write(n - 1, 16);
    w.write(crc8(w.buf, start, w.pos), 8);
    writeBlock(w, pcm, from, n, u, scratch, bps);
    w.alignZero();
    w.write(crc16(w.buf, start, w.pos), 16);
  }
  return w.bytes().slice();
}

/**
 * WAV اللي `encodeWav` بيطلّعه (RIFF · PCM ١٦-بت · مونو · ترويسة ٤٤) ⇒ FLAC بنفس العيّنات. أي شكل تاني ⇒ `null`
 * (اللي بينده يبعت الـWAV زي ما هو).
 */
export function wavBytesToFlac(wav: Uint8Array): Uint8Array | null {
  if (wav.length < 44) return null;
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (o: number) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || tag(36) !== "data") return null;
  if (dv.getUint16(20, true) !== 1 || dv.getUint16(22, true) !== 1 || dv.getUint16(34, true) !== 16) return null;
  const rate = dv.getUint32(24, true);
  const dataLen = Math.min(dv.getUint32(40, true), wav.length - 44);
  if (rate <= 0 || rate >= 1 << 20 || dataLen < 2) return null;
  const n = Math.floor(dataLen / 2);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(44 + i * 2, true);
  return encodeFlac(pcm, rate);
}
