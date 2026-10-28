import { beforeEach, describe, expect, it, vi } from "vitest";
import { backend, cookieJar, json } from "../../../lib/test-backend";

vi.mock("@app/backend", async () => (await import("../../../lib/test-backend")).backend);
vi.mock("next/server", async () => (await import("../../../lib/test-backend")).nextServerMock());
vi.mock("next/headers", async () => (await import("../../../lib/test-backend")).nextHeadersMock());

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(cookieJar)) delete cookieJar[k];
});

describe("POST /api/logout", () => {
  it("deletes the session server-side and clears the cookie", async () => {
    cookieJar.session = "raw-token";
    const res = await POST(json("/api/logout", {}));

    expect(res.status).toBe(200);
    expect(backend.destroySession).toHaveBeenCalledWith("raw-token");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("is harmless when nobody is signed in", async () => {
    const res = await POST(json("/api/logout", {}));
    expect(res.status).toBe(200);
    expect(backend.destroySession).toHaveBeenCalledWith(undefined);
  });

  it("rejects cross-site requests so another site can't log users out", async () => {
    const res = await POST(json("/api/logout", {}, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(backend.destroySession).not.toHaveBeenCalled();
  });
});
