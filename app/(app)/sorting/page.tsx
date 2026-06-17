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
  const