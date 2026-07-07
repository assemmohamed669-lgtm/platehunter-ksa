import { describe, it, expect, beforeEach } from "vitest";
import {
  hasLockPassword,
  setLockPassword,
  verifyLockPassword,
  clearLockPassword,
  changeLockPassword,
} from "@/lib/fieldCheckLock";

describe("fieldCheckLock", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reports no password before one is set", () => {
    expect(hasLockPassword()).toBe(false);
  });

  it("stores a password and reports it exists", () => {
    setLockPassword("1234");
    expect(hasLockPassword()).toBe(true);
  });

  it("never persists the raw password (only a digest)", () => {
    setLockPassword("1234");
    const dump = JSON.stringify(localStorage);
    expect(dump).not.toContain("1234");
  });

  it("verifies the correct password", () => {
    setLockPassword("1234");
    expect(verifyLockPassword("1234")).toBe(true);
  });

  it("rejects a wrong password", () => {
    setLockPassword("1234");
    expect(verifyLockPassword("0000")).toBe(false);
  });

  it("verify returns false when no password is set", () => {
    expect(verifyLockPassword("anything")).toBe(false);
  });

  it("treats a blank password as unset", () => {
    setLockPassword("   ");
    expect(hasLockPassword()).toBe(false);
  });

  it("ignores surrounding whitespace when verifying", () => {
    setLockPassword("1234");
    expect(verifyLockPassword("  1234  ")).toBe(true);
  });

  it("clearLockPassword removes the password", () => {
    setLockPassword("1234");
    clearLockPassword();
    expect(hasLockPassword()).toBe(false);
  });

  describe("changeLockPassword", () => {
    it("changes the password when the current one is correct", () => {
      setLockPassword("1234");
      expect(changeLockPassword("1234", "5678")).toBe(true);
      expect(verifyLockPassword("5678")).toBe(true);
      expect(verifyLockPassword("1234")).toBe(false);
    });

    it("refuses to change when the current password is wrong", () => {
      setLockPassword("1234");
      expect(changeLockPassword("0000", "5678")).toBe(false);
      expect(verifyLockPassword("1234")).toBe(true);
      expect(verifyLockPassword("5678")).toBe(false);
    });

    it("sets a first password when none exists yet", () => {
      expect(changeLockPassword("", "5678")).toBe(true);
      expect(verifyLockPassword("5678")).toBe(true);
    });

    it("rejects a blank new password", () => {
      setLockPassword("1234");
      expect(changeLockPassword("1234", "  ")).toBe(false);
      expect(verifyLockPassword("1234")).toBe(true);
    });
  });
});
