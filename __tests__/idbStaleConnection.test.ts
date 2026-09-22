/**
 * **اتصال IndexedDB المخزّن ممكن يكون مقفول — والبرنامج كان بيستعمله على طول.**
 *
 * `openDB` بيكاش الاتصال في `_db` ومابيرميهوش إلا لما نسخة تانية تطلب ترقية
 * (`onversionchange`). لكن المتصفّح بيقفل اتصالات IndexedDB من نفسه — على iOS
 * بالذات لما التطبيق يروح ورا أو الذاكرة تضيق.
 *
 * وساعتها `db.transaction(...)` بترمي **InvalidStateError فوراً**، ولإن
 * الاتصال **واحد مشترك** بين كل العمليات، **كل** اللوحات بتفشل مرة واحدة —
 * وده بالظبط «تعذّر حفظ أي لوحة» اللي المندوب شافه. وبيتصلّح لما يقفل التطبيق
 * ويفتحه (اتصال جديد).
 */
import { describe, it, expect } from "vitest";
import { isClosedConnectionError } from "@/lib/idb";

const domEx = (name: string, message = "") => {
  const e = new Error(message);
  e.name = name;
  return e;
};

describe("isClosedConnectionError", () => {
  it("InvalidStateError = الاتصال مقفول", () => {
    expect(isClosedConnectionError(domEx("InvalidStateError"))).toBe(true);
  });

  it("رسالة فيها closing/closed", () => {
    expect(isClosedConnectionError(domEx("Error", "The database connection is closing."))).toBe(true);
    expect(isClosedConnectionError(domEx("Error", "database connection is closed"))).toBe(true);
  });

  it("TransactionInactiveError = اتصال مقفول كمان", () => {
    expect(isClosedConnectionError(domEx("TransactionInactiveError"))).toBe(true);
  });

  it("**مابيبلعش** الأخطاء الحقيقية — دي لازم توصل للمندوب", () => {
    expect(isClosedConnectionError(domEx("QuotaExceededError"))).toBe(false);
    expect(isClosedConnectionError(domEx("DataError"))).toBe(false);
    expect(isClosedConnectionError(domEx("DataCloneError"))).toBe(false);
    expect(isClosedConnectionError(domEx("NotFoundError"))).toBe(false);
  });

  it("قيم غريبة مابتكسرش", () => {
    expect(isClosedConnectionError(null)).toBe(false);
    expect(isClosedConnectionError(undefined)).toBe(false);
    expect(isClosedConnectionError("نص")).toBe(false);
    expect(isClosedConnectionError({})).toBe(false);
  });
});
