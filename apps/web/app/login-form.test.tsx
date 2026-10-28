// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

const email = () => screen.getByLabelText(/email/i);
const password = () => screen.getByLabelText(/password/i);
const submit = () => userEvent.click(screen.getByRole("button", { name: /log in/i }));

describe("LoginForm", () => {
  it("masks the password and uses the right autocomplete hints", () => {
    render(<LoginForm />);
    expect(password()).toHaveAttribute("type", "password");
    expect(password()).toHaveAttribute("autocomplete", "current-password");
    expect(email()).toHaveAttribute("autocomplete", "email");
  });

  it("warns about both fields when empty and sends nothing", async () => {
    render(<LoginForm />);
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please enter your email")).toBeInTheDocument();
    expect(screen.getByText("Please enter your password")).toBeInTheDocument();
    expect(email()).toHaveFocus();
  });

  it("rejects a malformed email", async () => {
    render(<LoginForm />);
    await userEvent.type(email(), "not-an-email");
    await userEvent.type(password(), "whatever");
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/email doesn't look right/i)).toBeInTheDocument();
  });

  it("clears a warning once the user fixes the field", async () => {
    render(<LoginForm />);
    await submit();
    await userEvent.type(email(), "ana@acme.com");
    expect(screen.queryByText("Please enter your email")).not.toBeInTheDocument();
  });

  it("posts the credentials and refreshes the page on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    render(<LoginForm />);
    await userEvent.type(email(), "ana@acme.com");
    await userEvent.type(password(), "correct horse");
    await submit();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "ana@acme.com", password: "correct horse" }) }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows one generic message for wrong credentials, clears the password and refocuses it", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    render(<LoginForm />);
    await userEvent.type(email(), "ana@acme.com");
    await userEvent.type(password(), "wrong password");
    await submit();

    expect(await screen.findByText("Wrong email or password.")).toBeInTheDocument();
    expect(password()).toHaveValue("");
    expect(password()).toHaveFocus();
    expect(email()).toHaveValue("ana@acme.com");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("explains rate limiting", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    render(<LoginForm />);
    await userEvent.type(email(), "ana@acme.com");
    await userEvent.type(password(), "x");
    await submit();
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });

  it("shows a friendly message when the network fails and lets the user retry", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginForm />);
    await userEvent.type(email(), "ana@acme.com");
    await userEvent.type(password(), "x");
    await submit();

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeEnabled();
  });
});
