/**
 * rtlExcel — يخلّي أي شيت بيطلع من البرنامج يفتح عند المندوب **من اليمين**،
 * وكل الخلايا (لوحات، مناطق، أرقام) محاذاة يمين.
 *
 * ليه محتاجين نعدّل الـ XML بإيدينا: مكتبة SheetJS النسخة المجانية **مابتكتبش**
 * محاذاة خلايا خالص، وخاصية `ws["!views"] = [{ RTL: true }]` بتتجاهل في الكتابة
 * (بتتقرا بس) — فالشيتات كانت بتفتح من الشمال. فبنفكّ ملف الـ xlsx (وهو أصلاً
 * ZIP) ونعدّل حاجتين:
 *   • كل ورقة: `rightToLeft="1"` على الـ sheetView → الأعمدة تتقرا من اليمين.
 *   • كل نمط في `<cellXfs>`: `<alignment horizontal="right" readingOrder="2"/>`
 *     → كل الخلايا محاذاة يمين باتجاه قراءة عربي.
 *
 * مهم: بنعدّل الأنماط **الموجودة** مش بنستبدلها، عشان ألوان اللوحات المكررة
 * والروابط والخط العريض للعناوين يفضلوا زي ما هم.
 *
 * أي مشكلة (ملف مش ZIP، بايتس بايظة، ملف مش xlsx) → بنرجّع الأصل زي ما هو.
 * التعديل ده إضافة على الأمان: أسوأ حالة إن الشيت يفضل زي الأول، مايتكسرش.
 */

/** فوق كده مابنعدّلش — ملفات الداتا الخام بتاعة المندوب ممكن توصل مئات الميجا. */
const MAX_PATCH_BYTES = 25 * 1024 * 1024;

/** توقيع ZIP (PK\x03\x04) — أي حاجة تانية مش xlsx. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** بيضيف rightToLeft="1" على كل sheetView في الورقة (ومابيكررش لو موجود). */
export function patchSheetXml(xml: string): string {
  if (/rightToLeft=/.test(xml)) return xml;
  if (/<sheetView[\s/>]/.test(xml)) {
    return xml.replace(/<sheetView\b/g, '<sheetView rightToLeft="1"');
  }
  // ورقة بلا sheetViews خالص — نضيف واحدة بعد <dimension .../> أو قبل <sheetData>
  const view = '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews>';
  if (/<sheetData[\s/>]/.test(xml)) return xml.replace(/<sheetData[\s/>]/, (m) => view + m);
  return xml;
}

/**
 * بيحط محاذاة يمين على كل نمط جوه <cellXfs> — النمط اللي فيه alignment قبل كده
 * بيتضاف له الأفقي جوه نفس الوسم، والنمط المقفول على نفسه (`<xf ... />`) بيتفتح.
 */
export function patchStylesXml(xml: string): string {
  const block = xml.match(/<cellXfs[^>]*>[\s\S]*?<\/cellXfs>/);
  if (!block) return xml;

  const ALIGN = '<alignment horizontal="right" readingOrder="2"/>';
  let patched = block[0].replace(/<xf\b([^>]*?)(\/>|>([\s\S]*?)<\/xf>)/g, (_m, attrs: string, tail: string, inner?: string) => {
    let a = String(attrs);
    if (!/applyAlignment=/.test(a)) a += ' applyAlignment="1"';
    else a = a.replace(/applyAlignment="0"/, 'applyAlignment="1"');

    // نمط مقفول على نفسه → نفتحه ونحط المحاذاة جواه
    if (tail === "/>") return `<xf${a}>${ALIGN}</xf>`;

    const body = String(inner ?? "");
    if (/<alignment\b/.test(body)) {
      // فيه محاذاة بالفعل — نزوّد عليها الأفقي واتجاه القراءة من غير ما نمسح اللي فيها
      const fixed = body.replace(/<alignment\b([^>]*?)\/?>/, (_am, aAttrs: string) => {
        let at = String(aAttrs);
        at = at.replace(/\s*horizontal="[^"]*"/, "").replace(/\s*readingOrder="[^"]*"/, "");
        return `<alignment${at} horizontal="right" readingOrder="2"/>`;
      });
      return `<xf${a}>${fixed}</xf>`;
    }
    return `<xf${a}>${ALIGN}${body}</xf>`;
  });

  // الوسم المقفول <cellXfs .../> (بلا أنماط) مافيش فيه حاجة نعملها
  if (patched === block[0]) return xml;
  return xml.replace(block[0], patched);
}

/**
 * بيعدّل بايتس ملف xlsx: كل الورقات من اليمين + كل الخلايا محاذاة يمين.
 * بيرجّع **نفس** البايتس لو الملف مش xlsx أو حصل أي خطأ.
 */
export async function rtlAlignXlsxBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (!looksLikeZip(bytes) || bytes.length > MAX_PATCH_BYTES) return bytes;
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(bytes);

    // لازم يكون workbook حقيقي (مش docx/apk اتصادف إنه ZIP)
    if (!zip.file("xl/workbook.xml")) return bytes;

    const sheets = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/);
    if (sheets.length === 0) return bytes;
    for (const f of sheets) {
      zip.file(f.name, patchSheetXml(await f.async("string")));
    }

    const styles = zip.file("xl/styles.xml");
    if (styles) zip.file("xl/styles.xml", patchStylesXml(await styles.async("string")));

    return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  } catch {
    return bytes;   // أي مشكلة → الملف الأصلي زي ما هو
  }
}

/** نفس الحكاية بس على Blob — بترجّع نفس الـ Blob لو مش xlsx أو حصل خطأ. */
export async function rtlAlignBlob(blob: Blob, filename?: string): Promise<Blob> {
  if (filename && !/\.xlsx$/i.test(filename)) return blob;
  if (blob.size > MAX_PATCH_BYTES) return blob;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const out = await rtlAlignXlsxBytes(bytes);
    if (out === bytes) return blob;
    // نسخة على ArrayBuffer صريح — Uint8Array<ArrayBufferLike> مش BlobPart في TS الجديد
    return new Blob([out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer], { type: blob.type });
  } catch {
    return blob;
  }
}
