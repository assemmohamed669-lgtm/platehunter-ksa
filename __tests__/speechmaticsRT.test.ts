import { describe, it, expect } from "vitest";
import { speechmaticsTranscript } from "@/lib/speechmaticsRT";

// Speechmatics RT v2: نص الجملة في metadata.transcript، مش في جذر الرسالة.
// الباجّ القديم كان بيقرا msg.transcript (undefined دايماً) → مفيش لوحات بتطلع.
describe("speechmaticsTranscript — استخراج النص من رسالة Speechmatics", () => {
  it("بياخد النص من metadata.transcript (الشكل الحقيقي)", () => {
    const msg = { message: "AddTranscript", format: "2.9", metadata: { start_time: 0, end_time: 2, transcript: "ابح ١٢٣٤" }, results: [] };
    expect(speechmaticsTranscript(msg)).toBe("ابح ١٢٣٤");
  });

  it("AddPartialTranscript بنفس الشكل", () => {
    const msg = { message: "AddPartialTranscript", metadata: { transcript: "سن ٥٦" } };
    expect(speechmaticsTranscript(msg)).toBe("سن ٥٦");
  });

  it("fallback: نص في الجذر لو مفيش metadata", () => {
    expect(speechmaticsTranscript({ transcript: "قنص ٧٨٩" })).toBe("قنص ٧٨٩");
  });

  it("fallback: يبني من results لو مفيش transcript جاهز", () => {
    const msg = { results: [
      { alternatives: [{ content: "ا" }] },
      { alternatives: [{ content: "ب" }] },
      { alternatives: [{ content: "١٢٣" }] },
    ] };
    expect(speechmaticsTranscript(msg)).toBe("ا ب ١٢٣");
  });

  it("فاضي لو مفيش أي نص", () => {
    expect(speechmaticsTranscript({ message: "AddTranscript" })).toBe("");
    expect(speechmaticsTranscript(null)).toBe("");
    expect(speechmaticsTranscript({ metadata: { transcript: "   " } })).toBe("");
  });
});
