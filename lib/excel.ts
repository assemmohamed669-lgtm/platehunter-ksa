/**
 * Read a bank Excel file and return an array of raw plate strings.
 * Tries to auto-detect the column containing plate numbers.
 */
export function readBankExcel(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // استخراج البيانات كصفوف
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
        }) as any[][];

        // Flatten all cells and return non-empty strings
        const plates: string[] = [];
        for (const row of rows) {
          // التعديل هنا: التأكد من أن row هي مصفوفة قبل التكرار عليها
          if (Array.isArray(row)) {
            for (const cell of row) {
              const val = String(cell ?? "").trim();
              if (val && val.length >= 4) plates.push(val);
            }
          }
        }
        resolve(plates);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}