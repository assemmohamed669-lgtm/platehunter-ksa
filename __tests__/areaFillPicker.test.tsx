import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 📍 «املأ الحي والشارع» — المالك (١٩ أكتوبر ٢٠٢٦): «خلي الخيار اني اختار اسم المشترك او الادمن اللي هعمل معاه كدة».
 * صفحة الأدمن: بحث + قايمة الحسابات ⇒ دوسة على الاسم ⇒ «ابدأ» بيشتغل على الحساب ده.
 */
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) } },
}));
vi.mock("@/lib/geocoding", () => ({ reverseGeocode: async () => ({ street: "ش", district: "ح" }) }));

const accounts = [
  { id: "56627d4f-1e8c-4f74-bf1e-8e75077d5143", username: "أحمد الآيفون", email: null, phone: "0551234567", role: "agent" as const, is_super: false, is_active: true },
  { id: "33333333-3333-4333-8333-333333333333", username: "أدمن المجموعة", email: "g@x.com", phone: null, role: "admin" as const, is_super: false, is_active: true },
];

let bodies: Record<string, unknown>[] = [];
beforeEach(() => {
  bodies = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    bodies.push(b);
    return new Response(JSON.stringify(b.action === "scan" ? { items: [], next: null, scanned: 0, name: "أحمد الآيفون" } : { updated: 0 }), { status: 200 });
  }));
});

describe("🔘 اختيار الحساب بالاسم", () => {
  it("القايمة فيها المشتركين والأدمنز، والبحث بيفلتر", async () => {
    const { default: AreaFillPanel } = await import("@/components/AreaFillPanel");
    render(<AreaFillPanel mode="admin" accounts={accounts} />);
    expect(screen.getByText("أحمد الآيفون")).toBeTruthy();
    expect(screen.getByText("أدمن المجموعة")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/ابحث/), { target: { value: "احمد" } });
    expect(screen.queryByText("أدمن المجموعة")).toBeNull();
    expect(screen.getByText("أحمد الآيفون")).toBeTruthy();
  });

  it("«ابدأ» مقفول لحد ما يختار حساب", async () => {
    const { default: AreaFillPanel } = await import("@/components/AreaFillPanel");
    render(<AreaFillPanel mode="admin" accounts={accounts} />);
    expect((screen.getByRole("button", { name: /ابدأ/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("دوسة على الاسم ⇒ «ابدأ» بيشتغل على الحساب ده بالظبط", async () => {
    const { default: AreaFillPanel } = await import("@/components/AreaFillPanel");
    render(<AreaFillPanel mode="admin" accounts={accounts} />);
    fireEvent.click(screen.getByText("أدمن المجموعة"));
    expect(screen.getByText(/المختار/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ابدأ/ })); });
    expect(bodies[0]).toMatchObject({ action: "scan", agentId: "33333333-3333-4333-8333-333333333333" });
  });

  it("«تغيير» ⇒ القايمة ترجع", async () => {
    const { default: AreaFillPanel } = await import("@/components/AreaFillPanel");
    render(<AreaFillPanel mode="admin" accounts={accounts} />);
    fireEvent.click(screen.getByText("أحمد الآيفون"));
    expect(screen.queryByText("أدمن المجموعة")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /تغيير/ }));
    expect(screen.getByText("أدمن المجموعة")).toBeTruthy();
  });
});

describe("🔌 صفحة الأدمن بتجيب الحسابات وتديها للمربع", () => {
  it("بتقرا profiles وبتبعتها accounts", () => {
    const src = readFileSync(path.join(process.cwd(), "app/admin/area-fill/page.tsx"), "utf8");
    expect(src).toMatch(/from\("profiles"\)\s*\.select\("id, username, email, phone, role, is_super, is_active"\)/);
    expect(src).toMatch(/<AreaFillPanel mode="admin" accounts=\{accounts\}/);
  });
});
