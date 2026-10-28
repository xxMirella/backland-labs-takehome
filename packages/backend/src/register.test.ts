import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ registerUser: vi.fn(), createSession: vi.fn() }));
const intakes = vi.hoisted(() => ({ createIntake: vi.fn() }));
vi.mock("./auth", () => auth);
vi.mock("./intakes", () => intakes);

import { registerWithIntake } from "./register";

const input = {
  name: "Ana",
  email: "ana@acme.com",
  company: "Acme",
  password: "correct horse",
  title: "CRM",
  description: "Build a CRM for clinics.",
  budget: 25000,
  timeline: "2026-12-01",
  industry: "Healthcare",
};

beforeEach(() => vi.resetAllMocks());

describe("registerWithIntake", () => {
  it("creates the account, a session and an intake owned by the new user", async () => {
    auth.registerUser.mockResolvedValue({ id: "u1", email: "ana@acme.com" });
    auth.createSession.mockResolvedValue({ token: "t", expiresAt: new Date() });
    intakes.createIntake.mockResolvedValue({ id: "i1" });

    const result = await registerWithIntake(input);

    expect(auth.registerUser).toHaveBeenCalledWith({ name: "Ana", email: "ana@acme.com", company: "Acme", password: "correct horse" });
    expect(auth.createSession).toHaveBeenCalledWith("u1");
    expect(intakes.createIntake).toHaveBeenCalledWith(expect.not.objectContaining({ password: expect.anything() }), "u1");
    expect(result.intake).toEqual({ id: "i1" });
  });

  it("never passes the password on to the intake or the AI", async () => {
    auth.registerUser.mockResolvedValue({ id: "u1", email: "ana@acme.com" });
    auth.createSession.mockResolvedValue({ token: "t", expiresAt: new Date() });
    intakes.createIntake.mockResolvedValue({});

    await registerWithIntake(input);

    expect(JSON.stringify(intakes.createIntake.mock.calls[0])).not.toContain("correct horse");
  });

  it("stops before creating a session or intake when the email is taken", async () => {
    auth.registerUser.mockRejectedValue(new Error("taken"));
    await expect(registerWithIntake(input)).rejects.toThrow("taken");
    expect(auth.createSession).not.toHaveBeenCalled();
    expect(intakes.createIntake).not.toHaveBeenCalled();
  });
});
