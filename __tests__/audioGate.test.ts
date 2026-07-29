import { describe, it, expect } from "vitest";
import { newSpeechGateState, updateSpeechState, DEFAULT_GATE_OPTS } from "@/lib/audioGate";

describe("updateSpeechState — بوابة الكلام (VAD)", () => {
  it("يبدأ ساكت (مش بيبعت)", () => {
    expect(newSpeechGateState().speaking).toBe(false);
  });

  it("فريم عالي (كلام) → speaking=true", () => {
    let s = newSpeechGateState();
    s = updateSpeechState(s, 0.2, 1000);
    expect(s.speaking).toBe(true);
    expect(s.lastSpeechAt).toBe(1000);
  });

  it("صمت قصير بعد كلام (داخل hangover) → لسه بيبعت", () => {
    let s = newSpeechGateState();
    s = updateSpeechState(s, 0.2, 1000);
    s = updateSpeechState(s, 0.0005, 1000 + 500); // 500ms < 1800ms hangover
    expect(s.speaking).toBe(true);
  });

  it("صمت أطول من hangover → يقف يبعت", () => {
    let s = newSpeechGateState();
    s = updateSpeechState(s, 0.2, 1000);
    s = updateSpeechState(s, 0.0005, 1000 + 2000); // 2000ms > 1800ms hangover
    expect(s.speaking).toBe(false);
  });

  it("طاقة تحت minEnergy (همس/ضجيج خفيف) → مايعتبرش كلام حتى فوق الأرضية", () => {
    let s = newSpeechGateState();
    // خلّي الأرضية تنزل جداً بفريمات هادية
    for (let t = 0; t < 50; t++) s = updateSpeechState(s, 0.0004, t * 50);
    // energy 0.006 أعلى من floor*factor بس أقل من minEnergy(0.008) → مش كلام
    s = updateSpeechState(s, 0.006, 5000);
    expect(s.speaking).toBe(false);
  });

  it("أرضية الضجيج بتتكيّف على الضجيج **قبل** الكلام (تمنع تشغيله على ضجيج البيئة)", () => {
    let s = newSpeechGateState();
    // ضجيج بيئة تحت minEnergy (مايعتبرش كلام) → الأرضية بتتكيّف عليه وبنفضل ساكتين
    for (let t = 0; t < 200; t++) s = updateSpeechState(s, 0.007, t * 20);
    expect(s.speaking).toBe(false);
    expect(s.noiseFloor).toBeGreaterThan(0.005);
  });

  // ── انحدار: الباج الميداني اللي كان بيضيّع كل اللوحات بعد أول ثانيتين ──────────
  // كانت الأرضية بتصعد **وإحنا بنبعت**، فكلام المندوب يرفع عتبة نفسه → البوابة
  // تقفل بعد ~٢ ثانية كلام متواصل وتفضل مقفولة (مفيش صوت يوصل Deepgram).
  describe("انحدار: البوابة ماتقفلش على نفسها وإحنا بنبعت", () => {
    const secondsOf = (energy: number, seconds: number, s: ReturnType<typeof newSpeechGateState>, t0 = 0) => {
      let s2 = s;
      let t = t0;
      let blocked = 0;
      const frames = Math.round((seconds * 1000) / 20);
      for (let f = 0; f < frames; f++) {
        t += 20;
        s2 = updateSpeechState(s2, energy, t);
        if (!s2.speaking) blocked++;
      }
      return { s: s2, t, blocked, frames };
    };

    it("كلام متواصل ١٥ ثانية بنفس المستوى → بيفضل يبعت طول الوقت", () => {
      const r = secondsOf(0.05, 15, newSpeechGateState());
      expect(r.blocked).toBe(0);
      expect(r.s.speaking).toBe(true);
    });

    it("رفع الصوت (يعيد اللوحة) ثم الرجوع للمستوى العادي → يفضل يبعت", () => {
      const loud = secondsOf(0.25, 3, newSpeechGateState());
      const normal = secondsOf(0.05, 5, loud.s, loud.t);
      expect(normal.blocked).toBe(0);
      expect(normal.s.speaking).toBe(true);
    });

    it("لوحة كاملة (٤ ثواني) بوقفات قصيرة بين الحروف → مفيش قطع", () => {
      let s = newSpeechGateState();
      let t = 0;
      let blocked = 0;
      for (let i = 0; i < 7; i++) {           // ٧ مقاطع (٣ حروف + ٤ أرقام)
        for (let f = 0; f < 20; f++) { t += 20; s = updateSpeechState(s, 0.06, t); if (!s.speaking) blocked++; }
        for (let f = 0; f < 8; f++) { t += 20; s = updateSpeechState(s, 0.001, t); if (!s.speaking) blocked++; }
      }
      expect(blocked).toBe(0);
    });

    it("السكوت الطويل لسه بيوقف الإرسال (البوابة لسه بتوفّر الفاتورة)", () => {
      let s = newSpeechGateState();
      s = updateSpeechState(s, 0.05, 1000);
      expect(s.speaking).toBe(true);
      const quiet = 1000 + DEFAULT_GATE_OPTS.hangoverMs + 100;
      s = updateSpeechState(s, 0.0005, quiet);
      expect(s.speaking).toBe(false);
    });
  });

  it("DEFAULT_GATE_OPTS معرّفة بقيم منطقية", () => {
    expect(DEFAULT_GATE_OPTS.hangoverMs).toBeGreaterThan(0);
    expect(DEFAULT_GATE_OPTS.factor).toBeGreaterThan(1);
  });
});
