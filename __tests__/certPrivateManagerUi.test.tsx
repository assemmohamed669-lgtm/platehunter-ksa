import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";

/**
 * 🔒 الشهايد الخاصة — مربع التحكّم في «إحصائيات الشهايد» (السوبر أدمن): حالة الحساب التاني · المختارين بأساميهم ·
 * لكل واحد «الجديد بس» / «الجديد والقديم» · إضافة بالاسم · شيل.
 */

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) } },
}));

let state = {
  configured: true,
  today: { total: 4, parsed: 3 } as { total: number; parsed: number } | null,
  setup: false,
  members: [{ agentId: "a2", name: "احمد حسني", team: "مجموعه سلام", mode: "private_only" }],
};
const posts: Record<string, unknown>[] = [];

beforeEach(() => {
  posts.length = 0;
  state = {
    configured: true, today: { total: 4, parsed: 3 }, setup: false,
    members: [{ agentId: "a2", name: "احمد حسني", team: "مجموعه سلام", mode: "private_only" }],
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const b = JSON.parse(String(init.body));
      posts.push(b);
      if (b.action === "add") state.members.push({ agentId: b.agentId, name: "محمد ابو عبده", team: "", mode: b.mode });
      if (b.action === "mode") state.members = state.members.map((m) => (m.agentId === b.agentId ? { ...m, mode: b.mode } : m));
      if (b.action === "remove") state.members = state.members.filter((m) => m.agentId !== b.agentId);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes("?q=")) return new Response(JSON.stringify({ matches: [{ agentId: "a1", name: "محمد ابو عبده", team: null }] }), { status: 200 });
    return new Response(JSON.stringify(state), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mount() {
  const { default: PrivateCertsManager } = await import("@/components/PrivateCertsManager");
  render(<PrivateCertsManager />);
  await screen.findByText("احمد حسني");
}

describe("🔒 مربع الشهايد الخاصة", () => {
  it("🔴 بيقول حالة الحساب التاني وعدد النهارده", async () => {
    await mount();
    expect(screen.getByText(/الحساب التاني متوصّل/)).toBeTruthy();
    expect(screen.getByText(/النهارده: ٤/)).toBeTruthy();
  });

  it("الحساب التاني لسه ماتوصلش ⇒ بيقول كده", async () => {
    state.configured = false; state.today = null;
    await mount();
    expect(screen.getByText(/لسه ماتوصلش/)).toBeTruthy();
  });

  it("🔴 المختارين بأساميهم ووضع كل واحد", async () => {
    await mount();
    const row = screen.getByText("احمد حسني").closest("[data-member]") as HTMLElement;
    expect(row.querySelector("[aria-pressed=true]")?.textContent).toBe("الجديد بس");
  });

  it("🔴 تغيير الوضع لـ«الجديد والقديم»", async () => {
    await mount();
    const row = screen.getByText("احمد حسني").closest("[data-member]") as HTMLElement;
    fireEvent.click(Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "الجديد والقديم")!);
    await waitFor(() => expect(posts).toEqual([{ action: "mode", agentId: "a2", mode: "both" }]));
  });

  it("🔴 إضافة بالاسم (الافتراضي «الجديد والقديم»)", async () => {
    await mount();
    fireEvent.change(screen.getByPlaceholderText(/اكتب اسم المندوب/), { target: { value: "عبده" } });
    fireEvent.click(await screen.findByRole("button", { name: /محمد ابو عبده/ }));
    await waitFor(() => expect(posts).toEqual([{ action: "add", agentId: "a1", mode: "both" }]));
    await screen.findAllByText("محمد ابو عبده");
  });

  it("🔴 شيل من القايمة", async () => {
    await mount();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const row = screen.getByText("احمد حسني").closest("[data-member]") as HTMLElement;
    fireEvent.click(row.querySelector("[aria-label='شيل']")!);
    await waitFor(() => expect(posts).toEqual([{ action: "remove", agentId: "a2" }]));
  });

  it("الجداول لسه ماتعملتش ⇒ «محتاج خطوة على سوبابيز»", async () => {
    state.setup = true; state.members = [];
    const { default: PrivateCertsManager } = await import("@/components/PrivateCertsManager");
    render(<PrivateCertsManager />);
    expect(await screen.findByText(/محتاج خطوة على سوبابيز/)).toBeTruthy();
  });

  it("🔴 المربع في صفحة «إحصائيات الشهايد» (السوبر أدمن بس)", () => {
    const page = readFileSync("app/admin/certificates/page.tsx", "utf8");
    expect(page).toMatch(/import PrivateCertsManager from "@\/components\/PrivateCertsManager"/);
    expect(page).toMatch(/<PrivateCertsManager \/>/);
  });
});
