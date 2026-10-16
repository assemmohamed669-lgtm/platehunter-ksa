/**
 * ==========================================================================
 *  خطّاف الموقع
 * ==========================================================================
 *  بيشغّل متابعة الموقع طول ما الصفحة مفتوحة، فلما اللوحة تظهر يكون
 *  فيه قراءة جاهزة نختمها فوراً بلا انتظار.
 */

import { useEffect, useState } from "react";
import {
  currentFix,
  gpsError,
  gpsStatus,
  startGpsWatch,
  subscribeGps,
  type GpsFix,
  type GpsStatus,
} from "../lib/gps";

export interface UseGps {
  status: GpsStatus;
  fix: GpsFix | null;
  error: string | null;
}

export function useGps(enabled = true): UseGps {
  const [snapshot, setSnapshot] = useState<UseGps>(() => ({
    status: gpsStatus(),
    fix: currentFix(),
    error: gpsError(),
  }));

  useEffect(() => {
    if (!enabled) return;

    const update = () =>
      setSnapshot({ status: gpsStatus(), fix: currentFix(), error: gpsError() });

    const unsubscribe = subscribeGps(update);
    const stop = startGpsWatch();
    update();

    return () => {
      unsubscribe();
      stop();
    };
  }, [enabled]);

  return snapshot;
}
