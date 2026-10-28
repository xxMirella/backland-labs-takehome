// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthPanel } from "./auth-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

describe("AuthPanel", () => {
  it("starts on the submit-a-project tab, which also explains it creates an account", () => {
    render(<AuthPanel />);
    expect(screen.getByRole("tab", { name: /submit a project/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/project title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getAllByText(/creates your account/i).length).toBeGreaterThan(0);
  });

  it("switches to the login form and back", async () => {
    render(<AuthPanel />);
    await userEvent.click(screen.getByRole("tab", { name: /i have an account/i }));

    expect(screen.getByRole("tab", { name: /i have an account/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /^log in$/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/project title/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /submit a project/i }));
    expect(screen.getByLabelText(/project title/i)).toBeInTheDocument();
  });
});
