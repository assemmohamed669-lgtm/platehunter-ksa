"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ListFilter,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Navigation,
  ZoomIn,
  ZoomOut,
  Share2,
  ClipboardPaste,
  FileSpreadsheet,
  KeyRound,
} from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import FileUploadBox from "@/components/FileUploadBox";
import { supabase } from "@/lib/supabaseClient";
import { type ExcelTable, buildExcelBlob, shareOrDownloadExcel } from "@/lib/excel";
import {
  detectPlateColumn,
  matchReferralAgainstData,
  bankPlateToArabic,
  normalizePlate,
  type MatchResult,
} from "@/lib/plateParser";
import { haversineKm, extractLatLngFromMapsLink } from "@/lib/gps";

// ── Fixed output-field catalogue (maps to our standard data-file schema) ──
const OUTPUT_FIELDS = [
  { key: "vehicleType", label: "نوع السيارة", candidates: ["نوع السيارة", "النوع", "vehicle"] },
  { key: "street", label: "الشارع", candidates: ["الشارع", "شارع", "street"] },
  { key: "district", label: "الحي", candidates: ["الحي", "حي", "district"] },
  { key: "date", label: "تاريخ التسجيل", candidates: ["تاريخ التسجيل", "التاريخ", "date"] },
  { key: "gps", label: "رابط الموقع", candidates: ["رابط الموقع", "GPS", "الموقع", "خريطة"] },
  { key: "notes", label: "الملاحظات", candidates: ["الملاحظات", "ملاحظات", "notes"] },
  { key: "recorder", label: "اسم المسجل", candidates: ["اسم المسجل", "المسجل", "recorder"] },
] as const;

function getField(row: Record<string, string> | undefined, candidates: readonly string[]): string {
  if (!row) return "";
  for (const key of Object.keys(row)) {
    if (candidates.some((c) => key.toLowerCase().includes(c.toLowerCase()))) {
      return row[key] ?? "";
    }
  }
  return "";
}

const ZOOM_CLASSES = ["text-xs", "text-sm", "text-base", "text-lg"];

export default function SortingPage() {
  const [tab, setTab] = useState<"files" | "paste">("files");

  // Identity (for export watermark)
  const [username, setUsername] = useState("عميل");
  const [userId, setUserId] = useState("");

  // Uploaded tables
  const [dataTable, setDataTable] = useState<ExcelTable | null>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [referralTable, setReferralTable] = useState<ExcelTable | null>(null);
  const [referralFile, setReferralFile] = useState<File | null>(null);

  // Column selection
  const [referralExtraCols, setReferralExtraCols] = useState<Set<string>>(new Set());
  const [outputCols, setOutputCols] = useState<Set<string>>(
    new Set(["vehicleType", "street", "district", "date", "gps"])
  );

  // Run state
  const [watermarkOn, setWatermarkOn] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [sorted, setSorted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [nearestActive, setNearestActive] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  // Export password gate (per spec section 2 — protects download/upload)
  const [showExportGate, setShowExportGate] = useState(false);
  const [exportPass, setExportPass] = useState("");
  const [exportPassError, setExportPassError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Paste-text path
  const [pasteText, setPasteText] = useState("");
  const [pasteResults, setPasteResults] = useState<
    { input: string; converted: string; found: boolean; row?: Record<string, string> }[]
  >([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .single();
      if (profile?.username) setUsername(profile.username);
    });
  }, []);

  const dataPlateCol = dataTable ? detectPlateColumn(dataTable.headers) : null;
  const referralPlateCol = referralTable ? detectPlateColumn(referralTable.headers) : null;

  function toggleSet(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  function runSort() {
    if (!dataTable || !referralTable || !dataPlateCol || !referralPlateCol) return;
    const matched = matchReferralAgainstData(
      referralTable.rows,
      referralPlateCol,
      dataTable.rows,
      dataPlateCol
    );
    setResults(matched);
    setSorted(true);
    setNearestActive(false);
  }

  // ── Nearest to me ──────────────────────────────────────────────────
  async function handleNearest() {
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 })
      );
      setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setNearestActive(true);
    } catch {
      alert("تعذّر الوصول للموقع. تحقق من إذن الـ GPS.");
    } finally {
      setLocating(false);
    }
  }

  const displayResults = useMemo(() => {
    if (!results) return [];
    const matched = results.filter((r) => r.status !== "none");

    if (nearestActive && userLoc) {
      return [...matched]
        .map((r) => {
          const link = getField(r.dataRow, OUTPUT_FIELDS.find((f) => f.key === "gps")!.candidates);
          const coords = link ? extractLatLngFromMapsLink(link) : null;
          const dist = coords ? haversineKm(userLoc.lat, userLoc.lng, coords.lat, coords.lng) : Infinity;
          return { ...r, _dist: dist };
        })
        .sort((a, b) => a._dist - b._dist);
    }
    return matched;
  }, [results, nearestActive, userLoc]);

  function plateForRow(r: MatchResult): string {
    const raw = String(r.referralRow[referralPlateCol ?? ""] ?? "");
    return bankPlateToArabic(raw);
  }

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    });
  }

  // ── Export / Share (gated by secondary password) ───────────────────
  function buildExportRows() {
    return displayResults.map((r) => {
      const row: Record<string, unknown> = { "رقم اللوحة": plateForRow(r) };
      for (const field of OUTPUT_FIELDS) {
        if (outputCols.has(field.key)) {
          row[field.label] = getField(r.dataRow, field.candidates);
        }
      }
      for (const col of referralExtraCols) {
        row[col] = r.referralRow[col] ?? "";
      }
      row["نوع التطابق"] = r.status === "exact" ? "مطابقة كاملة" : `مشتبه به (${r.similarity}%)`;
      return row;
    });
  }

  async function confirmExport() {
    setExportPassError(null);
    setExporting(true);
    const { data: isValid, error } = await supabase.rpc("verify_secondary_password", {
      p_password: exportPass,
    });

    if (error || !isValid) {
      setExporting(false);
      setExportPassError("كلمة المرور غير صحيحة.");
      return;
    }

    const rows = buildExportRows();
    const blob = buildExcelBlob(
      rows,
      "نتائج الفرز",
      watermarkOn ? { username, userId } : undefined
    );
    await shareOrDownloadExcel(blob, `فرز-${new Date().toISOString().slice(0, 10)}.xlsx`);

    setExporting(false);
    setShowExportGate(false);
    setExportPass("");
  }

  // ── Paste-text path ─────────────────────────────────────────────────
  function runPasteSort() {
    if (!dataTable || !dataPlateCol) return;
    const dataMap = new Map<string, Record<string, string>>();
    for (const row of dataTable.rows) {
      const norm = normalizePlate(bankPlateToArabic(String(row[dataPlateCol] ?? "")));
      if (norm) dataMap.set(norm, row);
    }

    const tokens = pasteText
      .split(/[\n,،]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const out = tokens.map((input) => {
      const converted = bankPlateToArabic(input);
      const norm = normalizePlate(converted);
      const row = dataMap.get(norm);
      return { input, converted, found: !!row, row };
    });

    setPasteResults(out);
  }

  const matchCount = results ? results.filter((r) => r.status !== "none").length : 0;
  const exactCount = results ? results.filter((r) => r.status === "exact").length : 0;
  const fuzzyCount = results ? results.filter((r) => r.status === "fuzzy").length : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">الفرز</h1>
        <p className="text-xs text-muted">مطابقة الإحالة (البنك) مع بيانات الميدان</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-xl border border-border bg-surface p-1">
        <button
          onClick={() => setTab("files")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${
            tab === "files" ? "bg-primary text-night font-bold" : "text-muted"
          }`}
        >
          <FileSpreadsheet size={15} />
          رفع الملفات
        </button>
        <button
          onClick={() => setTab("paste")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${
            tab === "paste" ? "bg-primary text-night font-bold" : "text-muted"
          }`}
        >
          <ClipboardPaste size={15} />
          لصق نصي
        </button>
      </div>

      {/* ════════════ FILES PATH ════════════ */}
      {tab === "files" && (
        <>
          <FileUploadBox
            title="ملف الداتا"
            hint="بيانات الميدان (مثال: تصدير سابق من قاعدة البيانات)"
            parsedFile={dataFile}
            parsedRowCount={dataTable?.rows.length ?? null}
            onParsed={(table, file) => {
              setDataTable(table);
              setDataFile(file);
              setResults(null);
              setSorted(false);
            }}
            onClear={() => {
              setDataTable(null);
              setDataFile(null);
              setResults(null);
              setSorted(false);
            }}
          />

          <FileUploadBox
            title="ملف الإحالة"
            hint="قائمة البنك بالسيارات المطلوبة"
            parsedFile={referralFile}
            parsedRowCount={referralTable?.rows.length ?? null}
            onParsed={(table, file) => {
              setReferralTable(table);
              setReferralFile(file);
              setReferralExtraCols(new Set());
              setResults(null);
              setSorted(false);
            }}
            onClear={() => {
              setReferralTable(null);
              setReferralFile(null);
              setReferralExtraCols(new Set());
              setResults(null);
              setSorted(false);
            }}
          />

          {/* Referral column picker */}
          {referralTable && (
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="mb-2 text-sm font-bold text-ink">أعمدة الإحالة الإضافية</p>
              <p className="mb-2 text-xs text-muted">
                عمود اللوحة المكتشف: <span className="text-primary">{referralPlateCol}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {referralTable.headers
                  .filter((h) => h !== referralPlateCol)
                  .map((h) => (
                    <button
                      key={h}
                      onClick={() => toggleSet(referralExtraCols, h, setReferralExtraCols)}
                      className={`rounded-full px-3 py-1 text-xs transition ${
                        referralExtraCols.has(h)
                          ? "bg-primary text-night font-bold"
                          : "border border-border text-muted"
                      }`}
                    >
                      {h}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Output columns picker */}
          {dataTable && (
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="mb-2 text-sm font-bold text-ink">أعمدة النتيجة النهائية</p>
              <p className="mb-2 text-xs text-muted">
                عمود اللوحة في الداتا: <span className="text-primary">{dataPlateCol}</span> (رقم اللوحة يظهر دائمًا)
              </p>
              <div className="flex flex-wrap gap-2">
                {OUTPUT_FIELDS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => toggleSet(outputCols, f.key, setOutputCols)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      outputCols.has(f.key)
                        ? "bg-primary text-night font-bold"
                        : "border border-border text-muted"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Watermark toggle + Run button */}
          {dataTable && referralTable && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setWatermarkOn((v) => !v)}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="text-sm text-ink">إضافة علامة تتبّع للملف المُصدَّر؟</span>
                <span
                  className={`relative h-6 w-11 rounded-full transition ${
                    watermarkOn ? "bg-primary" : "bg-surface-2"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                      watermarkOn ? "right-0.5" : "right-5"
                    }`}
                  />
                </span>
              </button>

              <button
                onClick={runSort}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90"
              >
                <ListFilter size={18} />
                ابدأ الفرز
              </button>
            </div>
          )}

          {/* ── Results ── */}
          {sorted && results && (
            <div className="flex flex-col gap-3">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "تطابق مستخرج", val: matchCount, color: "text-glow" },
                  { label: "إجمالي الإحالة", val: referralTable?.rows.length ?? 0, color: "text-ink" },
                  { label: "إجمالي الداتا", val: dataTable?.rows.length ?? 0, color: "text-ink" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
                    <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                    <p className="text-xs text-muted">{s.label}</p>
                  </div>
                ))}
              </div>

              {fuzzyCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-alert/10 px-3 py-2 text-xs text-alert">
                  <AlertTriangle size={14} />
                  {fuzzyCount} لوحة مشتبه بها (تطابق تقريبي) — تحقق منها يدويًا قبل الاعتماد عليها.
                </div>
              )}

              {/* Toolbar: zoom + nearest */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setZoom((z) => Math.max(0, z - 1))}
                    className="rounded-full border border-border p-1.5 text-muted hover:text-ink"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.min(3, z + 1))}
                    className="rounded-full border border-border p-1.5 text-muted hover:text-ink"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>
                <button
                  onClick={handleNearest}
                  disabled={locating}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                    nearestActive
                      ? "bg-primary text-night font-bold"
                      : "border border-border text-muted hover:text-primary"
                  }`}
                >
                  <Navigation size={13} />
                  {locating ? "جارٍ تحديد الموقع..." : "الأقرب لموقعي"}
                </button>
              </div>

              {/* Result rows */}
              <div className="flex flex-col gap-2">
                {displayResults.map((r, i) => {
                  const plate = plateForRow(r);
                  const gpsLink = getField(r.dataRow, OUTPUT_FIELDS.find((f) => f.key === "gps")!.candidates);
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-3 ${ZOOM_CLASSES[zoom]} ${
                        r.status === "exact"
                          ? "border-glow/60 bg-glow/10 shadow-glow"
                          : "border-alert/50 bg-alert/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PlateBadge value={plate} size="sm" />
                          <button
                            onClick={() => handleCopy(plate, `r${i}`)}
                            className="text-muted hover:text-primary transition"
                          >
                            {copiedKey === `r${i}` ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                          </button>
                        </div>
                        {r.status === "exact" ? (
                          <span className="flex items-center gap-1 text-xs font-bold text-glow">
                            <CheckCircle2 size={13} /> مطابقة كاملة
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-bold text-alert">
                            <AlertTriangle size={13} /> مشتبه به {r.similarity}%
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        {outputCols.has("vehicleType") && getField(r.dataRow, OUTPUT_FIELDS[0].candidates) && (
                          <span>🚗 {getField(r.dataRow, OUTPUT_FIELDS[0].candidates)}</span>
                        )}
                        {outputCols.has("street") && getField(r.dataRow, OUTPUT_FIELDS[1].candidates) && (
                          <span>{getField(r.dataRow, OUTPUT_FIELDS[1].candidates)}</span>
                        )}
                        {outputCols.has("district") && getField(r.dataRow, OUTPUT_FIELDS[2].candidates) && (
                          <span>• {getField(r.dataRow, OUTPUT_FIELDS[2].candidates)}</span>
                        )}
                        {outputCols.has("date") && getField(r.dataRow, OUTPUT_FIELDS[3].candidates) && (
                          <span>📅 {getField(r.dataRow, OUTPUT_FIELDS[3].candidates)}</span>
                        )}
                        {nearestActive && "_dist" in r && Number.isFinite((r as any)._dist) && (
                          <span className="font-bold text-primary">
                            📍 {(r as any)._dist.toFixed(1)} كم
                          </span>
                        )}
                      </div>

                      {gpsLink && (
                        <a
                          href={gpsLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-primary underline"
                        >
                          فتح في الخريطة
                        </a>
                      )}
                    </div>
                  );
                })}

                {displayResults.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted">لا توجد تطابقات.</p>
                )}
              </div>

              {/* Save/Share */}
              <button
                onClick={() => setShowExportGate(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90"
              >
                <Share2 size={16} />
                حفظ / مشاركة النتيجة
              </button>
            </div>
          )}
        </>
      )}

      {/* ════════════ PASTE PATH ════════════ */}
      {tab === "paste" && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-ink">اللوحات الملصوقة</label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"الصق اللوحات هنا، كل لوحة في سطر أو مفصولة بفاصلة...\nمثال:\nأبح1234\nABJ5678"}
              rows={6}
              className="w-full rounded-xl border border-border bg-surface-2 p-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {!dataTable && (
            <FileUploadBox
              title="ملف الداتا للبحث بداخله"
              parsedFile={dataFile}
              parsedRowCount={dataTable?.rows.length ?? null}
              onParsed={(table, file) => {
                setDataTable(table);
                setDataFile(file);
              }}
              onClear={() => {
                setDataTable(null);
                setDataFile(null);
              }}
            />
          )}
          {dataTable && (
            <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm text-ink">
              <span>ملف الداتا: {dataTable.rows.length} صف</span>
              <button
                onClick={() => { setDataTable(null); setDataFile(null); }}
                className="text-xs text-muted hover:text-danger"
              >
                تغيير
              </button>
            </div>
          )}

          <button
            onClick={runPasteSort}
            disabled={!dataTable || !pasteText.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night disabled:opacity-50"
          >
            <ListFilter size={16} />
            فرز
          </button>

          {pasteResults.length > 0 && (
            <div className="flex flex-col gap-2">
              {pasteResults.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-3 ${
                    r.found ? "border-glow/60 bg-glow/10 shadow-glow" : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <PlateBadge value={r.converted} size="sm" />
                    {r.found ? (
                      <CheckCircle2 size={16} className="text-glow" />
                    ) : (
                      <span className="text-xs text-muted">غير موجود</span>
                    )}
                  </div>
                  {r.found && r.row && (
                    <p className="mt-1.5 text-xs text-muted">
                      {getField(r.row, OUTPUT_FIELDS[1].candidates)} • {getField(r.row, OUTPUT_FIELDS[2].candidates)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export password gate */}
      {showExportGate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound size={18} className="text-primary" />
              <h3 className="font-bold text-ink">تأكيد الحفظ/المشاركة</h3>
            </div>
            <input
              type="password"
              value={exportPass}
              onChange={(e) => setExportPass(e.target.value)}
              placeholder="كلمة المرور (إن وُجدت)"
              className="mb-3 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {exportPassError && <p className="mb-3 text-xs text-danger">{exportPassError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowExportGate(false); setExportPass(""); setExportPassError(null); }}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted"
              >
                إلغاء
              </button>
              <button
                onClick={confirmExport}
                disabled={exporting}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-60"
              >
                {exporting ? "جارٍ..." : "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}