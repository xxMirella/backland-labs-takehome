import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  session: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@app/db", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  return { prisma: db, Prisma: { PrismaClientKnownRequestError } };
});

import { Prisma } from "@app/db";
import {
  EmailTakenError,
  InvalidCredentialsError,
  SESSION_DAYS,
  authenticate,
  createSession,
  destroySession,
  getSessionUser,
  isAdmin,
  registerUser,
  toSessionUser,
} from "./auth";
import { hashPassword } from "./password";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const userRow = { id: "u1", name: "Ana", email: "ana@acme.com", company: "Acme", passwordHash: "" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});

describe("isAdmin", () => {
  it("matches emails from ADMIN_EMAILS case-insensitively and ignores spaces", () => {
    vi.stubEnv("ADMIN_EMAILS", " Boss@Acme.com , other@acme.com ");
    expect(isAdmin("boss@acme.com")).toBe(true);
    expect(isAdmin("OTHER@acme.com")).toBe(true);
    expect(isAdmin("ana@acme.com")).toBe(false);
  });

  it("nobody is an admin when the setting is empty or missing", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdmin("")).toBe(false);
    expect(isAdmin("boss@acme.com")).toBe(false);
  });
});

describe("registerUser", () => {
  it("stores a lower-cased email and a hash, never the password", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockImplementation(async ({ data }) => ({ id: "u1", ...data }));

    await registerUser({ name: "Ana", email: "  Ana@ACME.com ", company: "Acme", password: "correct horse" });

    const data = db.user.create.mock.calls[0]![0].data;
    expect(data.email).toBe("ana@acme.com");
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(data)).not.toContain("correct horse");
  });

  it("refuses an email that already has an account", async () => {
    db.user.findUnique.mockResolvedValue(userRow);
    await expect(registerUser({ name: "A", email: "ana@acme.com", company: "x", password: "12345678" })).rejects.toBeInstanceOf(
      EmailTakenError,
    );
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("turns a unique-constraint race into the same error", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002" } as never));
    await expect(registerUser({ name: "A", email: "ana@acme.com", company: "x", password: "12345678" })).rejects.toBeInstanceOf(
      EmailTakenError,
    );
  });

  it("lets other database errors through", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(new Error("disk full"));
    await expect(registerUser({ name: "A", email: "a@b.co", company: "x", password: "12345678" })).rejects.toThrow("disk full");
  });
});

describe("authenticate", () => {
  it("returns the user for the right password, matching the email in any case", async () => {
    db.user.findUnique.mockResolvedValue({ ...userRow, passwordHash: await hashPassword("correct horse") });
    const user = await authenticate(" ANA@acme.com ", "correct horse");
    expect(user.id).toBe("u1");
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: "ana@acme.com" } });
  });

  it("gives the same error for a wrong password and for an unknown email", async () => {
    db.user.findUnique.mockResolvedValueOnce({ ...userRow, passwordHash: await hashPassword("correct horse") });
    const wrongPassword = await authenticate("ana@acme.com", "nope nope nope").catch((e: unknown) => e);
    db.user.findUnique.mockResolvedValueOnce(null);
    const unknownEmail = await authenticate("ghost@acme.com", "correct horse").catch((e: unknown) => e);

    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
    expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
  });
});

describe("sessions", () => {
  it(`creates a ${SESSION_DAYS}-day session and stores only the token's hash`, async () => {
    db.session.create.mockResolvedValue({});
    const { token, expiresAt } = await createSession("u1");

    const data = db.session.create.mock.calls[0]![0].data;
    expect(data.id).toBe(sha(token));
    expect(data.id).not.toBe(token);
    expect(data.userId).toBe("u1");
    expect(expiresAt.toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bits, base64url
  });

  it("issues a different token every time", async () => {
    db.session.create.mockResolvedValue({});
    const a = await createSession("u1");
    const b = await createSession("u1");
    expect(a.token).not.toBe(b.token);
  });

  it("resolves a valid token to the user, with the admin flag", async () => {
    vi.stubEnv("ADMIN_EMAILS", "ana@acme.com");
    db.session.findUnique.mockResolvedValue({ expiresAt: new Date("2026-10-28T00:00:00Z"), user: userRow });

    const user = await getSessionUser("raw-token");

    expect(db.session.findUnique).toHaveBeenCalledWith({ where: { id: sha("raw-token") }, include: { user: true } });
    expect(user).toEqual({ id: "u1", name: "Ana", email: "ana@acme.com", company: "Acme", isAdmin: true });
    expect(JSON.stringify(user)).not.toContain("passwordHash");
  });

  it("returns null for a missing token or an unknown session without touching the database", async () => {
    expect(await getSessionUser(undefined)).toBeNull();
    expect(await getSessionUser("")).toBeNull();
    expect(db.session.findUnique).not.toHaveBeenCalled();

    db.session.findUnique.mockResolvedValue(null);
    expect(await getSessionUser("forged")).toBeNull();
  });

  it("rejects and deletes an expired session", async () => {
    db.session.findUnique.mockResolvedValue({ expiresAt: new Date("2026-10-27T11:59:59Z"), user: userRow });
    expect(await getSessionUser("old")).toBeNull();
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { id: sha("old") } });
  });

  it("destroys a session by token hash, and ignores a missing token", async () => {
    await destroySession("raw-token");
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { id: sha("raw-token") } });
    db.session.deleteMany.mockClear();
    await destroySession(undefined);
    expect(db.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe("toSessionUser", () => {
  it("exposes only safe fields", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(Object.keys(toSessionUser({ ...userRow })).sort()).toEqual(["company", "email", "id", "isAdmin", "name"]);
  });
});
