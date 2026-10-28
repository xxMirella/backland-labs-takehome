// Integration tests: real route handlers + real services + real SQLite (migrated from the real migrations).
// Only two Next.js runtime pieces are replaced: `cookies()` (a per-"browser" cookie jar) and `after()` (collected, run on demand).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Runs before every import below, so @app/db sees the temp DATABASE_URL.
const tmp = await vi.hoisted(async () => (await import("./helpers")).prepareTempDb("intakes"));

vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock());
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  const { scheduled } = await import("./helpers");
  return {
    ...actual,
    after: (job: () => unknown) => {
      scheduled.push(job);
    },
  };
});

import { prisma } from "@app/db";
import { POST as loginPOST } from "../../apps/web/app/api/login/route";
import { GET, POST as createPOST } from "../../apps/web/app/api/intakes/route";
import { PATCH } from "../../apps/web/app/api/intakes/[id]/route";
import { POST as registerPOST } from "../../apps/web/app/api/register/route";
import {
  ADMIN_EMAIL,
  Browser,
  CUSTOMER_KEYS,
  NOW,
  PRIVATE_KEYS,
  jsonRequest,
  llmReply,
  project,
  registration,
  removeTempDb,
  runScheduled,
  sampleAnalysis,
  scheduled,
  uniqueEmail,
} from "./helpers";

// ---- tiny API client over the handlers ---------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const read = async (res: Response): Promise<Json> => res.json();

async function signUp(over: Record<string, unknown> = {}) {
  const browser = new Browser();
  const body = registration(over);
  const res = await browser.call(registerPOST, jsonRequest("POST", "/api/register", body));
  return { browser, body, res, json: await read(res.clone()) };
}
const createIntake = async (b: Browser, over: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
  const res = await b.call(createPOST, jsonRequest("POST", "/api/intakes", project(over), headers));
  return { res, json: await read(res.clone()) };
};
const listIntakes = async (b: Browser) => {
  const res = await b.call(GET, jsonRequest("GET", "/api/intakes"));
  return { res, json: (await read(res.clone())) as Json };
};
const editIntake = async (b: Browser, id: string, body: unknown, headers: Record<string, string> = {}) => {
  const res = await b.call(PATCH, jsonRequest("PATCH", `/api/intakes/${id}`, body, headers), { params: Promise.resolve({ id }) });
  return { res, json: await read(res.clone()) };
};
const dbIntake = (id: string) => prisma.intake.findUniqueOrThrow({ where: { id } });
/** createdAt comes from the DB engine, not the faked JS clock: pin it so priority maths is deterministic. */
const pin = (id: string, iso = NOW) => prisma.intake.update({ where: { id }, data: { createdAt: new Date(iso) } });
/** An intake created before accounts existed: no owner. */
const legacyIntake = () =>
  prisma.intake.create({
    data: {
      name: "Legacy",
      email: "legacy@old.dev",
      company: "Old",
      title: "Legacy project",
      description: "Created before accounts existed.",
      budget: 5000,
      timeline: new Date("2026-12-01T00:00:00Z"),
      industry: "Manufacturing",
    },
  });
const keys = (o: object) => Object.keys(o).sort();
const day = (d: Date) => d.toISOString().slice(0, 10);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  scheduled.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await prisma.intake.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
  removeTempDb(tmp.file);
});

// ================================================================================================
describe("CREATE: POST /api/register", () => {
  it("creates the account and the first intake, signs the user in, and stores them for real", async () => {
    const { browser, res, json } = await signUp({ email: "Ana.Upper@TEST.dev", name: "Ana Silva", company: "Acme Inc." });

    expect(res.status).toBe(201);
    expect(json.user).toMatchObject({ email: "ana.upper@test.dev", name: "Ana Silva", company: "Acme Inc.", isAdmin: false });
    expect(keys(json.user)).toEqual(["company", "email", "id", "isAdmin", "name"]);

    const cookie = browser.lastSetCookie[0]!;
    expect(cookie).toMatch(/^session=[A-Za-z0-9_-]{40,}/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//i);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ana.upper@test.dev" } });
    expect(user).toMatchObject({ name: "Ana Silva", company: "Acme Inc." });
    expect(user.passwordHash).toMatch(/^scrypt\$32768\$/);
    expect(user.passwordHash).not.toContain("correct horse battery");

    const row = await dbIntake(json.intake.id);
    expect(row).toMatchObject({
      userId: user.id,
      name: "Ana Silva",
      email: "ana.upper@test.dev",
      company: "Acme Inc.",
      title: "Booking app",
      budget: 25000,
      industry: "Wellness",
    });
    expect(day(row.timeline)).toBe("2026-12-30");

    // the cookie holds a random token; the DB holds only its SHA-256
    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.userId).toBe(user.id);
    expect(sessions[0]!.id).toMatch(/^[0-9a-f]{64}$/);
    expect(cookie).not.toContain(sessions[0]!.id);
  });

  it("returns only the customer fields for the intake: nothing the AI or team derive, no hashes", async () => {
    const { res, json } = await signUp();
    const text = await res.clone().text();

    expect(keys(json.intake)).toEqual(CUSTOMER_KEYS);
    for (const secret of PRIVATE_KEYS) expect(text).not.toContain(`"${secret}"`);
    expect(text).not.toContain("scrypt");
    expect(text).not.toContain("correct horse battery");
  });

  it("trims whitespace before saving", async () => {
    const { json } = await signUp({
      name: "  Ana Silva  ",
      company: "  Acme  ",
      title: "  Booking app  ",
      description: "   A booking app for my studio.   ",
      industry: "  Wellness ",
    });
    const row = await dbIntake(json.intake.id);
    expect(row).toMatchObject({ name: "Ana Silva", company: "Acme", title: "Booking app", industry: "Wellness" });
    expect(row.description).toBe("A booking app for my studio.");
  });

  it("schedules exactly one analysis, and does not run it before responding", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "key");
    const fetchMock = vi.fn(async () => llmReply(sampleAnalysis()));
    vi.stubGlobal("fetch", fetchMock);

    await signUp();

    expect(scheduled).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 409 for an email that already has an account (any letter case) and creates nothing more", async () => {
    const first = await signUp({ email: "dup@test.dev" });
    scheduled.length = 0;

    const second = await signUp({ email: "DUP@test.dev", title: "Second try" });

    expect(second.res.status).toBe(409);
    expect(second.json.error.fieldErrors.email[0]).toMatch(/already exists/i);
    expect(second.browser.lastSetCookie).toHaveLength(0);
    expect(scheduled).toHaveLength(0);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.intake.count()).toBe(1);
    expect((await prisma.intake.findMany())[0]!.id).toBe(first.json.intake.id);
  });

  const farFuture = "2040-01-01";
  it.each([
    ["blank title", { title: "" }, "title", "Please give your project a title"],
    ["whitespace title", { title: "   " }, "title", "Please give your project a title"],
    ["2-character title", { title: "ab" }, "title", /too short/],
    ["201-character title", { title: "a".repeat(201) }, "title", /under 200/],
    ["blank description", { description: "" }, "description", "Please describe your project"],
    ["9-character description", { description: "too short" }, "description", /too short/],
    ["budget 0", { budget: 0 }, "budget", "Budget must be greater than $0"],
    ["negative budget", { budget: -5 }, "budget", "Budget must be greater than $0"],
    ["fractional budget", { budget: 10.5 }, "budget", "Please enter a whole dollar amount"],
    ["string budget", { budget: "5000" }, "budget", "Please enter your budget"],
    ["missing budget", { budget: undefined }, "budget", "Please enter your budget"],
    ["budget over the maximum", { budget: 2_000_000_000 }, "budget", /can't exceed/],
    ["past delivery date", { timeline: "2026-10-01" }, "timeline", "Delivery date can't be in the past"],
    ["delivery date over 10 years away", { timeline: farFuture }, "timeline", /within the next 10 years/],
    ["non-date timeline", { timeline: "tomorrow" }, "timeline", "Please enter a valid date"],
    ["impossible calendar date", { timeline: "2026-02-30" }, "timeline", "Please enter a valid date"],
    ["missing timeline", { timeline: undefined }, "timeline", "Please choose a delivery date"],
    ["blank industry", { industry: "  " }, "industry", "Please tell us your industry"],
    ["malformed email", { email: "nope" }, "email", /doesn't look right/],
    ["blank email", { email: "" }, "email", "Please enter your email"],
    ["1-character name", { name: "A" }, "name", /too short/],
    ["blank company", { company: "  " }, "company", "Please tell us your company"],
    ["7-character password", { password: "1234567" }, "password", /at least 8/],
    ["missing password", { password: undefined }, "password", "Please choose a password"],
  ])("rejects %s with 400 on the right field and creates nothing", async (_name, over, field, message) => {
    const { res, json } = await signUp(over);

    expect(res.status).toBe(400);
    const got = json.error.fieldErrors[field as string]?.[0];
    expect(got).toBeDefined();
    typeof message === "string" ? expect(got).toBe(message) : expect(got).toMatch(message);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.intake.count()).toBe(0);
    expect(scheduled).toHaveLength(0);
  });

  it("reports every invalid field at once", async () => {
    const { json } = await signUp({ title: "", description: "", budget: 0, timeline: "x", industry: "", email: "x", password: "" });
    expect(keys(json.error.fieldErrors)).toEqual(["budget", "description", "email", "industry", "password", "timeline", "title"]);
  });

  it("rejects a body that isn't JSON (400) and cross-origin requests (403)", async () => {
    const b = new Browser();
    expect((await b.call(registerPOST, jsonRequest("POST", "/api/register", "not json {"))).status).toBe(400);
    const cross = await b.call(registerPOST, jsonRequest("POST", "/api/register", registration(), { origin: "https://evil.example" }));
    expect(cross.status).toBe(403);
    expect(await prisma.user.count()).toBe(0);
  });
});

// ================================================================================================
describe("CREATE: POST /api/intakes", () => {
  it("needs a session: 401 and nothing saved or scheduled", async () => {
    const { res } = await createIntake(new Browser());
    expect(res.status).toBe(401);
    expect(await prisma.intake.count()).toBe(0);
    expect(scheduled).toHaveLength(0);
  });

  it("treats a forged session cookie as signed out", async () => {
    const stranger = new Browser();
    stranger.cookies.session = "forged-token";
    expect((await createIntake(stranger)).res.status).toBe(401);
  });

  it("creates the intake for the signed-in user and returns only the customer fields", async () => {
    const { browser, json: reg } = await signUp({ name: "Ana Silva", company: "Acme Inc." });
    scheduled.length = 0;

    const { res, json } = await createIntake(browser, { title: "Second project" });

    expect(res.status).toBe(201);
    expect(keys(json)).toEqual(CUSTOMER_KEYS);
    expect(json).toMatchObject({ title: "Second project", budget: 25000, timeline: "2026-12-30", industry: "Wellness" });
    const row = await dbIntake(json.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: reg.user.email } });
    expect(row.userId).toBe(user.id);
    expect(await prisma.intake.count({ where: { userId: user.id } })).toBe(2);
  });

  it("takes identity from the session and ignores name/email/company/userId/priority/tags sent in the body", async () => {
    const victim = await signUp({ email: uniqueEmail("victim") });
    const { browser, json: reg } = await signUp({ name: "Ana Silva", company: "Acme Inc.", email: "ana.real@test.dev" });

    const { res, json } = await createIntake(browser, {
      name: "Mallory",
      email: "mallory@test.dev",
      company: "Evil Corp",
      userId: victim.json.user.id,
      priority: "urgent",
      priorityReason: "pwned",
      tags: ["hacked"],
      risks: [{ type: "risk", severity: "high", message: "x" }],
    });

    expect(res.status).toBe(201);
    const row = await dbIntake(json.id);
    expect(row).toMatchObject({ name: "Ana Silva", email: "ana.real@test.dev", company: "Acme Inc.", userId: reg.user.id });
    expect(row.priority).toBe("normal"); // far deadline: the rule decides, not the body
    expect(row.priorityReason).toBeNull();
    expect(row.tags).toEqual([]);
    expect(row.risks).toEqual([]);
  });

  it("never exposes AI, priority or owner fields in the response", async () => {
    const { browser } = await signUp();
    const { res, json } = await createIntake(browser);
    const text = await res.clone().text();
    expect(keys(json)).toEqual(CUSTOMER_KEYS);
    for (const secret of PRIVATE_KEYS) expect(text).not.toContain(`"${secret}"`);
  });

  it.each([
    ["2026-10-27", "urgent", "Delivery date is 0 days after submission."],
    ["2026-10-28", "urgent", "Delivery date is 1 day after submission."],
    ["2026-11-10", "urgent", "Delivery date is 14 days after submission."],
    ["2026-11-11", "normal", null],
    ["2027-03-01", "normal", null],
  ])("stores priority from the deadline: %s is %s", async (timeline, priority, reason) => {
    const { browser } = await signUp();
    const { json } = await createIntake(browser, { timeline });
    const row = await dbIntake(json.id);
    expect(row.priority).toBe(priority);
    expect(row.priorityReason).toBe(reason);
  });

  it("schedules one analysis per created intake and none for rejected ones", async () => {
    const { browser } = await signUp();
    expect(scheduled).toHaveLength(1);
    await createIntake(browser, { title: "Second" });
    await createIntake(browser, { title: "Third" });
    expect(scheduled).toHaveLength(3);
    await createIntake(browser, { title: "" });
    expect(scheduled).toHaveLength(3);
  });

  it("trims and validates like registration, saving nothing on failure", async () => {
    const { browser } = await signUp();
    const ok = await createIntake(browser, { title: "  Padded title  ", industry: " Retail " });
    expect(await dbIntake(ok.json.id)).toMatchObject({ title: "Padded title", industry: "Retail" });

    const before = await prisma.intake.count();
    for (const [over, field] of [
      [{ title: "" }, "title"],
      [{ title: "ab" }, "title"],
      [{ description: "short" }, "description"],
      [{ budget: 0 }, "budget"],
      [{ budget: "5000" }, "budget"],
      [{ budget: 99.5 }, "budget"],
      [{ timeline: "2026-10-01" }, "timeline"],
      [{ timeline: "2040-01-01" }, "timeline"],
      [{ industry: "" }, "industry"],
    ] as const) {
      const { res, json } = await createIntake(browser, over);
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(Object.keys(json.error.fieldErrors), JSON.stringify(over)).toContain(field);
    }
    expect(await prisma.intake.count()).toBe(before);
  });

  it("rejects cross-origin (403) and non-JSON bodies (400)", async () => {
    const { browser } = await signUp();
    const before = await prisma.intake.count();

    expect((await createIntake(browser, {}, { origin: "https://evil.example" })).res.status).toBe(403);
    const bad = await browser.call(createPOST, jsonRequest("POST", "/api/intakes", "{broken"));
    expect(bad.status).toBe(400);
    expect(await prisma.intake.count()).toBe(before);
  });

  it("accepts a same-origin browser request", async () => {
    const { browser } = await signUp();
    expect((await createIntake(browser, {}, { origin: "http://localhost:3000" })).res.status).toBe(201);
  });
});

// ================================================================================================
describe("sessions: POST /api/login", () => {
  it("lets a registered user back in from a new browser and then list their intakes", async () => {
    const { body, json: reg } = await signUp({ email: "again@test.dev" });
    const fresh = new Browser();

    const wrong = await fresh.call(loginPOST, jsonRequest("POST", "/api/login", { email: "again@test.dev", password: "not the password" }));
    expect(wrong.status).toBe(401);
    expect((await listIntakes(fresh)).res.status).toBe(401);

    const ok = await fresh.call(loginPOST, jsonRequest("POST", "/api/login", { email: "AGAIN@test.dev", password: body.password }));
    expect(ok.status).toBe(200);
    expect(fresh.lastSetCookie[0]).toMatch(/HttpOnly/i);
    const { json } = await listIntakes(fresh);
    expect(json.map((i: Json) => i.id)).toEqual([reg.intake.id]);
  });
});

// ================================================================================================
describe("LIST: GET /api/intakes", () => {
  it("is 401 for anonymous visitors and for forged cookies", async () => {
    await signUp();
    expect((await listIntakes(new Browser())).res.status).toBe(401);
    const forged = new Browser();
    forged.cookies.session = "forged";
    expect((await listIntakes(forged)).res.status).toBe(401);
  });

  it("returns an empty array for a user without intakes", async () => {
    const { browser } = await signUp();
    await prisma.intake.deleteMany();
    const { res, json } = await listIntakes(browser);
    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it("shows a customer only their own intakes, newest first, with exactly the customer fields", async () => {
    const a = await signUp({ title: "A first" });
    const second = await createIntake(a.browser, { title: "A second" });
    const third = await createIntake(a.browser, { title: "A third" });
    await pin(a.json.intake.id, "2026-10-25T10:00:00Z");
    await pin(second.json.id, "2026-10-26T10:00:00Z");
    await pin(third.json.id, "2026-10-27T10:00:00Z");

    const { res, json } = await listIntakes(a.browser);

    expect(res.status).toBe(200);
    expect(json.map((i: Json) => i.title)).toEqual(["A third", "A second", "A first"]);
    for (const item of json) expect(keys(item)).toEqual(CUSTOMER_KEYS);
    expect(JSON.stringify(json)).not.toMatch(/passwordHash|"email"|"name"|"company"/);
  });

  it("keeps customers apart: B cannot see A's intakes and vice versa", async () => {
    const a = await signUp({ title: "A's secret project" });
    const b = await signUp({ title: "B's project" });

    const asB = (await listIntakes(b.browser)).json;
    const asA = (await listIntakes(a.browser)).json;

    expect(asB.map((i: Json) => i.title)).toEqual(["B's project"]);
    expect(asA.map((i: Json) => i.title)).toEqual(["A's secret project"]);
    expect(JSON.stringify(asB)).not.toContain("A's secret project");
  });

  it("does not show a customer legacy intakes that have no owner", async () => {
    await legacyIntake();
    const { browser } = await signUp({ title: "Mine" });
    expect((await listIntakes(browser)).json.map((i: Json) => i.title)).toEqual(["Mine"]);
  });

  it("shows the team everything, newest first, including legacy intakes, with the analysis fields", async () => {
    const legacy = await legacyIntake();
    const a = await signUp({ title: "A project" });
    const b = await signUp({ title: "B project" });
    const admin = await signUp({ email: ADMIN_EMAIL, title: "Admin project" });
    expect(admin.json.user.isAdmin).toBe(true);
    await pin(legacy.id, "2026-10-20T10:00:00Z");
    await pin(a.json.intake.id, "2026-10-24T10:00:00Z");
    await pin(b.json.intake.id, "2026-10-26T10:00:00Z");
    await pin(admin.json.intake.id, "2026-10-27T09:00:00Z");

    const { res, json } = await listIntakes(admin.browser);

    expect(res.status).toBe(200);
    expect(json.map((i: Json) => i.title)).toEqual(["Admin project", "B project", "A project", "Legacy project"]);
    expect(keys(json[0])).toEqual(
      [...CUSTOMER_KEYS, "company", "email", "keyPoints", "name", "priority", "priorityReason", "risks", "summary", "tags"].sort(),
    );
    expect(json[3]).toMatchObject({ name: "Legacy", email: "legacy@old.dev", industry: "Manufacturing", tags: [], risks: [], summary: null, priority: "normal" });
  });

  it("after the scheduled analysis runs, the team sees it and the customer still sees nothing of it", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn(async () =>
      llmReply(sampleAnalysis({ tags: ["Backend"], priority: "urgent", priorityReason: "Studio opens next week." })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const customer = await signUp({ title: "Booking app", email: "ana.ai@test.dev", name: "Ana Silva", company: "Acme Inc." });
    expect(fetchMock).not.toHaveBeenCalled();

    await runScheduled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(String(init.body)).toContain("Booking app");
    for (const personal of ["ana.ai@test.dev", "Ana Silva", "Acme Inc.", "correct horse battery"]) {
      expect(String(init.body)).not.toContain(personal); // identity never reaches the model
    }

    const admin = await signUp({ email: ADMIN_EMAIL, title: "Admin's own" });
    const team = (await listIntakes(admin.browser)).json.find((i: Json) => i.title === "Booking app");
    expect(team).toMatchObject({
      tags: ["backend"],
      summary: "A booking system for a yoga studio.",
      keyPoints: ["Ask which payment provider they use."],
      priority: "urgent",
      priorityReason: "Studio opens next week.",
    });
    expect(team.risks).toHaveLength(2);

    const mine = (await listIntakes(customer.browser)).json;
    expect(mine).toHaveLength(1);
    expect(keys(mine[0])).toEqual(CUSTOMER_KEYS);
    expect(JSON.stringify(mine)).not.toMatch(/"tags"|"risks"|"summary"|"keyPoints"|"priority"|A booking system for a yoga studio|payment provider|Studio opens|backend/);
  });

  it("leaves the intake intact when the analysis fails (429), and the customer still sees it", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => "quota exceeded" })));
    const customer = await signUp({ title: "Survives failure", timeline: "2026-12-30" });

    await expect(runScheduled()).resolves.toBeUndefined();

    const row = await dbIntake(customer.json.intake.id);
    expect(row).toMatchObject({ title: "Survives failure", tags: [], risks: [], summary: null, priority: "normal" });
    expect((await listIntakes(customer.browser)).json.map((i: Json) => i.title)).toEqual(["Survives failure"]);
  });

  it("keeps the deadline-based priority when the AI gives a priority that isn't valid", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => llmReply(sampleAnalysis({ priority: "ASAP!!!" }))));
    const customer = await signUp({ timeline: "2026-10-30" }); // 3 days: urgent by rule

    await runScheduled();

    const row = await dbIntake(customer.json.intake.id);
    expect(row.priority).toBe("urgent");
    expect(row.tags).toEqual(["backend"]); // the rest of the analysis was still stored
  });
});

// ================================================================================================
describe("EDIT: PATCH /api/intakes/[id]", () => {
  const edited = { title: "New title", description: "A different, longer description.", budget: 42000, timeline: "2027-03-15", industry: "Retail" };

  async function owned(over: Record<string, unknown> = {}) {
    const s = await signUp(over);
    await pin(s.json.intake.id);
    scheduled.length = 0;
    return { ...s, id: s.json.intake.id as string };
  }

  it("lets the owner change all five project fields and returns only the customer fields", async () => {
    const { browser, id } = await owned({ name: "Ana Silva", email: "ana.edit@test.dev", company: "Acme Inc." });
    const before = await dbIntake(id);

    const { res, json } = await editIntake(browser, id, edited);

    expect(res.status).toBe(200);
    expect(keys(json)).toEqual(CUSTOMER_KEYS);
    expect(json).toMatchObject({ id, ...edited });
    const after = await dbIntake(id);
    expect(after).toMatchObject({ title: edited.title, description: edited.description, budget: 42000, industry: "Retail" });
    expect(day(after.timeline)).toBe("2027-03-15");
    expect(after).toMatchObject({ id, userId: before.userId, name: before.name, email: before.email, company: before.company });
    expect(after.createdAt.toISOString()).toBe(before.createdAt.toISOString());
    expect((await listIntakes(browser)).json[0]).toMatchObject(edited);
  });

  it("trims whitespace on edit", async () => {
    const { browser, id } = await owned();
    await editIntake(browser, id, { ...edited, title: "  Padded  ", industry: "  Retail  " });
    expect(await dbIntake(id)).toMatchObject({ title: "Padded", industry: "Retail" });
  });

  it.each([
    ["empty body", {}, ["budget", "description", "industry", "timeline", "title"]],
    ["only a title (needs all fields)", { title: "Just a title" }, ["budget", "description", "industry", "timeline"]],
    ["blank title", { ...edited, title: "" }, ["title"]],
    ["short title", { ...edited, title: "ab" }, ["title"]],
    ["short description", { ...edited, description: "short" }, ["description"]],
    ["zero budget", { ...edited, budget: 0 }, ["budget"]],
    ["string budget", { ...edited, budget: "42000" }, ["budget"]],
    ["fractional budget", { ...edited, budget: 1.5 }, ["budget"]],
    ["garbage date", { ...edited, timeline: "nope" }, ["timeline"]],
    ["date over 10 years", { ...edited, timeline: "2040-01-01" }, ["timeline"]],
    ["blank industry", { ...edited, industry: " " }, ["industry"]],
  ])("rejects %s with 400 field errors and changes nothing", async (_n, body, fields) => {
    const { browser, id } = await owned({ title: "Original title" });
    const before = await dbIntake(id);

    const { res, json } = await editIntake(browser, id, body);

    expect(res.status).toBe(400);
    expect(keys(json.error.fieldErrors)).toEqual(fields);
    expect(await dbIntake(id)).toEqual(before);
    expect(scheduled).toHaveLength(0);
  });

  it("rejects a body that isn't JSON (400)", async () => {
    const { browser, id } = await owned();
    const res = await browser.call(PATCH, jsonRequest("PATCH", `/api/intakes/${id}`, "{nope"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(400);
  });

  it("answers 404 for someone else's intake and leaves it untouched", async () => {
    const owner = await owned({ title: "Owner's project" });
    const other = await signUp({ title: "Other's project" });
    scheduled.length = 0; // signing up the second user queued its own analysis
    const before = await dbIntake(owner.id);

    const { res, json } = await editIntake(other.browser, owner.id, edited);

    expect(res.status).toBe(404);
    expect(json.error.formErrors).toEqual(["Intake not found"]);
    expect(await dbIntake(owner.id)).toEqual(before);
    expect(scheduled).toHaveLength(0);
  });

  it("answers a missing id exactly like someone else's id, so ids can't be probed", async () => {
    const owner = await owned();
    const other = await signUp();
    const foreign = await editIntake(other.browser, owner.id, edited);
    const missing = await editIntake(other.browser, "does-not-exist", edited);

    expect(missing.res.status).toBe(404);
    expect(missing.json).toEqual(foreign.json);
  });

  it("answers 404 for a legacy intake without an owner", async () => {
    const legacy = await legacyIntake();
    const { browser } = await signUp();
    expect((await editIntake(browser, legacy.id, edited)).res.status).toBe(404);
    expect((await dbIntake(legacy.id)).title).toBe("Legacy project");
  });

  it("does not let the team edit a customer's intake either (404)", async () => {
    const owner = await owned({ title: "Customer's project" });
    const admin = await signUp({ email: ADMIN_EMAIL });

    const { res } = await editIntake(admin.browser, owner.id, edited);

    expect(res.status).toBe(404);
    expect((await dbIntake(owner.id)).title).toBe("Customer's project");
  });

  it("requires a session (401) and rejects cross-origin requests (403), changing nothing", async () => {
    const { browser, id } = await owned();
    const before = await dbIntake(id);

    expect((await editIntake(new Browser(), id, edited)).res.status).toBe(401);
    expect((await editIntake(browser, id, edited, { origin: "https://evil.example" })).res.status).toBe(403);
    expect(await dbIntake(id)).toEqual(before);
  });

  it("ignores extra keys: owner, identity, priority, tags and timestamps cannot be changed through the body", async () => {
    const other = await signUp({ email: uniqueEmail("other") });
    const { browser, id } = await owned({ name: "Ana Silva", email: "ana.keys@test.dev", company: "Acme Inc." });
    const before = await dbIntake(id);

    const { res } = await editIntake(browser, id, {
      ...edited,
      id: "other-id",
      userId: other.json.user.id,
      name: "Mallory",
      email: "mallory@test.dev",
      company: "Evil Corp",
      priority: "urgent",
      priorityReason: "pwned",
      tags: ["hacked"],
      createdAt: "1999-01-01T00:00:00Z",
    });

    expect(res.status).toBe(200);
    const after = await dbIntake(id);
    expect(after).toMatchObject({ id, userId: before.userId, name: "Ana Silva", email: "ana.keys@test.dev", company: "Acme Inc." });
    expect(after.createdAt.toISOString()).toBe(before.createdAt.toISOString());
    expect(after.priority).toBe("normal"); // 2027 deadline: the rule decides
    expect(after.priorityReason).toBeNull();
    expect(after.tags).toEqual([]);
    expect(await prisma.intake.findUnique({ where: { id: "other-id" } })).toBeNull();
  });

  it("accepts an unchanged delivery date that has since passed, but rejects changing it to a past date", async () => {
    const { browser, id } = await owned({ timeline: "2026-10-28" });
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z")); // the session (7 days) is still valid; 10-28 is now in the past

    const unchanged = await editIntake(browser, id, { ...edited, timeline: "2026-10-28", title: "Edited after the date passed" });
    expect(unchanged.res.status).toBe(200);
    const row = await dbIntake(id);
    expect(row.title).toBe("Edited after the date passed");
    expect(day(row.timeline)).toBe("2026-10-28");

    const past = await editIntake(browser, id, { ...edited, timeline: "2026-10-30" });
    expect(past.res.status).toBe(400);
    expect(past.json).toEqual({ error: { fieldErrors: { timeline: ["Delivery date can't be in the past"] } } });
    expect(day((await dbIntake(id)).timeline)).toBe("2026-10-28");

    const future = await editIntake(browser, id, { ...edited, timeline: "2026-11-20" });
    expect(future.res.status).toBe(200);
    expect(day((await dbIntake(id)).timeline)).toBe("2026-11-20");
  });

  it("recomputes priority from the new deadline: far to near flips to urgent, and back", async () => {
    const { browser, id } = await owned({ timeline: "2026-12-30" });
    expect((await dbIntake(id)).priority).toBe("normal");

    await editIntake(browser, id, { ...edited, timeline: "2026-11-05" }); // 9 days after submission
    expect(await dbIntake(id)).toMatchObject({ priority: "urgent", priorityReason: "Delivery date is 9 days after submission." });

    await editIntake(browser, id, { ...edited, timeline: "2026-12-30" });
    expect(await dbIntake(id)).toMatchObject({ priority: "normal", priorityReason: null });
  });

  it.each([
    ["2026-11-10", "urgent"],
    ["2026-11-11", "normal"],
  ])("uses the same 14-day boundary as creation: %s is %s", async (timeline, priority) => {
    const { browser, id } = await owned({ timeline: "2026-12-30" });
    await editIntake(browser, id, { ...edited, timeline });
    expect((await dbIntake(id)).priority).toBe(priority);
  });

  it("measures the deadline from the original submission date, not from the day of the edit", async () => {
    const { browser, id } = await owned({ timeline: "2026-12-30" });
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));

    await editIntake(browser, id, { ...edited, timeline: "2026-11-12" }); // 16 days after 10-27, 11 days after the edit

    expect((await dbIntake(id)).priority).toBe("normal");
  });

  it("schedules a re-analysis, and once it runs the team sees analysis of the new text", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const replies = [sampleAnalysis({ tags: ["backend"] }), sampleAnalysis({ tags: ["frontend"], summary: "Now a storefront redesign." })];
    const fetchMock = vi.fn(async () => llmReply(replies.shift()));
    vi.stubGlobal("fetch", fetchMock);
    const { browser, id } = await signUp({ title: "Booking app" }).then((s) => ({ ...s, id: s.json.intake.id as string }));
    await runScheduled(); // first analysis

    const { res } = await editIntake(browser, id, { ...edited, title: "Storefront redesign" });

    expect(res.status).toBe(200);
    expect(scheduled).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing new has run yet
    await runScheduled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)).toContain("Storefront redesign");

    const admin = await signUp({ email: ADMIN_EMAIL });
    const team = (await listIntakes(admin.browser)).json.find((i: Json) => i.id === id);
    expect(team).toMatchObject({ title: "Storefront redesign", tags: ["frontend"], summary: "Now a storefront redesign." });
  });

  it("does not schedule a re-analysis for a rejected edit", async () => {
    const { browser, id } = await owned();
    await editIntake(browser, id, { ...edited, title: "" });
    await editIntake(new Browser(), id, edited);
    expect(scheduled).toHaveLength(0);
  });

  it("keeps the earlier AI analysis in place until the new one finishes", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => llmReply(sampleAnalysis())));
    const { browser, id } = await signUp().then((s) => ({ ...s, id: s.json.intake.id as string }));
    await runScheduled();

    await editIntake(browser, id, edited);

    const row = await dbIntake(id);
    expect(row.tags).toEqual(["backend"]);
    expect(row.summary).toBe("A booking system for a yoga studio.");
  });
});

// ================================================================================================
describe("journey: register, create, list, edit, team view", () => {
  it("works end to end for one customer and one team member", async () => {
    // register: first intake
    const customer = await signUp({ title: "First project", name: "Ana Silva", company: "Acme Inc.", timeline: "2026-12-30" });
    expect(customer.res.status).toBe(201);
    const firstId = customer.json.intake.id as string;

    // list: just the one
    let mine = (await listIntakes(customer.browser)).json;
    expect(mine.map((i: Json) => i.title)).toEqual(["First project"]);

    // create a second
    const second = await createIntake(customer.browser, { title: "Second project", budget: 9000 });
    expect(second.res.status).toBe(201);
    await pin(firstId, "2026-10-26T10:00:00Z");
    await pin(second.json.id, "2026-10-27T10:00:00Z");

    // list: two, newest first
    mine = (await listIntakes(customer.browser)).json;
    expect(mine.map((i: Json) => i.title)).toEqual(["Second project", "First project"]);

    // edit the first
    const edit = await editIntake(customer.browser, firstId, {
      title: "First project (revised)",
      description: "Revised scope: bookings plus a waiting list.",
      budget: 31000,
      timeline: "2026-11-09",
      industry: "Wellness & Fitness",
    });
    expect(edit.res.status).toBe(200);

    // list shows the edit; order unchanged (edits don't touch createdAt); every item still customer-only
    mine = (await listIntakes(customer.browser)).json;
    expect(mine.map((i: Json) => i.title)).toEqual(["Second project", "First project (revised)"]);
    expect(mine[1]).toMatchObject({ budget: 31000, timeline: "2026-11-09", industry: "Wellness & Fitness" });
    for (const item of mine) expect(keys(item)).toEqual(CUSTOMER_KEYS);

    // team view: sees everything, with the derived fields (the edited one is urgent: 13 days after submission)
    const admin = await signUp({ email: ADMIN_EMAIL, title: "Team's own" });
    await pin(admin.json.intake.id, "2026-10-27T11:00:00Z");
    const all = (await listIntakes(admin.browser)).json;
    expect(all.map((i: Json) => i.title)).toEqual(["Team's own", "Second project", "First project (revised)"]);
    expect(all[2]).toMatchObject({ name: "Ana Silva", company: "Acme Inc.", priority: "urgent", tags: [], summary: null });

    // a second customer sees none of it
    const stranger = await signUp({ title: "Stranger's project" });
    expect((await listIntakes(stranger.browser)).json.map((i: Json) => i.title)).toEqual(["Stranger's project"]);
    expect((await editIntake(stranger.browser, firstId, { ...project() })).res.status).toBe(404);
  });
});
