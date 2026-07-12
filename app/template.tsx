"use client";

// Re-mounts on every navigation, so a light fade makes entering/returning to
// pages feel smooth instead of a hard cut.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
