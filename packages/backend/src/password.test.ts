import { describe, expect, it } from "vitest";
import { getDummyHash, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("never stores the password and salts every hash differently", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(a).not.toContain("same password");
    expect(a).toMatch(/^scrypt\$32768\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it("treats spaces and unicode as part of the password", async () => {
    const hash = await hashPassword("  pässwörd 🔑  ");
    expect(await verifyPassword("  pässwörd 🔑  ", hash)).toBe(true);
    expect(await verifyPassword("pässwörd 🔑", hash)).toBe(false);
  });

  it("normalises equivalent unicode forms (é typed two ways)", async () => {
    const hash = await hashPassword("café-password");
    expect(await verifyPassword("café-password", hash)).toBe(true);
  });

  it.each(["", "plaintext", "bcrypt$10$abc$def", "scrypt$abc$salt$key", "scrypt$32768$$", "scrypt$99999999999$c2FsdA==$a2V5"])(
    "returns false for the malformed stored hash %j instead of throwing",
    async (stored) => {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    },
  );

  it("provides a dummy hash that never matches a guess", async () => {
    const dummy = await getDummyHash();
    expect(dummy).toMatch(/^scrypt\$/);
    expect(await verifyPassword("password", dummy)).toBe(false);
    expect(await getDummyHash()).toBe(dummy); // computed once
  });
});
