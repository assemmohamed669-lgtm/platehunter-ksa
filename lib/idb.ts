/**
 * IndexedDB wrapper for PlateHunter KSA — offline-first storage.
 * Stores audio blobs, GPS data, plate text, and sync status.
 * No external dependency needed — uses raw IDB API.
 */

const DB_NAME = "platehunter";
const DB_VERSION = 3; // v2 adds uploaded_files, v3 adds field_check (protected field-check sheet)
const STORE = "recordings";
const FILES_STORE = "uploaded_files";
const FIELD_CHECK_STORE = "field_check";

export interface RecordingEntry {
  localId: string;           // uuid generated locally
  agentId: string;           // Supabase auth user id
  plate: string;             // joined, no spaces e.g. أبح1234
  originalPlate?: string;    // raw value the recognizer produced, before any correction —
                             // kept so a later edit can teach the letter-confusion learner
  uncertain?: boolean;       // extraction wasn't confident (garbled/fallback/auto-corrected) —
                             // worth a quick glance; cleared once the user edits/confirms it
  rawLetterSource?: string;  // the raw garbled word / overflow letter-run behind an uncertain
                             // guess (MultiPlateResult.rawLetterSource) — kept so a later edit
                             // can teach the whole-fragment WordBlendMap learner
  vehicleType?: string;      // ونيت / فان / دباب / مصدومة
  lat?: number;
  lng?: number;
  street?: string;
  district?: string;
  recordedAt: string;        // ISO timestamp
  audioBlobBase64?: string;  // base64 encoded audio — the session's recording, shared across
                             // every plate saved from that session (same as GPS coords)
  audioMimeType?: string;    // MIME type of audioBlobBase64 — playback must use this, not a
                             // hardcoded guess (native records AAC, web records webm/mp4/etc.)
  mapsLink?: string;
  notes?: string;            // ملاحظات يدوية
  recorderName?: string;     // اسم المسجّل
  isManual?: boolean;        // true = إدخال يدوي، false/undefined = تسجيل صوتي
  synced: boolean;
}

/**
 * A file the agent uploaded into the Sorting module ("data" or
 * "referral" slot). Persisted so it survives refreshes/app restarts —
 * the agent only has to upload it once, and explicitly deletes it via
 * the trash icon when they're done with it.
 */
export interface UploadedFileRecord {
  key: string;                       // `${agentId}:${slot}`
  agentId: string;
  slot: "data" | "referral" | "check" | "tashyeek";
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  uploadedAt: string;
  fileBlob?: Blob;                   // original bytes, so "download" still works after a refresh
}

/**
 * One car that a delegate confirmed in the field and pushed onto the
 * protected field-check sheet ("شيت التشييك الميداني"). Persisted in IDB so
 * it survives app restarts/updates; only clearable via the password gate
 * (see lib/fieldCheckLock.ts). The `method` label records how it was checked
 * (e.g. "متشيكة بالكاميرا").
 */
export interface FieldCheckEntry {
  id: string;                        // unique, generated locally
  agentId?: string;                  // owner — so a shared device doesn't mix two agents' sheets
  plate: string;                     // the confirmed plate
  row: Record<string, string>;       // matched reference row (extra columns)
  method: string;                    // how it was checked, e.g. "متشيكة بالكاميرا"
  lat?: number;
  lng?: number;
  mapsLink?: string;
  checkedAt: string;                 // ISO timestamp
}

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "localId" });
        store.createIndex("synced", "synced", { unique: false });
        store.createIndex("agentId", "agentId", { unique: false });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const filesStore = db.createObjectStore(FILES_STORE, { keyPath: "key" });
        filesStore.createIndex("agentId", "agentId", { unique: false });
      }
      if (!db.objectStoreNames.contains(FIELD_CHECK_STORE)) {
        db.createObjectStore(FIELD_CHECK_STORE, { keyPath: "id" });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(entry: RecordingEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllRecordings(agentId: string): Promise<RecordingEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("agentId").getAll(agentId);
    req.onsuccess = () =>
      resolve(
        (req.result as RecordingEntry[]).sort(
          (a, b) =>
            new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
        )
      );
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingSync(agentId: string): Promise<RecordingEntry[]> {
  const all = await getAllRecordings(agentId);
  return all.filter((r) => !r.synced);
}

export async function markSynced(localId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(localId);
    req.onsuccess = () => {
      const entry = req.result as RecordingEntry;
      if (entry) {
        entry.synced = true;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRecording(localId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateNotes(localId: string, notes: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(localId);
    req.onsuccess = () => {
      const entry = req.result as RecordingEntry;
      if (entry) {
        entry.notes = notes;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updatePlate(localId: string, plate: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(localId);
    req.onsuccess = () => {
      const entry = req.result as RecordingEntry;
      if (entry) {
        entry.plate = plate;
        entry.uncertain = false; // a human looked at and confirmed this plate
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateRecordingField(
  localId: string,
  field: "vehicleType" | "notes",
  value: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(localId);
    req.onsuccess = () => {
      const entry = req.result as RecordingEntry;
      if (entry) {
        entry[field] = value;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateGeodata(
  localId: string,
  street: string,
  district: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(localId);
    req.onsuccess = () => {
      const entry = req.result as RecordingEntry;
      if (entry) {
        entry.street = street;
        entry.district = district;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =====================================================================
// Uploaded Sorting files (data/referral) — persisted until the agent
// explicitly deletes them via the trash icon.
// =====================================================================

export async function saveUploadedFile(record: UploadedFileRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readwrite");
    tx.objectStore(FILES_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getUploadedFile(
  agentId: string,
  slot: "data" | "referral" | "check" | "tashyeek"
): Promise<UploadedFileRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readonly");
    const req = tx.objectStore(FILES_STORE).get(`${agentId}:${slot}`);
    req.onsuccess = () => resolve((req.result as UploadedFileRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteUploadedFile(agentId: string, slot: "data" | "referral" | "check" | "tashyeek"): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readwrite");
    tx.objectStore(FILES_STORE).delete(`${agentId}:${slot}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =====================================================================
// Field-check sheet (شيت التشييك الميداني) — the protected, persistent
// record of cars confirmed in the field. Never auto-cleared; deletion is
// gated behind the password in lib/fieldCheckLock.ts at the UI layer.
// =====================================================================

/** Add or overwrite one field-check entry (put by id). */
export async function saveFieldCheckEntry(entry: FieldCheckEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FIELD_CHECK_STORE, "readwrite");
    tx.objectStore(FIELD_CHECK_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** All field-check entries, newest first. */
/**
 * All field-check entries, newest first. Pass `agentId` to get only the
 * current agent's rows (plus legacy rows saved before agent stamping) so two
 * agents sharing one device don't see/upload each other's sheet.
 */
export async function getAllFieldCheckEntries(agentId?: string): Promise<FieldCheckEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FIELD_CHECK_STORE, "readonly");
    const req = tx.objectStore(FIELD_CHECK_STORE).getAll();
    req.onsuccess = () => {
      let rows = req.result as FieldCheckEntry[];
      if (agentId) rows = rows.filter((e) => !e.agentId || e.agentId === agentId);
      resolve(rows.sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()));
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete one field-check entry by id. */
export async function deleteFieldCheckEntry(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FIELD_CHECK_STORE, "readwrite");
    tx.objectStore(FIELD_CHECK_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Wipe the entire field-check sheet. */
export async function clearFieldCheck(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FIELD_CHECK_STORE, "readwrite");
    tx.objectStore(FIELD_CHECK_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
