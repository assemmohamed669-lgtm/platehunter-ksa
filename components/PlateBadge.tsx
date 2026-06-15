/**
 * Renders a plate string (e.g. "أبح1234") as individual glowing cells —
 * the app's signature visual motif, evoking a digital plate-scanner readout.
 * A blank space in `value` renders as a narrow gap, useful for grouping
 * letters vs. numbers (e.g. "أبح" + " " + "1234").
 */
export default function PlateBadge({
  value,
  size = "md",
}: {
  value: string;
  size?: "sm" | "md";
}) {
  const chars = Array.from(value);
  const sizeClasses =
    size === "sm"
      ? "min-w-[1.75rem] h-9 text-base"
      : "min-w-[2.25rem] h-11 text-xl";

  return (
    <div className="plate-readout">
      {chars.map((ch, i) =>
        ch === " " ? (
          <span key={i} className="plate-cell plate-cell--space" />
        ) : (
          <span key={i} className={`plate-cell ${sizeClasses}`}>
            {ch}
          </span>
        )
      )}
    </div>
  );
}
