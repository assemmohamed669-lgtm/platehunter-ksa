#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  🗜️➕ مشرف delta_gateway (Voice PRO «الجديد بس» — المالك ٢٦ نوفمبر ٢٠٢٦)
#  عملية لوحدها على 127.0.0.1:8790 — مابتلمسش سيرفر اللوحات (8761) ولا المجمّع ولا النفق.
#  كرون كل دقيقة: لو مش شغّالة ⇒ تقوم. من lab.env بناخد التوكن والأصول **بس** (مش الملف كله —
#  فيه إعدادات تانية للسيرفرات التانية).
#  الإيقاف الكامل: شيل سطر الكرون + pkill -f '/root/serving/delta_gateway.py'
# ══════════════════════════════════════════════════════════════════
PAT='^/venv/main/bin/python /root/serving/delta_gateway.py'
[ -n "$(pgrep -f "$PAT" | head -1)" ] && exit 0
val() { grep -m1 "^$1=" /root/lab.env 2>/dev/null | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'; }
export PLATE_JUDGE_TOKEN="$(val PLATE_JUDGE_TOKEN)"
export SEG_ALLOWED_ORIGINS="$(val SEG_ALLOWED_ORIGINS)"
[ -z "$PLATE_JUDGE_TOKEN" ] && { echo "$(date '+%F %T') ✗ مافيش توكن" >> /root/delta-gateway.log; exit 0; }
cd /root/serving || exit 0
setsid nohup /venv/main/bin/python /root/serving/delta_gateway.py --port 8790 >> /root/delta-gateway.log 2>&1 < /dev/null 9>&- &
echo "$(date '+%F %T') ▶ delta_gateway قام" >> /root/delta-gateway.log
exit 0
