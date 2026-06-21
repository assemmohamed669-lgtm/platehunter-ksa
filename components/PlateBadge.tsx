/**
 * Renders a plate string (e.g. "أبح1234") as individual glowing cells —
 * the app's signature visual motif, evoking a digital plate-scanner readout.
 *
 * Mixed Arabic-letter + digit strings need special handling: Arabic
 * letters read right-to-left (so the first letter in the string should
 * end up as the *rightmost* cell), while digits always read left-to-right
 * even inside RTL text (a basic rule of Unicode bidi). Flexbox's own
 * `direction` property can't express this — it would reverse digits too,
 * showing "4321" instead of "1234" — so the correct on-screen order is
 * computed here explicitly: digits keep their natural order and sit on
 * the left, Arabic letters are reversed and sit on the right. A blank
 * space in `value` still renders as a narrow visual gap.
 */
function buildScreenOrder(value: string): string[] {
  const chars = Array.from(value);
  const digits: string[] = [];
  const letters: string[] = [];

  for (const ch of chars) {
    if (ch === " ") continue;
    if (/[0-9٠-٩]/.test(ch)) digits.push(ch);
    else letters.push(ch);
  }

  // Saudi plate visual layout (LTR box): digits on the left, letters on the right.
  // Letters must be reversed so the first letter in the string (e.g. ب in بصي)
  // ends up at the far right — matching how plates are read right-to-left.
  // e.g. "بصي1480" → [1][4][8][0][ي][ص][ب]  (ب = rightmost)
  return [...digits, ...letters.reverse()];
}

export default function PlateBadge({
  value,
  size = "md",
}: {
  value: string;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const cells = buildScreenOrder(value);
  const sizeClasses =
    size === "xs"
      ? "min-w-[1.1rem] h-5 text-[10px]"
      : size === "sm"
      ? "min-w-[1.75rem] h-9 text-base"
      : size === "lg"
      ? "min-w-[3.5rem] h-16 text-3xl"
      : "min-w-[2.25rem] h-11 text-xl";

  return (
    <div className="plate-readout" dir="ltr">
      {cells.map((ch, i) => (
        <span key={i} className={`plate-cell ${sizeClasses}`}>
          {ch}
        </span>
      ))}
    </div>
  );
}
