/**
 * IndexedDB wrapper for PlateHunter KSA — offline-first storage.
 * Stores audio blobs, GPS data, plate text, and sync status.
 * No external dependency needed — uses raw IDB API.
 */

const DB_NAME = "platehunter";
const DB_VERSION = 1;
const STORE = "recordings";

export interface RecordingEntry {
  localId: string;           // uuid generated locally
  agentId: string;           // Supabase auth user id
  plate: string;             // joined, no spaces e.g. أبح1234
  vehicleType?: string;      // ونيت / فان / دباب / مصدومة
  lat?: number;
  lng?: number;
  street?: string;
  district?: string;
  recordedAt: string;        // ISO timestamp
  audioBlobBase64?: string;  // base64 encoded audio
  mapsLink?: string;
  synced: boolean;
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
