import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import FileUploadBox from "@/components/FileUploadBox";

/**
 * 🗂️ توصيل «داتا لكل عضو» — المسئول بيرفع لكل عضو من «إدارة مجموعتي»، والعضو بيلاقيها في الفرز «داتا من المسئول»: يفرز
 * عليها بس (من غير فتح ولا تنزيل)، وبدل داتا المجموعة. (المالك ١٥ أكتوبر ٢٠٢٦)
 */
const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

describe("🔴 مربع الداتا من غير فتح ولا تنزيل", () => {
  it("noOpen ⇒ مافيش «فتح» ولا «تنزيل»", () => {
    render(<FileUploadBox title="داتا من المسئول" parsedFile={new File([new Uint8Array([1])], "مكة.xlsx")} parsedRowCount={120}
      onParsed={() => {}} onClear={() => {}} fixed noOpen />);
    expect(screen.queryByTitle("فتح الشيت")).toBeNull();
    expect(screen.queryByTitle("تنزيل")).toBeNull();
    expect(screen.getByText("مكة.xlsx")).toBeTruthy();
  });
  it("من غيره ⇒ زي الأول", () => {
    render(<FileUploadBox title="x" parsedFile={new File([new Uint8Array([1])], "a.xlsx")} parsedRowCount={1} onParsed={() => {}} onClear={() => {}} fixed />);
    expect(screen.getByTitle("فتح الشيت")).toBeTruthy();
    expect(screen.getByTitle("تنزيل")).toBeTruthy();
  });
});

describe("🔴 صفحة الفرز عند العضو", () => {
  const S = read("app/(app)/sorting/page.tsx");
  it("بتنزّل الملف المخصوص لو أحدث (أو بتشيله لو المسئول شاله)", () => {
    expect(S).toMatch(/const syncMemberData = useCallback\(async \(\) => \{/);
    expect(S).toMatch(/await fetchMyMemberData\(\)/);
    expect(S).toMatch(/await downloadMyMemberData\(\)/);
    expect(S).toMatch(/ingestRemoteData\(MEMBER_DATA_SLOT, /);
    expect(S).toMatch(/clearRemoteData\(MEMBER_DATA_SLOT\)/);
  });
  it("🔴 بيفرز عليها هي بس بدل داتا المجموعة (قرار المالك)", () => {
    expect(S).toMatch(/if \(memberDataReady\) \{/);
    expect(S).toMatch(/\} else if \(teamData\.role !== "leader"\) \{/);
    expect(S).toMatch(/slot: MEMBER_DATA_SLOT/);
  });
  it("وجودها لوحده بيكفّي للفرز (الكلي والجديد)", () => {
    expect(S).toMatch(/const memberDataReady = !!memberFile && \(\(memberStreamed && !!memberStreamMeta\) \|\| !!memberTable\);/);
    expect(S).toMatch(/if \(!\(hasUploadedData \|\| hasRecordsData \|\| memberDataReady\) \|\|/);
    expect(S).toMatch(/if \(\(!dataTable && !memberDataReady\) \|\| !referralTable/);
  });
  it("🔒 المربع من غير فتح ولا تنزيل ولا مسح", () => {
    expect(S).toMatch(/title="داتا من المسئول"[\s\S]{0,600}fixed\s+noOpen/);
  });
  it("الانتقال لمجموعة تانية بيشيل الملف من الموبايل", () => {
    expect(read("lib/activeTeamSwitch.ts")).toMatch(/MEMBER_DATA_SLOT/);
  });
});

describe("🔴 «إدارة مجموعتي» ⇒ «داتا الأعضاء»", () => {
  it("تاب للمسئول بأعضاء المجموعة دي بس + «تخصيص داتا لعضو»", () => {
    const G = read("app/(app)/my-group/page.tsx");
    expect(G).toMatch(/setTab\("memberData"\)/);
    expect(G).toMatch(/<MemberDataManager team=\{g\.team\} \/>/);
    const M = read("components/MemberDataManager.tsx");
    expect(M).toMatch(/listMemberData\(team\)/);
    expect(M).toMatch(/uploadMemberData\(team, /);
    expect(M).toMatch(/clearMemberData\(team, /);
    expect(M).toMatch(/تخصيص داتا لعضو/);
  });
});
