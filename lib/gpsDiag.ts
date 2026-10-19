/**
 * 📍 تشخيص «موقع واحد على كل اللوحات» — المالك (١٩ أكتوبر ٢٠٢٦): مندوب آيفون ١٦ برو ماكس «بيطبق موقع لوكيشن واحد علي كل
 * اللوحات … اوقات يشتغل معاه كويس». بيتسجّل في الصندوق الأسود (`lib/deviceDiag.ts` — الحسابات اللي في القايمة بس) سطر لكل
 * لوحة في Voice PRO + نبضة للمراقب كل ١٥ ثانية.
 *
 * 🔒 **مابيسجّلش مكان المندوب** — الدقة وعمر القراية والمسافة بين لوحة واللي قبلها وهل هي نفس النقطة بالحرف، بس.
 */
import { haversineKm, type GpsCoords } from "./gps";

export interface WatchStats {
  /** عدد التحديثات اللي الآيفون بعتها للمراقب من أول ما اشتغل. */
  updates: number;
  /** إمتى آخر تحديث وصل (ms) — ٠ = ولا تحديث. */
  lastAt: number;
  lastAcc: number | null;
  running: boolean;
}

export interface PrevStamp {
  fix: GpsCoords;
  /** إمتى اللوحة دي اتختمت. */
  at: number;
  /** عدد تحديثات المراقب ساعتها. */
  watchUpdates: number;
}

const r = (n: number) => Math.round(n);

/** سطر لوحة: `waitMs` = استنى الموقع قد إيه (٠ ⇒ من المراقب على طول · كبير ⇒ طلب قراية جديدة أو استنى قراية طايرة). */
export function gpsPlateDiag(
  prev: PrevStamp | null, fx: GpsCoords | null, now: number, waitMs: number, watch: WatchStats, vis: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    waitMs: r(waitMs),
    watchRun: watch.running,
    watchAgeMs: watch.lastAt ? r(now - watch.lastAt) : null,
    watchAcc: watch.lastAcc != null ? r(watch.lastAcc) : null,
    vis,
  };
  if (!fx) return { ...out, fix: false };
  out.fix = true;
  out.acc = r(fx.accuracy);
  out.ageMs = r(now - fx.timestamp);
  if (prev) {
    out.dtPrevMs = r(now - prev.at);
    out.samePrev = prev.fix.lat === fx.lat && prev.fix.lng === fx.lng;
    out.sameTsPrev = prev.fix.timestamp === fx.timestamp;
    out.dPrevM = r(haversineKm(prev.fix.lat, prev.fix.lng, fx.lat, fx.lng) * 1000);
    out.watchNSincePrev = watch.updates - prev.watchUpdates;
  }
  return out;
}

/** نبضة المراقب: `n` = تحديثات من النبضة اللي فاتت (الآيفون في وضع الطاقة المنخفضة/واقف بيبعت أقل). */
export function gpsWatchDiag(w: WatchStats, prevUpdates: number, now: number): Record<string, unknown> {
  return {
    n: w.updates - prevUpdates,
    ageMs: w.lastAt ? r(now - w.lastAt) : null,
    acc: w.lastAcc != null ? r(w.lastAcc) : null,
    running: w.running,
  };
}
