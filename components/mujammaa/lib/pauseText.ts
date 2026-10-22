/** ⏸️ نص شريط «واقف مؤقت» (٢٢ أكتوبر ٢٠٢٦) — مدة الوقفة بالدقايق (أو الساعات) */
function clock(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function pauseBannerText(pausedMs: number): string {
  return (
    `⏸️ التسجيل واقف مؤقت من ${clock(pausedMs)} — اللوحات اللي هتتقال دلوقتي مش هتتسجّل. ` +
    "لما توصل مكان فيه لوحات دوس «كمّل التسجيل» ويكمّل في نفس الملف."
  );
}
