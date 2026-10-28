// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerIntakeDto } from "@app/backend/contract";
import { CustomerList } from "./customer-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const intake: CustomerIntakeDto = {
  id: "1",
  title: "Booking app",
  description: "A booking app for my studio.\nWith reminders. And payments. And a fourth sentence that must still show.",
  budget: 12000,
  timeline: "2026-12-01",
  industry: "Wellness",
  createdAt: "2026-10-27T10:00:00.000Z",
};

describe("CustomerList", () => {
  it("shows the friendly empty state with no cards", () => {
    render(<CustomerList intakes={[]} />);
    expect(screen.getByText("No intakes yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("shows everything the customer sent, in full", () => {
    render(<CustomerList intakes={[intake]} />);
    const card = screen.getByText("Booking app").closest("li.intake") as HTMLElement;

    expect(within(card).getByText(/fourth sentence that must still show/)).toBeInTheDocument();
    expect(within(card).getByText("Wellness · $12,000 · Due Dec 1, 2026")).toBeInTheDocument();
    expect(within(card).getByText("Oct 27, 2026")).toBeInTheDocument();
  });

  it("shows no AI or team information: no tags, urgency, analysis or details button", () => {
    // Even if the server (wrongly) sent extra fields, the component has nothing to render them with.
    const leaky = { ...intake, tags: ["backend"], priority: "urgent", summary: "Secret", risks: [{ message: "Secret" }] };
    const { container } = render(<CustomerList intakes={[leaky as CustomerIntakeDto]} />);

    expect(container).not.toHaveTextContent(/secret|urgent|backend|AI analysis|risk/i);
    expect(screen.queryByRole("button", { name: /view details/i })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".chip")).toHaveLength(0);
  });

  it("has an Edit button on each project and a count in the heading", () => {
    render(<CustomerList intakes={[intake, { ...intake, id: "2", title: "Second" }]} />);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Your projects 2");
  });
});
