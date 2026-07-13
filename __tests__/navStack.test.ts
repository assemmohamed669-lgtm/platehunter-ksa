import { describe, it, expect } from "vitest";
import { createNavStack } from "../lib/navStack";

describe("navStack — تتبّع تنقّل داخلي (بديل window.history في WebView أندرويد)", () => {
  it("أول مسار يتتبّع بدون سابق — الرجوع يرجّع null", () => {
    const s = createNavStack();
    s.track("/sorting");
    expect(s.canGoBack()).toBe(false);
    expect(s.pop()).toBeNull();
  });

  it("تنقّل للأمام يبني المكدّس، والرجوع يطلع المسار السابق بالترتيب العكسي", () => {
    const s = createNavStack();
    s.track("/sorting");
    s.track("/keys");
    s.track("/keys/groq");
    expect(s.canGoBack()).toBe(true);
    expect(s.pop()).toBe("/keys");
    expect(s.pop()).toBe("/sorting");
    expect(s.pop()).toBeNull(); // ما فيش أكتر من كده
  });

  it("نفس المسار مرتين ورا بعض (إعادة رندر) ما يتكررش في المكدّس", () => {
    const s = createNavStack();
    s.track("/sorting");
    s.track("/sorting");
    s.track("/keys");
    s.track("/keys");
    expect(s.canGoBack()).toBe(true);
    expect(s.pop()).toBe("/sorting");
    expect(s.pop()).toBeNull();
  });

  it("track بعد pop (أثر التنقّل الناتج عن الرجوع نفسه) ما يضيفش نسخة تانية", () => {
    const s = createNavStack();
    s.track("/sorting");
    s.track("/keys");
    s.track("/keys/groq");
    const prev = s.pop(); // "/keys" — هو اللي هيتعمله router.push
    expect(prev).toBe("/keys");
    s.track(prev!); // الأثر الجانبي: pathname اتغيّر لـ "/keys" بعد الـ push
    expect(s.pop()).toBe("/sorting"); // مش "/keys" تاني — مفيش تكرار
  });

  it("3 مستويات: منيو ← المفاتيح ← مفتاح ← رجوع رجوع يوصل لنقطة البداية", () => {
    const s = createNavStack();
    s.track("/sorting");
    s.track("/keys");
    s.track("/keys/ors");
    const p1 = s.pop();
    if (p1) s.track(p1);
    expect(p1).toBe("/keys");
    const p2 = s.pop();
    if (p2) s.track(p2);
    expect(p2).toBe("/sorting");
    expect(s.canGoBack()).toBe(false);
  });
});
