# تسجيل رابط خدمة الموديل تلقائياً

الخدمة شغالة على جهاز الأدمن وبتتعرض عبر نفق **مؤقت** — الرابط بيتغيّر كل مرة
الجهاز يشتغل. السطور دي بتخلّي الخدمة تسجّل رابطها لوحدها، فالتطبيق يلاقيها
من غير ما تحط الرابط في كل تليفون.

## ١) SQL — مرة واحدة

شغّل `docs/sql/plate-model-endpoint.sql` في Supabase.

## ٢) في سيرفر الموديل (بايثون)

حط ده في مكان يشتغل **بعد** ما النفق يجيب رابطه:

```python
import os, json, urllib.request
from datetime import datetime, timezone

SUPABASE_URL = "https://utpoidcyvbuxriirlgim.supabase.co"
SERVICE_KEY  = os.environ["PLATE_SUPABASE_KEY"]   # مفتاح secret — مش في الكود

def register_model_url(public_url: str) -> bool:
    """يسجّل رابط النفق الحالي عشان التطبيق يلاقي الخدمة لوحده."""
    body = json.dumps({
        "plate_model_url": public_url.rstrip("/"),
        "plate_model_at": datetime.now(timezone.utc).isoformat(),
    }).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/app_settings?id=eq.true",
        data=body, method="PATCH",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return 200 <= r.status < 300
    except Exception as e:
        print(f"⚠️ تعذّر تسجيل الرابط: {e}")
        return False
```

ونداءها أول ما النفق يشتغل:

```python
# cloudflared بيطبع الرابط في مخرجاته — امسكه ونادِ الدالة
register_model_url("https://xxxx.trycloudflare.com")
```

## ٣) المفتاح

**متحطش المفتاح في الكود.** حطه في متغيّر بيئة قبل ما تشغّل:

```
set PLATE_SUPABASE_KEY=sb_secret_...
```

استخدم **مفتاح secret** من Supabase → Settings → API Keys (تقدر تعمل واحد
مخصوص للخدمة زي ما عملنا `backup_tool`).

## اللي بيحصل بعد كده

- تشغّل الجهاز → الخدمة تسجّل رابطها → كل المناديب يلاقوها **من غير أي تدخّل**
- تقفل الجهاز → التطبيق بيتجاهل الرابط بعد **١٢ ساعة** ويروح على البديل
- عايز تجرّب رابط معيّن؟ حطه يدوي في إعدادات جهازك — **اليدوي بيغلب المسجّل**
