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

  it("أرضية الضجيج بتتكيّف: ضجيج ثابت عالي بيرفع noiseFloor (رفض ضجيج مستمر)", () => {
    let s = newSpeechGateState();
    for (let t = 0; t < 120; t++) s = updateSpeechState(s, 0.05, t * 50);
    expect(s.noiseFloor).toBeGreaterThan(0.02);
  });

  it("DEFAULT_GATE_OPTS معرّفة بقيم منطقية", () => {
    expect(DEFAULT_GATE_OPTS.hangoverMs).toBeGreaterThan(0);
    expect(DEFAULT_GATE_OPTS.factor).toBeGreaterThan(1);
  });
});
