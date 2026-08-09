import { describe, it, expect, afterEach } from "vitest";
import { createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { usePinchZoomMulti } from "@/components/usePinchZoom";

/**
 * نوافذ نتيجة الفرز بقت **أكتر من واحدة** (نافذة لكل ملف داتا)، وعددها مش
 * معروف قبل الفرز. الهوك ماينفعش يتنادى جوه لوب، فـ `usePinchZoomMulti` بيتنادى
 * مرة واحدة وبيدّي ref لكل نافذة.
 *
 * الخطر الحقيقي: لو الـ ref اتغيّر في كل رندر، React هيفكّ ويعلّق المستمعين كل
 * مرة → زوم بايظ أو رندر متكرر. الاختبارات دي بتثبت إنه **ثابت**، وإن كل نافذة
 * بتشتغل وتتفكّ لوحدها.
 *
 * (الاختبارات بـ createElement مش JSX عشان إعداد الاختبارات في المشروع على
 * ملفات .ts — من غير ما نغيّر إعدادات الـ build.)
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(node); });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  if (host) host.remove();
  root = null; host = null;
});

/** حدث لمس بإصبعين (jsdom مافيهوش TouchEvent كامل). */
function touchEvent(type: string, pts: Array<[number, number]>) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", {
    value: pts.map(([x, y]) => ({ clientX: x, clientY: y })),
  });
  return ev;
}

describe("usePinchZoomMulti — زوم لكل نافذة نتيجة", () => {
  it("نفس المفتاح بيدّي نفس الـ ref في كل رندر (مافيش إعادة تعليق)", () => {
    const seen: Array<(el: HTMLElement | null) => void> = [];
    let bump: (n: number) => void = () => {};

    function Probe() {
      const [, setN] = useState(0);
      bump = setN;
      const pinchFor = usePinchZoomMulti(3, () => {});
      seen.push(pinchFor(0));
      return null;
    }

    mount(createElement(Probe));
    act(() => bump(1));
    act(() => bump(2));
    expect(seen.length).toBeGreaterThan(1);
    for (const r of seen) expect(r).toBe(seen[0]);
  });

  it("مفاتيح مختلفة → refs مختلفة", () => {
    let a: unknown, b: unknown;
    function Probe() {
      const pinchFor = usePinchZoomMulti(3, () => {});
      a = pinchFor(0); b = pinchFor(1);
      return null;
    }
    mount(createElement(Probe));
    expect(a).not.toBe(b);
  });

  it("كل نافذة بتحرّك الزوم لوحدها", () => {
    const calls: number[] = [];
    function Probe() {
      const pinchFor = usePinchZoomMulti(3, (u) => calls.push(u(3)));
      return createElement("div", null,
        createElement("div", { id: "w0", ref: pinchFor(0) }),
        createElement("div", { id: "w1", ref: pinchFor(1) }),
      );
    }
    mount(createElement(Probe));

    const w1 = host!.querySelector("#w1")!;
    // تباعد ~١.٢× → درجة زوم واحدة لفوق
    w1.dispatchEvent(touchEvent("touchstart", [[0, 0], [100, 0]]));
    w1.dispatchEvent(touchEvent("touchmove", [[0, 0], [120, 0]]));
    expect(calls).toEqual([4]);

    const w0 = host!.querySelector("#w0")!;
    // تقارب ~٠.٨٥ → درجة لتحت — والنافذة الأولى شغّالة مستقلة
    w0.dispatchEvent(touchEvent("touchstart", [[0, 0], [100, 0]]));
    w0.dispatchEvent(touchEvent("touchmove", [[0, 0], [85, 0]]));
    expect(calls).toEqual([4, 2]);
  });

  it("شيل نافذة بيفكّ مستمعيها بس (الباقي شغّال)", () => {
    const calls: number[] = [];
    let show = true;
    let rerender: () => void = () => {};

    function Probe() {
      const [, setN] = useState(0);
      rerender = () => setN((n) => n + 1);
      const pinchFor = usePinchZoomMulti(3, (u) => calls.push(u(3)));
      return createElement("div", null,
        createElement("div", { id: "w0", ref: pinchFor(0) }),
        show ? createElement("div", { id: "w1", ref: pinchFor(1) }) : null,
      );
    }
    mount(createElement(Probe));

    const w1 = host!.querySelector("#w1") as HTMLElement;
    show = false;
    act(() => rerender());                 // النافذة التانية اتشالت
    w1.dispatchEvent(touchEvent("touchstart", [[0, 0], [100, 0]]));
    w1.dispatchEvent(touchEvent("touchmove", [[0, 0], [120, 0]]));
    expect(calls).toEqual([]);             // مافيش تسريب من المشيلة

    const w0 = host!.querySelector("#w0")!;
    w0.dispatchEvent(touchEvent("touchstart", [[0, 0], [100, 0]]));
    w0.dispatchEvent(touchEvent("touchmove", [[0, 0], [120, 0]]));
    expect(calls).toEqual([4]);            // والأولى لسه شغّالة
  });
});
