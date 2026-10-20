// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 🔁 «فرّغ تاني» (٢٠ أكتوبر ٢٠٢٦) — المالك: «زرار فرغ تاني لو هو مفرغ يجيبلو رساله يقولو المقطع دة متفرغ».
 * الرسالة قبل أي تفريغ لمقطع متفرّغ (من زرار المقطع أو من أي مكان بيندَه `transcribeClip`).
 */
const SRC = readFileSync(fileURLToPath(new URL("../BatchPage.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");

describe("🔁 «فرّغ تاني» — الربط", () => {
  it("transcribeClip بيسأل برسالة retranscribeWarning قبل ما يدخل الطابور", () => {
    const body = SRC.slice(SRC.indexOf("const transcribeClip = async"), SRC.indexOf("queuingRef.current.add(id);", SRC.indexOf("const transcribeClip = async")));
    expect(body).toMatch(/const again = stored \? retranscribeWarning\(stored\) : null;/);
    expect(body).toMatch(/if \(again && !window\.confirm\(again\)\) return;/);
  });
});
