// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IntakeStats } from "./intake-stats";

afterEach(cleanup);

const stat = (name: string) => screen.getByText(name, { selector: "dt" }).closest(".stat") as HTMLElement;

describe("IntakeStats", () => {
  it("shows the total and the urgent counts", () => {
    render(<IntakeStats stats={{ total: 12, urgent: 3 }} />);
    expect(within(stat("Total intakes")).getByText("12")).toBeInTheDocument();
    expect(within(stat("Urgent")).getByText("3")).toBeInTheDocument();
    expect(stat("Urgent")).toHaveClass("stat-urgent");
  });

  it("shows zeros without the alert styling", () => {
    render(<IntakeStats stats={{ total: 0, urgent: 0 }} />);
    expect(within(stat("Total intakes")).getByText("0")).toBeInTheDocument();
    expect(stat("Urgent")).not.toHaveClass("stat-urgent");
  });

  it("contains counts only, nothing about individual projects or people", () => {
    const { container } = render(<IntakeStats stats={{ total: 2, urgent: 1 }} />);
    expect(container.querySelectorAll("li, a, time")).toHaveLength(0);
  });
});
