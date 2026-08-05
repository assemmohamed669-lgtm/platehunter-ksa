import { describe, it, expect, beforeEach } from "vitest";
import {
  getRegistrationEngine,
  setRegistrationEngine,
  getVoiceEngine,
  setVoiceEngine,
  applyServiceKeys,
  LS_REGISTRATION_ENGINE,
} from "@/lib/voiceKeys";

/**
 * صفحة التسجيل «معمل اختبار» للمالك — يجرّب محركات بديلة (Speechmatics) من غير ما
 * يلمس صفحة التشييك (المناديب). التشييك بيقرا getVoiceEngine() المشترك؛ فاختيار
 * محرك التسجيل لازم يتخزّن في مفتاح **منفصل تماماً** ومايأثرش على getVoiceEngine
 * ولا يترمِس وقت applyServiceKeys (اللي بيتنده كل تحميل من البروفايل).
 */
describe("عزل محرك التسجيل عن التشييك", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("الافتراضي = deepgram", () => {
    expect(getRegistrationEngine()).toBe("deepgram");
  });

  it("setRegistrationEngine يحفظ ويسترجع", () => {
    setRegistrationEngine("speechmatics");
    expect(getRegistrationEngine()).toBe("speechmatics");
    setRegistrationEngine("deepgram");
    expect(getRegistrationEngine()).toBe("deepgram");
  });

  it("🔒 تغيير محرك التسجيل مايغيّرش getVoiceEngine (التشييك زيّه)", () => {
    setVoiceEngine("deepgram"); // التشييك على Deepgram
    setRegistrationEngine("speechmatics"); // المالك يجرّب Speechmatics في التسجيل
    expect(getVoiceEngine()).toBe("deepgram"); // التشييك ما اتأثرش
    expect(getRegistrationEngine()).toBe("speechmatics");
  });

  it("🔒 applyServiceKeys (كل تحميل) مايمسحش اختيار التسجيل", () => {
    setRegistrationEngine("speechmatics");
    // البروفايل بيقول deepgram — بيترمِس المشترك بس، مش اختيار التسجيل
    applyServiceKeys({ deepgram: "k", engine: "deepgram" });
    expect(getVoiceEngine()).toBe("deepgram");
    expect(getRegistrationEngine()).toBe("speechmatics"); // اختيار المعمل باقٍ
  });

  it("مفتاح التخزين منفصل عن مفتاح المحرك المشترك", () => {
    setRegistrationEngine("speechmatics");
    expect(window.localStorage.getItem(LS_REGISTRATION_ENGINE)).toBe("speechmatics");
    expect(window.localStorage.getItem("ph:voice:engine")).not.toBe("speechmatics");
  });

  it("قيمة غير صالحة في التخزين ترجع للافتراضي", () => {
    window.localStorage.setItem(LS_REGISTRATION_ENGINE, "whisper");
    expect(getRegistrationEngine()).toBe("deepgram");
  });
});
