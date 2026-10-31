/**
 * 🧾 **مربعات المجمّع** (١٨ أكتوبر ٢٠٢٦): «اسم الحي» · «اسم المسجّل» · «اسم أو رقم الجراج».
 *
 * المالك: «كل واحد من دول لو المندوب كتب فيه ينزل قدام كل اللوحات اللي المندوب كتب فيه … الكتابه اللي
 * يكتبها المندوب تتنفذ فقط علي اللوحات اللي قالها بعد الكتابه دي ولما يشيلها ويمسحها ميتحطش في اللوحات اللي
 * بعد كدة … وفوق كل مربع من دول كلمه مسح». الختم نفسه بوقت النطق في `sessionStamp.ts`.
 */
export const BOXES_KEY = "mj:boxes";

export interface StampBoxes {
  district: string;
  recorder: string;
  garage: string;
  /** 🛣️ «اسم الشارع» (٣١ أكتوبر ٢٠٢٦) */
  street: string;
}

const EMPTY: StampBoxes = { district: "", recorder: "", garage: "", street: "" };

/** المكتوب في المربعات بيفضل لو البرنامج اتقفل واتفتح (الآيفون بيقفله كتير) */
export function loadBoxes(): StampBoxes {
  try {
    const v = JSON.parse(localStorage.getItem(BOXES_KEY) || "null");
    if (!v || typeof v !== "object") return { ...EMPTY };
    return {
      district: typeof v.district === "string" ? v.district : "",
      recorder: typeof v.recorder === "string" ? v.recorder : "",
      garage: typeof v.garage === "string" ? v.garage : "",
      street: typeof v.street === "string" ? v.street : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveBoxes(b: StampBoxes): void {
  try {
    localStorage.setItem(BOXES_KEY, JSON.stringify(b));
  } catch {
    /* تخزين مقفول — المربعات للجلسة دي بس */
  }
}

/**
 * عمود الملاحظات = **اللي المندوب كتبه في مربع الجراج** + اللي اتقال للعربية (كوهير: «مركونه» · «برحه يمين»).
 * كانت ملاحظة كوهير بتمسح كلمة الجراج (`fields.note || stamp.note`).
 */
export function joinNotes(typed: string | null | undefined, spoken: string | null | undefined): string | undefined {
  const a = String(typed ?? "").trim();
  const b = String(spoken ?? "").trim();
  if (a && b) return a === b ? a : `${a} · ${b}`;
  return a || b || undefined;
}
