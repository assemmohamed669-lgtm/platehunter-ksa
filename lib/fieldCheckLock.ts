/**
 * fieldCheckLock — offline password gate for the field-check sheet.
 *
 * The field-check sheet (شيت التشييك الميداني) must survive app restarts and
 * updates, and must never be cleared/changed without the delegate's password.
 * This module owns that password. It works fully offline: only a lightweight,
 * non-cryptographic digest is stored in localStorage — the raw password is
 * never persisted. This is a field-work deterrent against casual deletion,
 * not bank-grade security.
 */

const PW_KEY = "ph:fieldcheck:pwhash";

// cyrb53 — small, fast, deterministic string hash. Returns a hex digest.
function hashPassword(pw: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < pw.length; i++) {
    const ch = pw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function readStored(): string | null {
  try {
    return localStorage.getItem(PW_KEY);
  } catch {
    return null;
  }
}

/** True when a protecting password has been set. */
export function hasLockPassword(): boolean {
  return !!readStored();
}

/**
 * Set (or overwrite) the protecting password. A blank/whitespace value
 * clears the password. Prefer changeLockPassword() for user-facing changes,
 * which requires the current password first.
 */
export function setLockPassword(pw: string): void {
  const p = pw.trim();
  try {
    if (!p) {
      localStorage.removeItem(PW_KEY);
      return;
    }
    localStorage.setItem(PW_KEY, hashPassword(p));
  } catch {
    /* storage unavailable */
  }
}

/** True when `pw` matches the stored password. Always false if none is set. */
export function verifyLockPassword(pw: string): boolean {
  const stored = readStored();
  if (!stored) return false;
  return hashPassword(pw.trim()) === stored;
}

/** Remove the password entirely. */
export function clearLockPassword(): void {
  try {
    localStorage.removeItem(PW_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Change the password: requires the current one to be correct (unless none is
 * set yet). Refuses a blank new password. Returns true on success.
 */
export function changeLockPassword(currentPw: string, newPw: string): boolean {
  if (hasLockPassword() && !verifyLockPassword(currentPw)) return false;
  if (!newPw.trim()) return false;
  setLockPassword(newPw);
  return true;
}

/**
 * Force-set a new password WITHOUT knowing the current one. This bypasses the
 * lock and MUST only be called after an out-of-band authorization (e.g. the
 * admin/secondary password verified against the server) — it exists so a
 * delegate who forgets the password isn't locked out forever. Refuses a blank
 * new password. Returns true on success.
 */
export function resetLockPassword(newPw: string): boolean {
  if (!newPw.trim()) return false;
  setLockPassword(newPw);
  return true;
}
