import type { LucideIcon } from "lucide-react";

export function PhaseCard({
  icon: Icon,
  title,
  phase,
  children,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-dark text-primary">
          <Icon size={20} />
        </div>
        <div>
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <p className="text-xs text-muted">{phase}</p>
        </div>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-muted">
        {children}
      </div>
    </div>
  );
}

export function FeatureRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </div>
  );
}
