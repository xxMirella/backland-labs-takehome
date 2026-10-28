// Shared plumbing for the API integration tests. Must NOT import @app/db or @app/backend at module level:
// the test file sets DATABASE_URL (via prepareTempDb) before those are loaded.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const TMP_DIR = "/tmp/claude-1000/-home-mirella-projetos-backland-labs-takehome/669f5c4c-1610-4d1f-9ce2-d27bcd9f5607/scratchpad/api-tests";

export const NOW = "2026-10-27T12:00:00Z";
export const ADMIN_EMAIL = "admin@test.dev";

/** Fresh SQLite file with the real migrations applied. Never touches packages/db/prisma/dev.db. */
export function prepareTempDb(name: string) {
  mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `${name}-${process.pid}-${Date.now()}.db`);
  const url = `file:${file}`;
  process.env.DATABASE_URL = url;
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.OPENROUTER_API_KEY = ""; // AI off unless a test turns it on
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.join(ROOT, "packages/db"),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
    timeout: 120_000,
  });
  return { file, url };
}

export function removeTempDb(file: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
}

// ---- next/headers + next/server stand-ins -------------------------------------------------------

/** The cookies the next request "carries"; Browser.call() swaps in the calling browser's cookies. */
export const activeJar: { current: Record<string, string> } = { current: {} };

export const nextHeadersMock = () => ({
  cookies: async () => ({
    get: (name: string) => (name in activeJar.current ? { name, value: activeJar.current[name] } : undefined),
  }),
});

/** Callbacks handed to after(); tests run them on demand. */
export const scheduled: Array<() => unknown> = [];
export const runScheduled = async () => {
  const jobs = scheduled.splice(0);
  for (const job of jobs) await job();
};

// ---- a tiny browser: remembers cookies from Set-Cookie, like the real thing -------------------------

export class Browser {
  cookies: Record<string, string> = {};
  lastSetCookie: string[] = [];

  async call<A extends unknown[]>(handler: (req: Request, ...a: A) => Promise<Response>, req: Request, ...rest: A) {
    activeJar.current = { ...this.cookies };
    const res = await handler(req, ...rest);
    this.lastSetCookie = res.headers.getSetCookie();
    for (const header of this.lastSetCookie) {
      const [pair, ...attrs] = header.split(";").map((p) => p.trim());
      const eq = pair!.indexOf("=");
      const name = pair!.slice(0, eq);
      const value = pair!.slice(eq + 1);
      const expired = attrs.some((a) => /^max-age=0$/i.test(a)) || value === "";
      if (expired) delete this.cookies[name];
      else this.cookies[name] = value;
    }
    return res;
  }
}

// ---- requests ---------------------------------------------------------------------------------

let ipCounter = 0;
/** A new client IP per request: the rate limiters are module-level state shared by all tests. */
export const nextIp = () => `10.${(++ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;

export function jsonRequest(
  method: "POST" | "PATCH" | "GET",
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json", host: "localhost:3000", "x-forwarded-for": nextIp(), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

let emailCounter = 0;
export const uniqueEmail = (prefix = "user") => `${prefix}${++emailCounter}@test.dev`;

export const project = (over: Record<string, unknown> = {}) => ({
  title: "Booking app",
  description: "A booking app for my yoga studio.",
  budget: 25000,
  timeline: "2026-12-30",
  industry: "Wellness",
  ...over,
});

export const registration = (over: Record<string, unknown> = {}) => ({
  name: "Ana Silva",
  email: uniqueEmail("ana"),
  company: "Acme Inc.",
  password: "correct horse battery",
  ...project(),
  ...over,
});

/** An OpenRouter-style chat completion carrying `analysis` as the model's JSON answer. */
export const llmReply = (analysis: unknown) => ({
  ok: true,
  status: 200,
  text: async () => "",
  json: async () => ({ choices: [{ message: { content: JSON.stringify(analysis) } }] }),
});

export const sampleAnalysis = (over: Record<string, unknown> = {}) => ({
  tags: ["backend"],
  risks: [
    { type: "budget", severity: "medium", message: "The budget is tight for this scope." },
    { type: "missing_info", severity: "low", message: "Payment provider not specified." },
  ],
  summary: "A booking system for a yoga studio.",
  keyPoints: ["Ask which payment provider they use."],
  priority: "normal",
  priorityReason: "",
  ...over,
});

export const CUSTOMER_KEYS = ["budget", "createdAt", "description", "id", "industry", "timeline", "title"];
export const PRIVATE_KEYS = ["tags", "risks", "summary", "keyPoints", "priority", "priorityReason", "passwordHash", "userId"];
