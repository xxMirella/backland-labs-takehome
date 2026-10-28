// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntakeForm } from "./intake-form";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  // Fixed clock (only Date is faked so user-event keeps working); the test TZ is UTC, see vitest.config.ts.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  fetchMock.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

const VALID = {
  name: "Ana Silva",
  email: "ana@acme.com",
  company: "Acme Inc.",
  password: "correct horse battery",
  title: "Booking app",
  description: "A booking app for my studio.",
  budget: "25000", // typed into the money mask
  timeline: "2026-12-01",
  industry: "Wellness",
};

const field = (label: RegExp) => screen.getByLabelText(label);
const submit = () => userEvent.click(screen.getByRole("button", { name: /send my project/i }));

async function fillValid(overrides: Partial<typeof VALID> = {}) {
  const v = { ...VALID, ...overrides };
  const user = userEvent.setup();
  await user.type(field(/your name/i), v.name);
  await user.type(field(/email/i), v.email);
  await user.type(field(/company/i), v.company);
  await user.type(field(/password/i), v.password);
  await user.type(field(/project title/i), v.title);
  await user.type(field(/what do you need/i), v.description);
  if (v.budget) await user.type(field(/budget/i), v.budget);
  if (v.timeline) fireEvent.change(field(/timeline/i), { target: { value: v.timeline } });
  await user.type(field(/industry/i), v.industry);
  return user;
}

describe("IntakeForm validation", () => {
  it("marks every field as required", () => {
    render(<IntakeForm />);
    for (const label of [/your name/i, /email/i, /company/i, /password/i, /project title/i, /what do you need/i, /budget/i, /timeline/i, /industry/i]) {
      expect(field(label).closest(".field")?.querySelector(".req")).toHaveTextContent("*");
    }
  });

  it("does not submit an empty form and warns about every field", async () => {
    render(<IntakeForm />);
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert")).toHaveLength(9);
    expect(screen.getByText("Please tell us your name")).toBeInTheDocument();
    expect(screen.getByText("Please enter your email")).toBeInTheDocument();
    expect(screen.getByText("Please tell us your company")).toBeInTheDocument();
    expect(screen.getByText("Please choose a password")).toBeInTheDocument();
    expect(screen.getByText("Please give your project a title")).toBeInTheDocument();
    expect(screen.getByText("Please describe your project")).toBeInTheDocument();
    expect(screen.getByText("Please enter your budget")).toBeInTheDocument();
    expect(screen.getByText("Please choose a delivery date")).toBeInTheDocument();
    expect(screen.getByText("Please tell us your industry")).toBeInTheDocument();
  });

  it("treats whitespace-only fields as blank", async () => {
    render(<IntakeForm />);
    const user = userEvent.setup();
    await user.type(field(/project title/i), "     ");
    await user.type(field(/what do you need/i), "          ");
    await user.type(field(/industry/i), "   ");
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please give your project a title")).toBeInTheDocument();
    expect(screen.getByText("Please describe your project")).toBeInTheDocument();
    expect(screen.getByText("Please tell us your industry")).toBeInTheDocument();
  });

  it("warns when the title is too short", async () => {
    render(<IntakeForm />);
    await fillValid({ title: "ab" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/title is too short/i)).toBeInTheDocument();
    expect(field(/project title/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("warns when the description is too short", async () => {
    render(<IntakeForm />);
    await fillValid({ description: "too short" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/description is too short/i)).toBeInTheDocument();
  });

  it("warns when no budget is entered", async () => {
    render(<IntakeForm />);
    await fillValid({ budget: "" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please enter your budget")).toBeInTheDocument();
    expect(screen.queryByText("Please choose a delivery date")).not.toBeInTheDocument();
  });

  it("treats a budget of 0 as not entered", async () => {
    render(<IntakeForm />);
    await fillValid({ budget: "0" });
    expect(field(/budget/i)).toHaveValue("");
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please enter your budget")).toBeInTheDocument();
  });

  it("warns when the budget is above the maximum", async () => {
    render(<IntakeForm />);
    await fillValid({ budget: "1000000001" });
    expect(field(/budget/i)).toHaveValue("$1,000,000,001");
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Budget can't exceed $1,000,000,000")).toBeInTheDocument();
  });

  it("warns when no delivery date is chosen", async () => {
    render(<IntakeForm />);
    await fillValid({ timeline: "" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please choose a delivery date")).toBeInTheDocument();
  });

  it("warns when the delivery date is in the past, including yesterday", async () => {
    render(<IntakeForm />);
    await fillValid({ timeline: "2026-10-20" });
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Delivery date can't be in the past")).toBeInTheDocument();
    expect(field(/timeline/i)).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(field(/timeline/i), { target: { value: "2026-10-26" } });
    expect(screen.getByText("Delivery date can't be in the past")).toBeInTheDocument();
  });

  it("accepts today as the delivery date", async () => {
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ ...VALID, budget: 25000, id: "1" }) });
    render(<IntakeForm />);
    await fillValid({ timeline: "2026-10-27" });
    await submit();

    await screen.findByText("Thank you!");
  });

  it("does not let the date picker go before today", () => {
    render(<IntakeForm />);
    expect(field(/timeline/i)).toHaveAttribute("type", "date");
    expect(field(/timeline/i)).toHaveAttribute("min", "2026-10-27");
  });
});

describe("IntakeForm budget mask", () => {
  it("formats the amount as dollars while typing", async () => {
    render(<IntakeForm />);
    const user = userEvent.setup();
    await user.type(field(/budget/i), "12500");
    expect(field(/budget/i)).toHaveValue("$12,500");
    await user.type(field(/budget/i), "0");
    expect(field(/budget/i)).toHaveValue("$125,000");
  });

  it("strips letters, symbols and decimals", async () => {
    render(<IntakeForm />);
    await userEvent.type(field(/budget/i), "a$1,2x3.5-");
    expect(field(/budget/i)).toHaveValue("$1,235");
  });

  it("drops leading zeros", async () => {
    render(<IntakeForm />);
    await userEvent.type(field(/budget/i), "007");
    expect(field(/budget/i)).toHaveValue("$7");
  });

  it("lets the user delete back to empty", async () => {
    render(<IntakeForm />);
    const user = userEvent.setup();
    await user.type(field(/budget/i), "12");
    await user.type(field(/budget/i), "{Backspace}{Backspace}");
    expect(field(/budget/i)).toHaveValue("");
  });

  it("uses a numeric keyboard on mobile", () => {
    render(<IntakeForm />);
    expect(field(/budget/i)).toHaveAttribute("inputmode", "numeric");
  });

  it("moves focus to the first invalid field", async () => {
    render(<IntakeForm />);
    const user = userEvent.setup();
    await user.type(field(/your name/i), VALID.name);
    await user.type(field(/email/i), VALID.email);
    await user.type(field(/company/i), VALID.company);
    await user.type(field(/password/i), VALID.password);
    await submit();
    expect(field(/project title/i)).toHaveFocus();
  });

  it("shows no errors before the first submit attempt", async () => {
    render(<IntakeForm />);
    await userEvent.type(field(/project title/i), "ab");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears a warning as soon as the user fixes the field", async () => {
    render(<IntakeForm />);
    const user = await fillValid({ title: "ab" });
    await submit();
    expect(screen.getByText(/title is too short/i)).toBeInTheDocument();

    await user.type(field(/project title/i), "c");
    expect(screen.queryByText(/title is too short/i)).not.toBeInTheDocument();
  });
});

describe("IntakeForm submitter fields", () => {
  it.each(["plainaddress", "ana@", "@acme.com", "ana@acme", "ana acme@x.com"])(
    "rejects the invalid email %s and does not submit",
    async (email) => {
      render(<IntakeForm />);
      await fillValid({ email });
      await submit();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText(/email doesn't look right/i)).toBeInTheDocument();
      expect(field(/email/i)).toHaveAttribute("aria-invalid", "true");
    },
  );

  it("warns when the name is too short", async () => {
    render(<IntakeForm />);
    await fillValid({ name: "A" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/name is too short/i)).toBeInTheDocument();
  });

  it("warns when the company is only whitespace", async () => {
    render(<IntakeForm />);
    const user = await fillValid({ company: "   " });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please tell us your company")).toBeInTheDocument();
    await user.type(field(/company/i), "x");
    expect(screen.queryByText("Please tell us your company")).not.toBeInTheDocument();
  });

  it("puts the submitter fields first and focuses the name when everything is empty", async () => {
    render(<IntakeForm />);
    await submit();
    expect(field(/your name/i)).toHaveFocus();
  });

  it("sends name, email and company with the payload", async () => {
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ ...VALID, id: "1", budget: 25000 }) });
    render(<IntakeForm />);
    await fillValid();
    await submit();

    await screen.findByText("Thank you!");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      name: "Ana Silva",
      email: "ana@acme.com",
      company: "Acme Inc.",
      password: "correct horse battery",
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/register");
  });
});

describe("IntakeForm password", () => {
  it("masks the password while typing", () => {
    render(<IntakeForm />);
    expect(field(/password/i)).toHaveAttribute("type", "password");
    expect(field(/password/i)).toHaveAttribute("autocomplete", "new-password");
  });

  it("warns when the password is too short and does not submit", async () => {
    render(<IntakeForm />);
    await fillValid({ password: "short" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/needs at least 8 characters/i)).toBeInTheDocument();
  });

  it("accepts a password of spaces-and-words and doesn't trim it", async () => {
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ intake: { title: "x" } }) });
    render(<IntakeForm />);
    await fillValid({ password: "  spaces matter  " });
    await submit();

    await screen.findByText("Thank you!");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).password).toBe("  spaces matter  ");
  });

  it("shows a login hint on the email field when the account already exists (409)", async () => {
    fetchMock.mockResolvedValue({ status: 409, json: async () => ({}) });
    render(<IntakeForm />);
    await fillValid();
    await submit();

    expect(await screen.findByText(/account with this email already exists/i)).toBeInTheDocument();
    expect(field(/email/i)).toHaveFocus();
    expect(field(/email/i)).toHaveAttribute("aria-invalid", "true");
    expect(field(/project title/i)).toHaveValue(VALID.title); // nothing typed is lost
  });

  it("explains rate limiting (429)", async () => {
    fetchMock.mockResolvedValue({ status: 429, json: async () => ({}) });
    render(<IntakeForm />);
    await fillValid();
    await submit();
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });
});

describe("IntakeForm for signed-in users (member mode)", () => {
  const fillProject = async () => {
    const user = userEvent.setup();
    await user.type(field(/project title/i), VALID.title);
    await user.type(field(/what do you need/i), VALID.description);
    await user.type(field(/budget/i), VALID.budget);
    fireEvent.change(field(/timeline/i), { target: { value: VALID.timeline } });
    await user.type(field(/industry/i), VALID.industry);
  };

  it("hides the account fields", () => {
    render(<IntakeForm mode="member" />);
    for (const label of [/your name/i, /email/i, /company/i, /password/i]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
  });

  it("validates only the project fields", async () => {
    render(<IntakeForm mode="member" />);
    await submit();
    expect(screen.getAllByRole("alert")).toHaveLength(5);
    expect(field(/project title/i)).toHaveFocus();
  });

  it("posts only project data to /api/intakes", async () => {
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ id: "1", title: VALID.title }) });
    render(<IntakeForm mode="member" />);
    await fillProject();
    await submit();

    await screen.findByText("Thank you!");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/intakes");
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(["budget", "description", "industry", "timeline", "title"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks the user to log in again when the session has expired (401)", async () => {
    fetchMock.mockResolvedValue({ status: 401, json: async () => ({}) });
    render(<IntakeForm mode="member" />);
    await fillProject();
    await submit();

    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });
});

describe("IntakeForm submission", () => {
  it("posts the trimmed values, never a created_at, then shows a thank-you and refreshes the list", async () => {
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ ...VALID, budget: 25000, id: "1" }) });
    render(<IntakeForm />);
    await fillValid({ title: "  Booking app  " });
    await submit();

    await screen.findByText("Thank you!");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/register");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(["budget", "company", "description", "email", "industry", "name", "password", "timeline", "title"]);
    expect(body.budget).toBe(25000); // a number, not "$25,000"
    expect(body.timeline).toBe("2026-12-01");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lets the user send another project with a clean form", async () => {
    fetchMock.mockResolvedValue({ status: 201, json: async () => ({ ...VALID, budget: 25000, id: "1" }) });
    render(<IntakeForm />);
    await fillValid();
    await submit();
    await userEvent.click(await screen.findByRole("button", { name: /send another project/i }));

    expect(field(/project title/i)).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the button while sending, preventing double submits", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<IntakeForm />);
    await fillValid();
    await submit();

    const button = screen.getByRole("button", { name: /sending/i });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolve({ status: 201, json: async () => ({ ...VALID, budget: 25000, id: "1" }) });
    await screen.findByText("Thank you!");
  });

  it("keeps the user's input and shows a banner when the server rejects it (400)", async () => {
    fetchMock.mockResolvedValue({ status: 400, json: async () => ({}) });
    render(<IntakeForm />);
    await fillValid();
    await submit();

    expect(await screen.findByText(/need your attention/i)).toBeInTheDocument();
    expect(field(/project title/i)).toHaveValue(VALID.title);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a friendly message on a server error (500) and keeps the input", async () => {
    fetchMock.mockResolvedValue({ status: 500, json: async () => ({}) });
    render(<IntakeForm />);
    await fillValid();
    await submit();

    expect(await screen.findByText(/something went wrong on our side/i)).toBeInTheDocument();
    expect(field(/project title/i)).toHaveValue(VALID.title);
    expect(screen.getByRole("button", { name: /send my project/i })).toBeEnabled();
  });

  it("shows a friendly message when the network fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<IntakeForm />);
    await fillValid();
    await submit();

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /send my project/i })).toBeEnabled());
  });
});
