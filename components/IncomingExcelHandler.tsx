"use client";

/**
 * Listens for `excelFileOpened` events dispatched by MainActivity when the
 * user opens an Excel file (.xlsx / .xls) from WhatsApp, email, or Files.
 *
 * Shows a bottom-sheet so the user picks where to load the file:
 *   • فرز — إحالة  → saved as local:referral, navigate to /sorting
 *   • فرز — داتا   → saved as local:data,     navigate to /sorting
 *   • تشييك         → saved as local:check,    navigate to /instant-check
 *   • ملف داتا إضافي → أول مربع داتا إضافي فاضي (local:data-N) تحت الأساسي، /sorting
 *     (المالك ٥ أكتوبر ٢٠٢٦ — السوبر أدمن الأول: `EXTRA_DATA_FROM_SHARE_FOR_ALL`)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, FileSpreadsheet, ListFilter, CheckCircle2, Lock } from "lucide-react";
import { parseExcelFile, readSheetNames } from "@/lib/excel";
import { saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord } from "@/lib/idb";
import { importMultiSheetData, importLargeDataFile, getSampleRows, getDataMeta } from "@/lib/dataStore";
import { nextStreamSlot } from "@/lib/extraDataSlot";
import { supabase } from "@/lib/supabaseClient";
import { serviceActive } from "@/lib/subscription";
import { setCheckTab } from "@/lib/checkTab";
import {
  incomingExcelOptions, firstFreeSlotNum, saveIncomingExtraData, saveIncomingMainData, EXTRA_DATA_FROM_SHARE_FOR_ALL,
  VOICE_REFERRAL_SLOT, type IncomingOption,
} from "@/lib/incomingExcel";
import { readCacheFileBlob, base64ToBlob, FAST_SHARE_FOR_ALL } from "@/lib/incomingFileRead";
import { shareDataFileToTeamIfLeader, teamDataShareMessage } from "@/lib/teamData";
import { shareCheckToTeamIfLeader, teamCheckShareMessage } from "@/lib/teamCheck";
import { detectPlateColumn, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";

interface PendingFile {
  name: string;
  base64?: string;    // القديم: base64 مباشر (ملفات صغيرة / نسخ APK قديمة)
  cacheFile?: string; // الجديد: اسم الملف في كاش التطبيق — يُقرأ عبر Filesystem (أي حجم)
}

// referral-${number} = ملف إحالة إضافي (٢، ٣، ...) تحت الإحالة الأساسية.
// data-${number} = ملف داتا إضافي (٢، ٣، ...) تحت الداتا الأساسية.
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const n = (x: number) => x.toLocaleString("en-US");
type Slot = "referral" | "data" | "check" | "voice-referral" | `referral-${number}` | `data-${number}`;

export default function IncomingExcelHandler() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingFile | null>(null);
  // 👥 نتيجة رفع الملف للمجموعة (للمسئول) — بتبان بعد ما النافذة تتقفل.
  const [teamNote, setTeamNote] = useState<string | null>(null);
  useEffect(() => {
    if (!teamNote) return;
    const t = setTimeout(() => setTeamNote(null), 10_000);
    return () => clearTimeout(t);
  }, [teamNote]);

  /**
   * 👥 المسئول فتح الملف من واتساب ⇒ يوصل للمجموعة زي زرار «تغيير» بالظبط
   * (طلب المالك ٢٩ سبتمبر ٢٠٢٦ — كان بيتحفظ على جهازه بس ومن غير رسالة).
   * في الخلفية: التنقّل للصفحة مايستناش الرفع.
   */
  function notifyTeamShare(slot: Slot, file: File, rowCount: number, table?: { headers: string[]; rows: Record<string, string>[] }) {
    let job: Promise<string | null> | null = null;
    if (slot === "data") {
      job = shareDataFileToTeamIfLeader(file, rowCount).then(teamDataShareMessage);
    } else if (slot === "check") {
      job = shareCheckToTeamIfLeader(file, rowCount, () => {
        if (!table) return 0;
        const pcol = detectPlateColumn(table.headers, table.rows);
        return pcol
          ? new Set(table.rows.map((r) => normalizePlate(bankPlateToArabic(String(r[pcol] ?? "")))).filter(Boolean)).size
          : 0;
      }).then(teamCheckShareMessage);
    }
    if (job) void job.then((m) => { if (m) setTeamNote(m); }).catch(() => {});
  }
  const [loading, setLoading] = useState(false);
  // عدد الصفوف اللي اتقرت (الملفات الكبيرة اللي بتتقرا على دفعات) — عشان المندوب يشوف إنه شغّال.
  const [progressRows, setProgressRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  // الوجهة المختارة محفوظة عشان نكمّل بعد ما يدخل كلمة المرور.
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  // رقم ملف الإحالة الإضافي التالي (٢، ٣، ...) — null يعني مفيش إحالة أساسية بعد
  // فمانعرضش خيار «إضافة إحالة إضافية». بيتحسب أول ما ييجي ملف.
  const [nextReferralNum, setNextReferralNum] = useState<number | null>(null);
  // رقم مربع الداتا الإضافي التالي (٢، ٣، ...) — null = مفيش داتا أساسية بعد.
  const [nextDataNum, setNextDataNum] = useState<number | null>(null);
  const [isSuper, setIsSuper] = useState(false);
  // المشترك صوت-فقط: صفحة الفرز مقفولة عنده، فخياراته وسلوتاته مختلفة.
  // نفس منطق حارس الصفحات في `app/(app)/layout.tsx` بالظبط.
  const [voiceOnly, setVoiceOnly] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase
          .from("profiles").select("rest_pages_enabled, rest_until, is_super")
          .eq("id", data.user.id).single();
        const p = prof as { rest_pages_enabled?: boolean; rest_until?: string | null; is_super?: boolean } | null;
        const restOpen = p?.is_super === true || (p?.rest_pages_enabled !== false && serviceActive(p?.rest_until));
        setVoiceOnly(!restOpen);
        setIsSuper(p?.is_super === true);
      } catch { /* مش عارفين — نسيبها زي ما هي (خيارات كاملة) */ }
    })();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { name, base64, cacheFile } = (e as CustomEvent<PendingFile>).detail;
      setPending({ name, base64, cacheFile });
      setError(null);
      setNeedsPassword(false);
      setPassword("");
      setPendingSlot(null);
      // احسب رقم الإحالة الإضافية التالية: لو فيه إحالة أساسية (local:referral)
      // نعدّ referral-2, referral-3... لحد أول slot فاضي (نفس منطق صفحة الفرز).
      (async () => {
        try {
          const base = await getUploadedFile("local", "referral");
          if (!base) { setNextReferralNum(null); return; }
          let n = 2;
          while (await getUploadedFile("local", `referral-${n}`)) n++;
          setNextReferralNum(n);
        } catch { setNextReferralNum(null); }
      })();
      // مربع الداتا الإضافي التالي: بس لو فيه داتا أساسية (صغيرة أو كبيرة على دفعات).
      (async () => {
        try {
          const base = (await getUploadedFile("local", "data")) || (await getDataMeta("data"));
          if (!base) { setNextDataNum(null); return; }
          setNextDataNum(await firstFreeSlotNum(async (n) => !!(await getUploadedFile("local", `data-${n}`))));
        } catch { setNextDataNum(null); }
      })();
    };
    window.addEventListener("excelFileOpened", handler);
    return () => window.removeEventListener("excelFileOpened", handler);
  }, []);

  // iOS: فتح ملف إكسل من واتساب/الملفات بيوصل عبر Capacitor App (appUrlOpen)
  // كرابط file://. بنقرا الملف عبر Filesystem ونبعت نفس حدث excelFileOpened اللي
  // بيبعته MainActivity على أندرويد — فنفس شيت الاختيار بيظهر. مقصور على iOS عشان
  // مايتعارضش مع مسار أندرويد (اللي بيبعت الحدث من الكود الأصلي).
  useEffect(() => {
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.getPlatform() !== "ios") return;
        const { App } = await import("@capacitor/app");
        const sub = await App.addListener("appUrlOpen", async (data: { url?: string }) => {
          try {
            const url = data?.url ?? "";
            if (!url.startsWith("file://")) return; // فتح ملف بس (مش deep link)
            const name = decodeURIComponent((url.split("/").pop() || "file.xlsx").split("?")[0]);
            if (!/\.(xlsx|xls|xlsb|xlsm|csv|ods)$/i.test(name)) return; // صيغ الجداول بس
            const { Filesystem } = await import("@capacitor/filesystem");
            const res = await Filesystem.readFile({ path: url }); // مسار file:// كامل
            const base64 = typeof res.data === "string" ? res.data : "";
            if (base64) window.dispatchEvent(new CustomEvent("excelFileOpened", { detail: { name, base64 } }));
          } catch { /* تجاهل ملف مش صالح */ }
        });
        remove = () => { void sub.remove(); };
      } catch { /* Capacitor مش متاح (ويب) — نتجاهل */ }
    })();
    return () => remove?.();
  }, []);

  async function buildFile(p: PendingFile, fast: boolean): Promise<{ file: File; blob: Blob }> {
    if (!fast) {
      // الطريقة القديمة بالظبط (باقي المناديب لحد ما المالك يجرّب السريعة)
      let b64 = p.base64 ?? "";
      // النسخة الجديدة من الـAPK بتبعت اسم ملف في الكاش بدل الـbase64 المباشر —
      // نقراه عبر Capacitor Filesystem (قناة بتتحمّل أي حجم، بلا حد سطر JS اللي كان
      // بيقصّ الملفات الكبيرة). القديم (base64) لسه مدعوم للتوافق.
      if (!b64 && p.cacheFile) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const res = await Filesystem.readFile({ path: p.cacheFile, directory: Directory.Cache });
        b64 = typeof res.data === "string" ? res.data : "";
      }
      const binary = atob(b64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const old = new Blob([bytes], { type: XLSX_TYPE });
      return { file: new File([old], p.name, { type: old.type }), blob: old };
    }
    let raw: Blob;
    if (p.base64) {
      // القديم (نسخ APK قديمة / الآيفون): base64 مباشر — بيتفكّ بالمتصفح نفسه
      raw = await base64ToBlob(p.base64, XLSX_TYPE);
    } else if (p.cacheFile) {
      // أندرويد بيكتب الملف في الكاش. بنجيبه **بايتات على طول** (convertFileSrc + fetch) بدل
      // ما يعدّي جسر Capacitor كنص base64 كله؛ ولو أي حاجة مش مظبوطة ⇒ القديم (readFile).
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Capacitor } = await import("@capacitor/core");
      raw = await readCacheFileBlob(p.cacheFile, {
        getUri: async (f) => (await Filesystem.getUri({ path: f, directory: Directory.Cache })).uri,
        stat: async (f) => Number((await Filesystem.stat({ path: f, directory: Directory.Cache })).size),
        convertFileSrc: (u) => Capacitor.convertFileSrc(u),
        fetchBlob: async (url) => {
          const r = await fetch(url);
          if (!r.ok) throw new Error(String(r.status));
          return r.blob();
        },
        readBase64: async (f) => {
          const res = await Filesystem.readFile({ path: f, directory: Directory.Cache });
          return typeof res.data === "string" ? res.data : "";
        },
      }, XLSX_TYPE);
    } else {
      raw = new Blob([], { type: XLSX_TYPE });
    }
    const blob = raw.type === XLSX_TYPE ? raw : new Blob([raw], { type: XLSX_TYPE });
    return { file: new File([blob], p.name, { type: XLSX_TYPE }), blob };
  }

  async function runParse(slot: Slot, pwd?: string) {
    if (!pending) return;
    // القراية السريعة + الداتا الأساسية على دفعات: السوبر أدمن الأول (`FAST_SHARE_FOR_ALL`)
    const fast = FAST_SHARE_FOR_ALL || isSuper;
    setLoading(true);
    setProgressRows(0);
    setError(null);
    try {
      const { file, blob } = await buildFile(pending, fast);

      // ملف داتا فيه أكتر من ورقة → نستورده بنفس مسار صفحة الفرز (ورقة-ورقة، في
      // الـworker) عشان صندوق اختيار الورقات يظهر زي ما بيظهر لما ترفع من الجهاز.
      // (readSheetNames بيرجّع [] للملف المحمي بكلمة مرور فبيعدّي للمسار العادي
      // اللي بيتعامل مع الباسوورد.)
      if (slot === "data" && !fast) {
        const names = await readSheetNames(file);
        if (names.length > 1) {
          const meta = await importMultiSheetData(file, { slot: "data" });
          notifyTeamShare("data", file, meta.rowCount);
          // شيل أي ملف صغير قديم في نفس الـslot — صفحة الفرز بتفضّل local:data لو موجود،
          // فلازم يتشال عشان تقرا النسخة المتدفّقة (متعددة الورقات) اللي لسه اتخزّنت.
          await deleteUploadedFile("local", "data");
          window.dispatchEvent(new CustomEvent("idbFileUpdated", { detail: { slot } }));
          setPending(null);
          setNeedsPassword(false);
          setPassword("");
          setPendingSlot(null);
          router.push("/sorting");
          return;
        }
      }

      // ملف الداتا الأساسي (السريع) ⇒ بنفس طريقة مربع صفحة الفرز: أكتر من ورقة أو كبير ⇒ على
      // دفعات (في الـworker، من غير ما الصفوف كلها تتحمّل وتتحفظ مرة واحدة)؛ صغير ⇒ زي ما كان.
      if (slot === "data" && fast) {
        const r = await saveIncomingMainData(file, blob, pwd, {
          readSheetNames, importMultiSheetData, importLargeDataFile, parseExcelFile, saveUploadedFile, deleteUploadedFile,
        }, { onProgress: setProgressRows });
        notifyTeamShare("data", file, r.rowCount);
        window.dispatchEvent(new CustomEvent("idbFileUpdated", { detail: { slot } }));
        setPending(null);
        setNeedsPassword(false);
        setPassword("");
        setPendingSlot(null);
        router.push("/sorting");
        return;
      }

      // ملف داتا إضافي ⇒ مربعه تحت الداتا الأساسية، بنفس شكل صفحة الفرز
      if (slot.startsWith("data-")) {
        await saveIncomingExtraData(slot, file, blob, pwd, {
          readSheetNames, importMultiSheetData, importLargeDataFile, getSampleRows,
          parseExcelFile, saveUploadedFile, nextStreamSlot, onProgress: setProgressRows,
        });
        window.dispatchEvent(new CustomEvent("idbFileUpdated", { detail: { slot } }));
        setPending(null);
        setNeedsPassword(false);
        setPassword("");
        setPendingSlot(null);
        router.push("/sorting");
        return;
      }

      const table = await parseExcelFile(file, pwd);

      const record: UploadedFileRecord = {
        key:        `local:${slot}`,
        agentId:    "local",
        slot,
        fileName:   pending.name,
        headers:    table.headers,
        rows:       table.rows,
        uploadedAt: new Date().toISOString(),
        fileBlob:   blob,
      };
      await saveUploadedFile(record);
      notifyTeamShare(slot, file, table.rows.length, table);

      // Notify any already-open page that IDB was updated (handles same-page navigation)
      window.dispatchEvent(new CustomEvent("idbFileUpdated", { detail: { slot } }));

      setPending(null);
      setNeedsPassword(false);
      setPassword("");
      setPendingSlot(null);
      // المشترك صوت-فقط: كل وجهاته جوّه صفحة التشييك — بنودّيه للتبويب الصح
      // بدل ما نبعته لصفحة الفرز اللي الحارس هيرجّعه منها فوراً.
      const opt = options.find((o) => o.slot === slot);
      if (opt?.goTab) { setCheckTab(opt.goTab); router.push("/instant-check"); }
      else router.push(slot === "check" ? "/instant-check" : "/sorting");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "";
      const isPasswordError = msg.includes("محمياً") || msg.includes("كلمة مرور");
      if (isPasswordError) {
        // الملف محمي — اطلب كلمة المرور (أو أعلن إنها غلط لو كان جرّب واحدة).
        setPendingSlot(slot);
        setNeedsPassword(true);
        setError(pwd ? "كلمة المرور غير صحيحة. جرّب تاني." : null);
      } else {
        setError("تعذّر قراءة الملف. تأكد أنه ملف Excel صحيح (.xlsx)");
      }
    } finally {
      setLoading(false);
    }
  }

  const options: IncomingOption[] = incomingExcelOptions({
    voiceOnly, nextReferralNum,
    nextDataNum: EXTRA_DATA_FROM_SHARE_FOR_ALL || isSuper ? nextDataNum : null,
  });

  function openAs(slot: Slot) {
    runParse(slot);
  }

  function confirmPassword() {
    if (!pendingSlot || !password.trim()) return;
    runParse(pendingSlot, password.trim());
  }

  // الرسالة فوق شريط التنقّل — بتتعرض حتى من غير ملف مفتوح (بعد ما النافذة تتقفل).
  const teamToast = teamNote && (
    <div className="fixed inset-x-3 z-[70] flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-xl"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }} dir="rtl">
      <p className={`flex-1 text-xs font-bold ${teamNote.startsWith("✅") ? "text-primary" : "text-danger"}`}>{teamNote}</p>
      <button onClick={() => setTeamNote(null)} className="shrink-0 text-muted" aria-label="إغلاق"><X size={14} /></button>
    </div>
  );
  if (!pending) return teamToast || null;

  return (
    <div className="fixed inset-0 z-50 flex items-end pb-[env(safe-area-inset-bottom)] justify-center bg-black/50">
      <div
        className="w-full max-w-md rounded-t-2xl border-t border-border bg-surface px-5 py-6 shadow-2xl"
        style={{ direction: "rtl" }}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={22} className="shrink-0 text-primary" />
            <div>
              <p className="text-sm font-bold text-ink">ملف Excel وارد</p>
              <p className="mt-0.5 text-xs text-muted line-clamp-1">{pending.name}</p>
            </div>
          </div>
          <button
            onClick={() => setPending(null)}
            className="rounded-full p-1 text-muted hover:text-ink transition"
          >
            <X size={18} />
          </button>
        </div>

        {needsPassword ? (
          /* ── الملف محمي بكلمة مرور ── */
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-xl bg-alert/10 px-3 py-2.5 text-alert">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">
                الملف محمي بكلمة مرور. اكتب كلمة المرور بتاعت الإكسل عشان نفتحه.
              </p>
            </div>
            <input
              type="password"
              dir="ltr"
              autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmPassword(); }}
              placeholder="كلمة مرور الملف"
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-center text-ink placeholder:text-sm focus:border-primary focus:outline-none"
            />
            {error && (
              <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setNeedsPassword(false); setPassword(""); setPendingSlot(null); setError(null); }}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted transition active:scale-95"
              >
                رجوع
              </button>
              <button
                onClick={confirmPassword}
                disabled={loading || !password.trim()}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition active:scale-95 disabled:opacity-50"
              >
                {loading ? "جارٍ الفتح…" : "فتح الملف"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">افتح الملف في:</p>

            {error && (
              <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {options.map((o) => (
                <button
                  key={o.slot}
                  disabled={loading}
                  onClick={() => openAs(o.slot as Slot)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                >
                  {o.slot === "check"
                    ? <CheckCircle2 size={20} className="shrink-0 text-primary" />
                    : <ListFilter size={20} className="shrink-0 text-primary" />}
                  <div>
                    <p className="text-sm font-bold text-ink">{o.label}</p>
                    <p className="text-xs text-muted">{o.hint}</p>
                  </div>
                </button>
              ))}
            </div>

            {loading && (
              <p className="mt-3 text-center text-xs text-muted">
                جارٍ قراءة الملف…{progressRows > 0 && <> اتقرا {n(progressRows)} صف</>}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
