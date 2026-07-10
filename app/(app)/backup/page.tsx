"use client";

import { useEffect, useState } from "react";
import { Lock, Download, Share2, FileSpreadsheet, Mic, Keyboard, ShieldCheck } from "lucide-react";
import { getUploadedFile, getAllFieldCheckEntries, type FieldCheckEntry } from "@/lib/idb";
import { buildExcelBlob, openExcelBlob, shareExcelBlob } from "@/lib/excel";

const LS_BACKUP_PIN_HASH = "ph:backup:pinHash";

async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fieldEntriesToRows(entries: FieldCheckEntry[]): Record<string, unknown>[] {
  return entries.map((e) => ({
    "رقم اللوحة": e.plate,
    ...e.row,
    "الحالة": e.method,
    "GPS": e.mapsLink ?? "",
    "التاريخ": e.checkedAt,
  }));
}

export default function BackupPage() {
  // ── PIN gate ──────────────────────────────────────────────────────────────
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinLoaded, setPinLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinInput2, setPinInput2] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // ── Data ────────────────────────────────────────────────────────────────
  const [dataFile, setDataFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [voiceCount, setVoiceCount] = useState(0);
  const [manualCount, setManualCount] = useState(0);
  const [voiceEntries, setVoiceEntries] = useState<FieldCheckEntry[]>([]);
  const [manualEntries, setManualEntries] = useState<FieldCheckEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setPinHash(localStorage.getItem(LS_BACKUP_PIN_HASH) || null);
    setPinLoaded(true);
  }, []);

  // Load backup sources once the delegate unlocks the page.
  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      try {
        const rec = await getUploadedFile("local", "data");
        if (rec) {
          const blob = rec.fileBlob ?? buildExcelBlob(rec.rows, "الداتا");
          const name = rec.fileName || "شيت-الداتا.xlsx";
          setDataFile({ blob, name });
        }
      } catch { /* no data file */ }
      try {
        const all = await getAllFieldCheckEntries();
        const voice = all.filter((e) => e.method === "متشيكة بالصوت");
        const manual = all.filter((e) => e.method === "متشيكة يدوي");
        setVoiceEntries(voice); setVoiceCount(voice.length);
        setManualEntries(manual); setManualCount(manual.length);
      } catch { /* no field sheet */ }
    })();
  }, [unlocked]);

  async function createPin() {
    const pin = pinInput.trim();
    if (pin.length < 4) { setPinError("الرقم السري لازم يكون 4 أرقام على الأقل."); return; }
    if (pin !== pinInput2.trim()) { setPinError("الرقمين مش متطابقين."); return; }
    const hash = await hashPin(pin);
    localStorage.setItem(LS_BACKUP_PIN_HASH, hash);
    setPinHash(hash);
    setPinInput(""); setPinInput2(""); setPinError(null);
    setUnlocked(true);
  }

  async function verifyPin() {
    const pin = pinInput.trim();
    const hash = await hashPin(pin);
    if (hash !== pinHash) { setPinError("الرقم السري غلط."); return; }
    setPinInput(""); setPinError(null);
    setUnlocked(true);
  }

  // ── Excel actions ─────────────────────────────────────────────────────────
  async function doOpen(key: string, blob: Blob, name: string) {
    setBusy(`open:${key}`);
    try { await openExcelBlob(blob, name); }
    catch (err: any) { alert(err?.message ?? "تعذّر فتح الملف"); }
    finally { setBusy(null); }
  }

  async function doShare(key: string, blob: Blob, name: string, title: string) {
    setBusy(`share:${key}`);
    try { await shareExcelBlob(blob, name, title); }
    catch (err: any) { alert(err?.message ?? "تعذّرت المشاركة"); }
    finally { setBusy(null); }
  }

  // ── Render: PIN gate ──────────────────────────────────────────────────────
  if (!pinLoaded) return null;

  if (!unlocked) {
    const firstTime = !pinHash;
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 pt-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15">
          <Lock size={26} className="text-brand" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-ink">النسخة الاحتياطية</h1>
          <p className="mt-1 text-xs text-muted">
            {firstTime ? "أنشئ رقم سري لحماية النسخ الاحتياطية." : "اكتب الرقم السري علشان تفتح الصفحة."}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <input
            type="password" inputMode="numeric" dir="ltr" autoFocus
            value={pinInput} onChange={(e) => { setPinInput(e.target.value); setPinError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !firstTime) verifyPin(); }}
            placeholder={firstTime ? "رقم سري جديد (4 أرقام+)" : "الرقم السري"}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-center text-lg tracking-widest text-ink placeholder:text-sm placeholder:tracking-normal focus:border-primary focus:outline-none"
          />
          {firstTime && (
            <input
              type="password" inputMode="numeric" dir="ltr"
              value={pinInput2} onChange={(e) => { setPinInput2(e.target.value); setPinError(null); }}
              placeholder="أعد كتابة الرقم السري"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-center text-lg tracking-widest text-ink placeholder:text-sm placeholder:tracking-normal focus:border-primary focus:outline-none"
            />
          )}
          {pinError && <p className="text-center text-xs text-danger">{pinError}</p>}
          <button
            onClick={firstTime ? createPin : verifyPin}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-night transition active:scale-95"
          >
            <ShieldCheck size={16} /> {firstTime ? "تعيين وفتح" : "فتح"}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: backup sections ───────────────────────────────────────────────
  const sections: {
    key: string; title: string; icon: any; count: number | null;
    blob: Blob | null; name: string; shareTitle: string; empty: string;
  }[] = [
    {
      key: "data", title: "شيت الداتا", icon: FileSpreadsheet,
      count: null,
      blob: dataFile?.blob ?? null, name: dataFile?.name ?? "شيت-الداتا.xlsx",
      shareTitle: "شيت الداتا", empty: "مفيش ملف داتا مرفوع في مربع الداتا.",
    },
    {
      key: "voice", title: "شيت التسجيلات — صوتي", icon: Mic,
      count: voiceCount,
      blob: voiceCount > 0 ? buildExcelBlob(fieldEntriesToRows(voiceEntries), "تسجيلات صوتي") : null,
      name: `نسخة-التسجيلات-صوتي-${voiceCount}.xlsx`,
      shareTitle: "شيت التسجيلات الصوتي", empty: "مفيش سيارات متشيكة بالصوت لسه.",
    },
    {
      key: "manual", title: "شيت التسجيلات — يدوي", icon: Keyboard,
      count: manualCount,
      blob: manualCount > 0 ? buildExcelBlob(fieldEntriesToRows(manualEntries), "تسجيلات يدوي") : null,
      name: `نسخة-التسجيلات-يدوي-${manualCount}.xlsx`,
      shareTitle: "شيت التسجيلات اليدوي", empty: "مفيش سيارات متشيكة يدوي لسه.",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} className="text-brand" />
        <div>
          <h1 className="text-lg font-bold text-ink">النسخة الاحتياطية</h1>
          <p className="text-xs text-muted">نسخة من كل شيت — افتحها في Excel أو شاركها على واتساب.</p>
        </div>
      </div>

      {sections.map((s) => {
        const Icon = s.icon;
        const has = !!s.blob;
        return (
          <div key={s.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <Icon size={18} className="text-brand shrink-0" />
              <span className="text-sm font-bold text-ink">{s.title}</span>
              {s.count !== null && (
                <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-brand">{s.count}</span>
              )}
            </div>
            {has ? (
              <div className="flex gap-2">
                <button
                  onClick={() => doOpen(s.key, s.blob!, s.name)}
                  disabled={busy === `open:${s.key}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-ink transition hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <Download size={16} /> {busy === `open:${s.key}` ? "..." : "فتح الشيت"}
                </button>
                <button
                  onClick={() => doShare(s.key, s.blob!, s.name, s.shareTitle)}
                  disabled={busy === `share:${s.key}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-50"
                >
                  <Share2 size={16} /> {busy === `share:${s.key}` ? "..." : "مشاركة واتساب"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">{s.empty}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
