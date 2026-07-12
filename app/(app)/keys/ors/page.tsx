"use client";

import OrsKeyEditor from "@/components/OrsKeyEditor";

export default function KeysOrsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">مفتاح OpenRouteService</h1>
        <p className="text-xs text-muted">اختياري — لحساب وقت الوصول لكل سيارة بالطرق الفعلية بدل التقدير.</p>
      </div>
      <OrsKeyEditor />
    </div>
  );
}
