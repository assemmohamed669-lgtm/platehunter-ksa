/**
 * 🧮 تصدير المجمّع في قناص (١٦ أكتوبر ٢٠٢٦).
 *
 * المعمل بينزّل الملف بـ`<a download href="blob:…">` (`exportEntriesToExcel`) — جوّه
 * تطبيق الموبايل ده مابيعملش أي حاجة. فنفس الملف بالظبط (`buildEntriesXlsxBlob` ونفس
 * صفوف CSV) بيروح لفتح/مشاركة الإكسيل بتوع التطبيق (`@/lib/excel`): على الموبايل
 * بيفتح في برنامج الإكسيل أو شاشة المشاركة، وفي المتصفّح بينزل عادي.
 */
import * as XLSX from "xlsx";
import { buildEntriesXlsxBlob, buildExportRows, type PlateEntry } from "./plateEntry";
import type { BankSheet } from "./bankSheet";

type OnError = (message: string) => void;

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function csvBlob(entries: PlateEntry[], sheet: BankSheet | null): Blob {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(buildExportRows(entries, sheet)));
  return new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
}

async function run(what: string, onError: OnError, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    onError(`${what}: ${(err as Error)?.message ?? err}`);
  }
}

export async function openEntriesExcel(entries: PlateEntry[], sheet: BankSheet | null, label: string, onError: OnError): Promise<void> {
  await run("تصدير Excel", onError, async () => {
    const { openExcelBlob } = await import("@/lib/excel");
    await openExcelBlob(buildEntriesXlsxBlob(entries, sheet), `${label}_${stamp()}.xlsx`);
  });
}

export async function openEntriesCsv(entries: PlateEntry[], sheet: BankSheet | null, label: string, onError: OnError): Promise<void> {
  await run("تصدير CSV", onError, async () => {
    const { openExcelBlob } = await import("@/lib/excel");
    await openExcelBlob(csvBlob(entries, sheet), `${label}_${stamp()}.csv`);
  });
}

export async function shareEntriesExcel(entries: PlateEntry[], sheet: BankSheet | null, label: string, onError: OnError): Promise<void> {
  await run("مشاركة Excel", onError, async () => {
    const { shareExcelBlob } = await import("@/lib/excel");
    await shareExcelBlob(buildEntriesXlsxBlob(entries, sheet), `${label}_${stamp()}.xlsx`, "لوحات المجمّع");
  });
}
