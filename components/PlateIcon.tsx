export default function PlateIcon({ size = 48 }: { size?: number }) {
  const h = Math.round(size * 0.5);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 48"
      width={size}
      height={h}
      aria-hidden="true"
    >
      {/* Plate background */}
      <rect x="1" y="1" width="94" height="46" rx="5" fill="white" stroke="#1a1a1a" stroke-width="2.5" />

      {/* KSA right strip */}
      <rect x="74" y="3" width="20" height="42" rx="0" fill="#e8e8e8" />
      <line x1="74" y1="3" x2="74" y2="45" stroke="#1a1a1a" stroke-width="2" />

      {/* Horizontal divider */}
      <line x1="3" y1="24" x2="74" y2="24" stroke="#1a1a1a" stroke-width="1.5" />

      {/* Vertical divider */}
      <line x1="28" y1="3" x2="28" y2="45" stroke="#1a1a1a" stroke-width="1.5" />

      {/* Top-left: Arabic numeral */}
      <text x="14.5" y="19.5" font-family="Tahoma,Arial,sans-serif" font-size="14" font-weight="900" text-anchor="middle" fill="#1a1a1a">١</text>

      {/* Top-right: Arabic letters */}
      <text x="50" y="19" font-family="Tahoma,Arial,sans-serif" font-size="13" font-weight="900" text-anchor="middle" fill="#1a1a1a">ق ن ص</text>

      {/* Bottom-left: English numeral */}
      <text x="14.5" y="37" font-family="Arial,sans-serif" font-size="14" font-weight="900" text-anchor="middle" fill="#1a1a1a">1</text>

      {/* Bottom-right: English letters */}
      <text x="50" y="37" font-family="Arial,sans-serif" font-size="11" font-weight="900" text-anchor="middle" fill="#1a1a1a" letter-spacing="1">XNG</text>

      {/* KSA label */}
      <text x="84" y="28" font-family="Arial,sans-serif" font-size="6" font-weight="bold" text-anchor="middle" fill="#1a1a1a">KSA</text>
    </svg>
  );
}
