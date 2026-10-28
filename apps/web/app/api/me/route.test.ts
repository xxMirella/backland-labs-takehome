import { beforeEach, describe, expect, it, vi } from "vitest";
import { backend, cookieJar } from "../../../lib/test-backend";

vi.mock("@app/backend", async () => (await import("../../../lib/test-backend")).backend);
vi.mock("next/server", async () => (await import("../../../lib/test-backend")).nextServerMock());
vi.mock("next/headers", async () => (await import("../../../lib/test-backend")).nextHeadersMock());

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(cookieJar)) delete cookieJar[k];
});

describe("GET /api/me", () => {
  it("returns the signed-in user", async () => {
    cookieJar.session = "raw-token";
    backend.getSessionUser.mockResolvedValue({ id: "u1", name: "Ana", email: "ana@acme.com", company: "Acme", isAdmin: false });
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe("ana@acme.com");
  });

  it("returns 401 when there is no valid session", async () => {
    backend.getSessionUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
