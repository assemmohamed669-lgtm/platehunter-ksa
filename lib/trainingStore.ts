/**
 * تخزين داتا تدريب الصوت — قاعدة IndexedDB **منفصلة** ("platehunter_training")
 * معزولة تماماً عن قاعدة التطبيق الأساسية (صفر خطر على اللي شغّال).
 *
 * بنخزّن حاجتين:
 *  • sessions: صوت الجلسة الكامل (مرة واحدة) — base64 + mimeType.
 *  • samples: كل لوحة متجمّعة — plate + tier + توقيتها (startMs/endMs) نسبةً للجلسة.
 * التقطيع لكل لوحة بيتعمل offline وقت تجهيز التدريب (بتوقيتات Deepgram الدقيقة).
 */

const DB_NAME = "platehunter_training";
const DB_VERSION = 1;
const SAMPLES = "samples";
const SESSIONS = "sessions";

export interface TrainingSample {
  id: string;         // uid
  sessionId: string;  // يربط بصوت الجلسة
  plate: string;      // اللوحة الصح (المطبّعة)
  tier: "gold" | "trusted";
  reason: string;
  startMs: number;    // بداية اللوحة في صوت الجلسة (من توقيت Deepgram)
  endMs: number;
  agentId: string;
  createdAt: string;
  synced: boolean;
}

export interface TrainingSession {
  sessionId: string;
  audioBase64: string;
  mimeType: string;
  agentId: string;
  createdAt: string;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-indexeddb")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAMPLES)) {
        const s = db.createObjectStore(SAMPLES, { keyPath: "id" });
        s.createIndex("synced", "synced");
        s.createIndex("sessionId", "sessionId");
      }
      if (!db.objectStoreNames.contains(SESSIONS)) {
        const s = db.createObjectStore(SESSIONS, { keyPath: "sessionId" });
        s.createIndex("synced", "synced");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTrainingSample(sample: TrainingSample): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(SAMPLES, "readwrite");
    tx.objectStore(SAMPLES).put(sample);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function saveTrainingSession(session: TrainingSession): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(SESSIONS, "readwrite");
    tx.objectStore(SESSIONS).put(session);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** يعيد كل الجلسات + العيّنات لحالة «غير متزامنة» — عشان إعادة رفع كاملة (إصلاح
 * حالات اتعلّمت مرفوعة غلط بنسخة قديمة). بيرجّع عدد اللي اترجّع. */
export async function forceResyncAll(): Promise<{ sessions: number; samples: number }> {
  const db = await openDB();
  const [sessions, samples] = await Promise.all([
    new Promise<TrainingSession[]>((res, rej) => { const r = db.transaction(SESSIONS, "readonly").objectStore(SESSIONS).getAll(); r.onsuccess = () => res(r.result as TrainingSession[]); r.onerror = () => rej(r.error); }),
    new Promise<TrainingSample[]>((res, rej) => { const r = db.transaction(SAMPLES, "readonly").objectStore(SAMPLES).getAll(); r.onsuccess = () => res(r.result as TrainingSample[]); r.onerror = () => rej(r.error); }),
  ]);
  await new Promise<void>((res, rej) => {
    const tx = db.transaction([SESSIONS, SAMPLES], "readwrite");
    for (const s of sessions) tx.objectStore(SESSIONS).put({ ...s, synced: false });
    for (const s of samples) tx.objectStore(SAMPLES).put({ ...s, synced: false });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  return { sessions: sessions.length, samples: samples.length };
}

export async function countTrainingSamples(): Promise<number> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(SAMPLES, "readonly");
    const req = tx.objectStore(SAMPLES).count();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/** عدد المتجمّع النهاردة (createdAt اليوم). للعدّاد الظاهر. */
export async function countTrainingToday(): Promise<number> {
  const db = await openDB();
  const today = new Date().toISOString().slice(0, 10);
  return new Promise((res, rej) => {
    const tx = db.transaction(SAMPLES, "readonly");
    const req = tx.objectStore(SAMPLES).getAll();
    req.onsuccess = () => res((req.result as TrainingSample[]).filter((s) => (s.createdAt || "").slice(0, 10) === today).length);
    req.onerror = () => rej(req.error);
  });
}

export async function getRecentTrainingSamples(limit = 10): Promise<TrainingSample[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(SAMPLES, "readonly");
    const req = tx.objectStore(SAMPLES).getAll();
    req.onsuccess = () => {
      const all = (req.result as TrainingSample[]).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      res(all.slice(0, limit));
    };
    req.onerror = () => rej(req.error);
  });
}

export async function getUnsyncedSamples(): Promise<TrainingSample[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(SAMPLES, "readonly");
    const req = tx.objectStore(SAMPLES).getAll();
    req.onsuccess = () => res((req.result as TrainingSample[]).filter((s) => !s.synced));
    req.onerror = () => rej(req.error);
  });
}

export async function getTrainingSession(sessionId: string): Promise<TrainingSession | undefined> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(SESSIONS, "readonly");
    const req = tx.objectStore(SESSIONS).get(sessionId);
    req.onsuccess = () => res(req.result as TrainingSession | undefined);
    req.onerror = () => rej(req.error);
  });
}

/** كل العيّنات (لتنزيل الداتاسِت). */
export async function getAllTrainingSamples(): Promise<TrainingSample[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(SAMPLES, "readonly");
    const req = tx.objectStore(SAMPLES).getAll();
    req.onsuccess = () => res(req.result as TrainingSample[]);
    req.onerror = () => rej(req.error);
  });
}

/** كل الجلسات بصوتها (لتنزيل الداتاسِت). */
export async function getAllTrainingSessions(): Promise<TrainingSession[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(SESSIONS, "readonly");
    const req = tx.objectStore(SESSIONS).getAll();
    req.onsuccess = () => res(req.result as TrainingSession[]);
    req.onerror = () => rej(req.error);
  });
}

/** يمسح كل داتا التدريب المحلية (بعد التنزيل). */
export async function clearTrainingData(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction([SAMPLES, SESSIONS], "readwrite");
    tx.objectStore(SAMPLES).clear();
    tx.objectStore(SESSIONS).clear();
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
