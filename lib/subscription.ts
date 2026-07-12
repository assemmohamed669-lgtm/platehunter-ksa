/**
 * Subscription status logic — shared by the admin dashboard and the delegate
 * app. A subscription runs until `subscription_end`; after it there's a
 * GRACE_DAYS window where the service still works, then it's cut off.
 */
export const GRACE_DAYS = 5;

export type SubStatus = "active" | "expiring" | "grace" | "expired" | "none";

export interface SubInfo {
  status: SubStatus;
  daysLeft: number;   // days until end (negative once past end)
  label: string;
  color: string;      // hex for badges
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function subStatus(end: string | null | undefined, graceDays = GRACE_DAYS): SubInfo {
  if (!end) return { status: "none", daysLeft: 0, label: "بدون اشتراك", color: "#9ca3af" };
  const endMs = new Date(end + "T00:00:00").getTime();
  const daysLeft = Math.round((endMs - startOfToday()) / 86_400_000);

  if (daysLeft >= 4) return { status: "active", daysLeft, label: `نشط · ${daysLeft} يوم`, color: "#1FAE6E" };
  if (daysLeft >= 0) return { status: "expiring", daysLeft, label: `قرب ينتهي · ${daysLeft} يوم`, color: "#F59E0B" };
  if (daysLeft >= -graceDays) return { status: "grace", daysLeft, label: `في السماح · ${graceDays + daysLeft} يوم`, color: "#F97316" };
  return { status: "expired", daysLeft, label: "منتهي — مقطوع", color: "#EF4444" };
}

/** True when the service should be CUT OFF (past end + grace). */
export function isCutOff(end: string | null | undefined, isActive: boolean, graceDays = GRACE_DAYS): boolean {
  if (!isActive) return true;
  if (!end) return false; // no subscription set → don't cut (admin accounts / unset)
  return subStatus(end, graceDays).status === "expired";
}
