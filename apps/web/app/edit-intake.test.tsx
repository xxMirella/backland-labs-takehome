// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerIntakeDto } from "@app/backend/contract";
import { EditIntake } from "./edit-intake";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.fn();

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const intake: CustomerIntakeDto = {
  id: "abc123",
  title: "Booking app",
  description: "A booking app for my studio.",
  budget: 12000,
  timeline: "2026-12-01",
  industry: "Wellness",
  createdAt: "2026-10-01T10:00:00.000Z",
};

const open = async () => {
  render(<EditIntake intake={intake} />);
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  return screen.getByRole("dialog", { hidden: true });
};
const field = (label: RegExp) => screen.getByLabelText(label);
const save = () => userEvent.click(screen.getByRole("button", { name: /save changes/i }));

describe("EditIntake", () => {
  it("is closed until Edit is clicked, then shows the form prefilled with what was sent", async () => {
    render(<EditIntake intake={intake} />);
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { hidden: true })).toHaveAccessibleName("Edit project");
    expect(field(/project title/i)).toHaveValue("Booking app");
    expect(field(/what do you need/i)).toHaveValue("A booking app for my studio.");
    expect(field(/budget/i)).toHaveValue("$12,000");
    expect(field(/timeline/i)).toHaveValue("2026-12-01");
    expect(field(/industry/i)).toHaveValue("Wellness");
  });

  it("has no account or password fields", async () => {
    await open();
    for (const label of [/your name/i, /email/i, /company/i, /password/i]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
  });

  it("sends a PATCH to this intake's URL with only the five project fields, then closes and refreshes", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await open();
    const title = field(/project title/i);
    await userEvent.clear(title);
    await userEvent.type(title, "Booking app v2");
    await save();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/intakes/abc123");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({
      title: "Booking app v2",
      description: "A booking app for my studio.",
      budget: 12000,
      timeline: "2026-12-01",
      industry: "Wellness",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
  });

  it("warns and sends nothing when a field is blanked or too short", async () => {
    await open();
    await userEvent.clear(field(/project title/i));
    await userEvent.clear(field(/what do you need/i));
    await userEvent.type(field(/what do you need/i), "short");
    await save();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please give your project a title")).toBeInTheDocument();
    expect(screen.getByText(/description is too short/i)).toBeInTheDocument();
    expect(field(/project title/i)).toHaveFocus();
    expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();
  });

  it("warns when the budget is cleared", async () => {
    await open();
    await userEvent.clear(field(/budget/i));
    await save();
    expect(screen.getByText("Please enter your budget")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a changed delivery date in the past", async () => {
    await open();
    fireEvent.change(field(/timeline/i), { target: { value: "2026-10-01" } });
    await save();
    expect(screen.getByText("Delivery date can't be in the past")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the customer fix a typo without touching a delivery date that has since passed", async () => {
    vi.setSystemTime(new Date("2027-01-15T12:00:00Z")); // 2026-12-01 is now in the past
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await open();
    await userEvent.type(field(/industry/i), "s");
    await save();

    expect(screen.queryByText("Delivery date can't be in the past")).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ timeline: "2026-12-01", industry: "Wellnesss" });
  });

  it("keeps the dialog open with the input when the server fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await open();
    await userEvent.type(field(/industry/i), "!");
    await save();

    expect(await screen.findByText(/something went wrong on our side/i)).toBeInTheDocument();
    expect(field(/industry/i)).toHaveValue("Wellness!");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("tells the customer when the project can no longer be found (404)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await open();
    await save();
    expect(await screen.findByText(/couldn't find this project/i)).toBeInTheDocument();
  });

  it("disables saving while the request is in flight", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    await open();
    await save();

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    resolve({ ok: true, status: 200, json: async () => ({}) });
  });

  it("Cancel closes without saving and a stray backdrop click does not discard edits", async () => {
    const dialog = await open();
    await userEvent.type(field(/industry/i), "x");
    await userEvent.click(dialog); // backdrop click
    expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reopens with the original values after cancelling", async () => {
    await open();
    await userEvent.type(field(/industry/i), "x");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(field(/industry/i)).toHaveValue("Wellness");
  });
});
