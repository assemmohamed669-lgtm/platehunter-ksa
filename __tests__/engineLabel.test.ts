import { describe, it, expect } from "vitest";
import { engineLabel } from "@/lib/engineLabel";

/**
 * المندوب كان مش عارف إن التسجيل رجع لديبجرام: لما VoiceX يفصل، البرنامج
 * بيرجع لديبجرام **بصمت**، وعربي ديبجرام أضعف — فالمندوب بيشوف «البرنامج
 * بقى بيغلط» وهو مش عارف إن المحرك اتبدّل أصلاً. شارة اسم المحرك كانت
 * ظاهرة للسوبر أدمن بس.
 *
 * دلوقتي بتظهر لكل مندوب أثناء التسجيل — عشان يعرف بأي صوت بيشتغل دلوقتي،
 * ويقولنا «كان مكتوب ديبجرام» بدل ما يشتكي من الدقة.
 */
describe("engineLabel — اسم المحرك اللي المندوب بيشوفه", () => {
  it("موديلنا باسمه", () => {
    expect(engineLabel("voicex").text).toBe("VoiceX");
  });

  it("ديبجرام بالعربي — ده اللي المندوب هيقوله لما يشتكي", () => {
    expect(engineLabel("deepgram").text).toBe("ديبجرام");
  });

  it("موديلنا = الوضع الكويس، وأي محرك تاني = احتياطي", () => {
    expect(engineLabel("voicex").ours).toBe(true);
    expect(engineLabel("deepgram").ours).toBe(false);
    expect(engineLabel("speechmatics").ours).toBe(false);
  });

  it("باقي المحركات ليها أسماء برضه", () => {
    expect(engineLabel("speechmatics").text).toBe("Speechmatics");
    expect(engineLabel("whisper").text).toBe("Whisper");
    expect(engineLabel("local").text).toBe("المحرك المحلي");
  });

  it("محرك مش معروف أو فاضي مايكسرش الشاشة", () => {
    expect(engineLabel("").text).toBe("—");
    expect(engineLabel(null).text).toBe("—");
    expect(engineLabel("something").text).toBe("something");
    expect(engineLabel("something").ours).toBe(false);
  });
});
