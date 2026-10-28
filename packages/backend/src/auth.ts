import { createHash, randomBytes } from "node:crypto";
import { prisma, Prisma, type User } from "@app/db";
import type { SessionUserDto } from "./contract";
import { getDummyHash, hashPassword, verifyPassword } from "./password";

export const SESSION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists");
  }
}
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Wrong email or password");
  }
}

/** Team members are configured by email in ADMIN_EMAILS (comma-separated). */
export function isAdmin(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

export const toSessionUser = (user: Pick<User, "id" | "name" | "email" | "company">): SessionUserDto => ({
  id: user.id,
  name: user.name,
  email: user.email,
  company: user.company,
  isAdmin: isAdmin(user.email),
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function registerUser(input: { name: string; email: string; company: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new EmailTakenError();
  try {
    return await prisma.user.create({
      data: { name: input.name, email, company: input.company, passwordHash: await hashPassword(input.password) },
    });
  } catch (error) {
    // Two simultaneous registrations for the same email: the unique index decides.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new EmailTakenError();
    throw error;
  }
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Always run one scrypt verification so response time doesn't reveal which emails have accounts.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw new InvalidCredentialsError();
  return user;
}

/** The raw token only ever lives in the cookie; the database keeps its SHA-256. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<SessionUserDto | null> {
  if (!token) return null;
  const id = hashToken(token);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }
  return toSessionUser(session.user);
}

export async function destroySession(token: string | undefined) {
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}
