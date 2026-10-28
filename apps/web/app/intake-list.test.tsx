// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { IntakeDto } from "@app/backend/contract";
import { IntakeList } from "./intake-list";

// jsdom doesn't implement <dialog> modal behaviour; emulate the parts we rely on.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(cleanup);

const base: IntakeDto = {
  id: "1",
  name: "Ana Silva",
  email: "ana@acme.com",
  company: "Acme Inc.",
  title: "Warehouse migration",
  description: "Migrate our reporting. We use Postgres today. Dashboards for sales. This fourth sentence is cut.",
  budget: 8000,
  timeline: "2026-11-10",
  industry: "Retail",
  tags: ["data-engineering"],
  risks: [
    { type: "risk", severity: "low", message: "Dashboard scope is vague." },
    { type: "budget", severity: "high", message: "$8,000 is too low for this scope." },
    { type: "missing_info", severity: "medium", message: "Data volume is unknown." },
  ],
  summary: "A warehouse migration on a tight budget.",
  keyPoints: ["Ask for data volume", "Confirm source systems"],
  priority: "normal",
  priorityReason: null,
  createdAt: "2026-10-27T10:00:00.000Z",
};
const make = (over: Partial<IntakeDto> = {}): IntakeDto => ({ ...base, ...over });

describe("IntakeList", () => {
  it("shows the friendly empty state", () => {
    render(<IntakeList intakes={[]} />);
    expect(screen.getByText("No intakes yet")).toBeInTheDocument();
    expect(screen.getByText(/do you want to create some/i)).toBeInTheDocument();
  });

  it("titles the list and shows how many intakes it holds", () => {
    render(<IntakeList intakes={[make({ id: "a" }), make({ id: "b" })]} title="Your projects" />);
    expect(screen.getByRole("heading", { level: 2, name: /your projects/i })).toHaveTextContent("Your projects 2");
  });

  describe("cards", () => {
    it("shows who sent it, a 3-sentence excerpt, the area, urgency, industry and the key facts", () => {
      render(<IntakeList intakes={[make({ priority: "urgent" })]} />);
      const card = screen.getByText("Warehouse migration").closest("li.intake") as HTMLElement;

      expect(within(card).getByText("Ana Silva · Acme Inc.")).toBeInTheDocument();
      expect(within(card).getByText(/Dashboards for sales\./)).toBeInTheDocument();
      expect(within(card).queryByText(/fourth sentence/)).not.toBeInTheDocument();
      expect(within(card).getByText("Data engineering")).toHaveClass("chip-de");
      expect(within(card).getByText("Urgent")).toHaveClass("chip-urgent");
      expect(within(card).getByText("Retail")).toHaveClass("chip-industry");
      expect(within(card).getByText("$8,000 · Due Nov 10, 2026")).toBeInTheDocument();
      expect(card).toHaveClass("intake-urgent");
    });

    it("shows 2 tags for a normal project and 3 when it is urgent", () => {
      const { rerender } = render(<IntakeList intakes={[make()]} />);
      expect(within(screen.getByLabelText("Tags")).getAllByRole("listitem")).toHaveLength(2);
      rerender(<IntakeList intakes={[make({ priority: "urgent" })]} />);
      expect(within(screen.getByLabelText("Tags")).getAllByRole("listitem")).toHaveLength(3);
    });

    it.each(["frontend", "backend", "web-development"])("names the area when it is not data engineering: %s", (area) => {
      render(<IntakeList intakes={[make({ tags: [area] })]} />);
      const chip = screen.getByText(area.charAt(0).toUpperCase() + area.slice(1).replace(/-/g, " "));
      expect(chip).toHaveClass("chip-subject");
      expect(screen.queryByText(/not data engineering/i)).not.toBeInTheDocument();
    });

    it("doesn't show an Urgent tag for a normal project", () => {
      render(<IntakeList intakes={[make()]} />);
      expect(screen.queryByText("Urgent")).not.toBeInTheDocument();
      expect(screen.queryByText("Not urgent")).not.toBeInTheDocument();
    });

    it("says the analysis is pending when there are no tags", () => {
      render(<IntakeList intakes={[make({ tags: [], risks: [], summary: null, keyPoints: [] })]} />);
      expect(screen.getByText("Awaiting AI analysis")).toBeInTheDocument();
    });

    it("lists newest first in the order it is given", () => {
      render(<IntakeList intakes={[make({ id: "n", title: "Newest" }), make({ id: "o", title: "Oldest" })]} />);
      const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(titles).toEqual(["Newest", "Oldest"]);
    });

    it("flags high-severity findings", () => {
      render(<IntakeList intakes={[make()]} />);
      expect(screen.getByText("1 high-severity finding")).toBeInTheDocument();
    });
  });

  describe("details dialog", () => {
    const open = async (intake = make()) => {
      render(<IntakeList intakes={[intake]} />);
      await userEvent.click(screen.getByRole("button", { name: /view details/i }));
      return screen.getByRole("dialog", { hidden: true });
    };

    it("is closed until the button is clicked", () => {
      render(<IntakeList intakes={[make()]} />);
      expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    });

    it("shows the full description, the submitter and a mailto link", async () => {
      const dialog = await open();
      expect(dialog).toHaveAccessibleName("Warehouse migration");
      expect(within(dialog).getByText(/This fourth sentence is cut\./)).toBeInTheDocument();
      expect(within(dialog).getByText(/Ana Silva, Acme Inc\./)).toBeInTheDocument();
      expect(within(dialog).getByRole("link", { name: "ana@acme.com" })).toHaveAttribute("href", "mailto:ana@acme.com");
    });

    it("shows the AI summary, grouped findings (budget first), key points and tags", async () => {
      const dialog = await open();
      expect(within(dialog).getByText("A warehouse migration on a tight budget.")).toBeInTheDocument();

      const headings = within(dialog).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(headings).toEqual([
        "Submitted by", "Description", "AI summary", "Budget check", "Missing information", "Risks", "Key points",
      ]);
      expect(within(dialog).getByText("$8,000 is too low for this scope.")).toBeInTheDocument();
      expect(within(dialog).getByText("Ask for data volume")).toBeInTheDocument();
      expect(within(dialog).getByText("Data engineering")).toHaveClass("chip-de");
      expect(within(dialog).getByText("Retail")).toBeInTheDocument();
    });

    it("orders findings inside a group by severity", async () => {
      const dialog = await open(
        make({
          risks: [
            { type: "risk", severity: "low", message: "Low one." },
            { type: "risk", severity: "high", message: "High one." },
            { type: "risk", severity: "medium", message: "Medium one." },
          ],
        }),
      );
      const messages = [...dialog.querySelectorAll(".finding-msg")].map((n) => n.textContent);
      expect(messages).toEqual(["High one.", "Medium one.", "Low one."]);
    });

    it("explains why an intake is urgent", async () => {
      const dialog = await open(make({ priority: "urgent", priorityReason: "Clinic opens next week." }));
      expect(within(dialog).getByText("Clinic opens next week.")).toBeInTheDocument();
      expect(within(dialog).getByText("Urgent")).toHaveClass("chip-urgent");
    });

    it("explains that analysis is missing instead of showing empty sections", async () => {
      const dialog = await open(make({ tags: [], risks: [], summary: null, keyPoints: [] }));
      expect(within(dialog).getByText(/analysis isn.t available/i)).toBeInTheDocument();
      expect(within(dialog).queryByText("Budget check")).not.toBeInTheDocument();
      expect(within(dialog).getByText(/This fourth sentence is cut\./)).toBeInTheDocument();
    });

    it("doesn't render a mailto link for legacy rows without an email", async () => {
      const dialog = await open(make({ email: "Not provided", name: "Not provided", company: "Not provided" }));
      expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    });

    it("closes with the close button and can be reopened", async () => {
      const dialog = await open();
      await userEvent.click(within(dialog).getByRole("button", { name: /close details/i }));
      expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /view details/i }));
      expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();
    });

    it("closes when the backdrop (the dialog element itself) is clicked, but not when its content is", async () => {
      const dialog = await open();
      await userEvent.click(within(dialog).getByText("Description"));
      expect(screen.getByRole("dialog", { hidden: true })).toBeInTheDocument();

      await userEvent.click(dialog);
      expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    });
  });
});
