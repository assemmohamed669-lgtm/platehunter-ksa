/**
 * Web Worker — يفكّ تشفير ملفات إكسيل المحمية بباسورد خارج الـ main thread.
 *
 * ليه worker: فكّ التشفير (ECMA-376 Agile) بيعمل ~١٠٠ ألف دورة SHA-512 لاشتقاق
 * المفتاح — إكسيل بيعملها عمداً ضد تخمين الباسورد. لو اتعملت على الـ main thread
 * الشاشة بتتجمّد ثانية-ثانيتين. هنا بتشتغل في الخلفية فالواجهة تفضل سلسة.
 *
 * البروتوكول: postMessage({ buffer }) → { ok:true, bytes } | { ok:false, wrongPassword }.
 * الملف بيتبعت transferable (بدون نسخ) في الاتجاهين.
 */
import { Buffer } from "buffer";
import officeCrypto from "officecrypto-tool";

interface DecryptRequest {
  buffer: ArrayBuffer;
  password: string;
}

self.onmessage = async (e: MessageEvent<DecryptRequest>) => {
  const { buffer, password } = e.data;
  try {
    const buf = Buffer.from(buffer);
    // مش مشفّر أصلاً → رجّع نفس البايتات زي ما هي.
    if (!officeCrypto.isEncrypted(buf)) {
      (self as unknown as Worker).postMessage({ ok: true, bytes: buffer, notEncrypted: true }, [buffer]);
      return;
    }
    const out: Buffer = await officeCrypto.decrypt(buf, { password });
    // Buffer node قد يكون view على buffer أكبر — نقصّه لنطاقه الفعلي قبل النقل.
    const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    (self as unknown as Worker).postMessage({ ok: true, bytes: ab }, [ab]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const wrongPassword = /incorrect|password|wrong/i.test(msg);
    (self as unknown as Worker).postMessage({ ok: false, wrongPassword, error: msg });
  }
};
