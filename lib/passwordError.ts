/**
 * 🔒 الغلط ده معناه «الملف محمي بكلمة مرور»؟
 *
 * القرّاء بيرموا رسالة عربية («محمياً» / «كلمة مرور») أو رسالة SheetJS الإنجليزي
 * («File is password-protected»). لازم نمسك الاتنين وإلا بتظهر رسالة خطأ بدل ما
 * تفتح خانة إدخال كلمة المرور.
 */
export function isPasswordErrorMessage(msg: string): boolean {
  return msg.includes("محمياً") || msg.includes("كلمة مرور")
    || /password|passphrase|protected|encrypt/i.test(msg);
}
