import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BUDGET,
  createIntakeSchema,
  CUSTOMER_FIELDS,
  URGENT_WITHIN_DAYS,
  editIntakeSchema,
  isPastDelivery,
  toCustomerDto,
  type IntakeDto,
  loginSchema,
  passwordSchema,
  projectSchema,
  registerSchema,
  daysBetween,
  defaultPriority,
  formatDate,
  formatUsd,
  isValidIsoDate,
  isoDate,
} from "./contract";

// Fixed "now" (UTC): 2026-10-27 12:00. Earliest accepted date is 2026-10-26 (yesterday, for timezones).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const valid = {
  name: "Ana Silva",
  email: "ana@acme.com",
  company: "Acme Inc.",
  title: "Booking app",
  description: "A booking app for my studio.",
  budget: 25000,
  timeline: "2026-12-01",
  industry: "Wellness",
};

/** Returns the first message for a field, or undefined when the field is valid. */
function errorFor(field: keyof typeof valid, value: unknown) {
  const result = createIntakeSchema.safeParse({ ...valid, [field]: value });
  return result.success ? undefined : result.error.flatten().fieldErrors[field]?.[0];
}

describe("createIntakeSchema", () => {
  it("accepts a valid intake", () => {
    expect(createIntakeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a completely empty form with a message per field", () => {
    const result = createIntakeSchema.safeParse({
      name: "", email: "", company: "", title: "", description: "", budget: undefined, timeline: "", industry: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.error.flatten().fieldErrors).sort()).toEqual(
        ["budget", "company", "description", "email", "industry", "name", "timeline", "title"],
      );
    }
  });

  it("rejects missing fields", () => {
    expect(createIntakeSchema.safeParse({}).success).toBe(false);
  });

  describe("title", () => {
    it("asks for a title when blank or whitespace-only", () => {
      expect(errorFor("title", "")).toBe("Please give your project a title");
      expect(errorFor("title", "     ")).toBe("Please give your project a title");
    });
    it("rejects titles shorter than 3 characters", () => {
      expect(errorFor("title", "ab")).toMatch(/too short/);
      expect(errorFor("title", " a ")).toMatch(/too short/); // padding doesn't count
    });
    it("accepts exactly 3 characters and 200 characters", () => {
      expect(errorFor("title", "abc")).toBeUndefined();
      expect(errorFor("title", "a".repeat(200))).toBeUndefined();
    });
    it("rejects titles over 200 characters", () => {
      expect(errorFor("title", "a".repeat(201))).toMatch(/under 200/);
    });
    it("rejects non-string values", () => {
      expect(errorFor("title", 123)).toBeDefined();
      expect(errorFor("title", null)).toBeDefined();
    });
  });

  describe("description", () => {
    it("asks for a description when blank or whitespace-only", () => {
      expect(errorFor("description", "")).toBe("Please describe your project");
      expect(errorFor("description", "   \n  ")).toBe("Please describe your project");
    });
    it("rejects descriptions shorter than 10 characters", () => {
      expect(errorFor("description", "too short")).toMatch(/too short/); // 9 chars
      expect(errorFor("description", "   123456789   ")).toMatch(/too short/); // 9 after trim
    });
    it("accepts exactly 10 characters and 5000 characters", () => {
      expect(errorFor("description", "1234567890")).toBeUndefined();
      expect(errorFor("description", "a".repeat(5000))).toBeUndefined();
    });
    it("rejects descriptions over 5000 characters", () => {
      expect(errorFor("description", "a".repeat(5001))).toMatch(/under 5000/);
    });
  });

  describe("budget", () => {
    it("asks for a budget when not informed", () => {
      expect(errorFor("budget", undefined)).toBe("Please enter your budget");
      expect(errorFor("budget", null)).toBe("Please enter your budget");
      expect(errorFor("budget", "")).toBe("Please enter your budget");
      expect(errorFor("budget", Number.NaN)).toBe("Please enter your budget");
    });
    it("rejects zero and negative amounts", () => {
      expect(errorFor("budget", 0)).toBe("Budget must be greater than $0");
      expect(errorFor("budget", -500)).toBe("Budget must be greater than $0");
    });
    it("rejects fractional dollars", () => {
      expect(errorFor("budget", 99.5)).toBe("Please enter a whole dollar amount");
    });
    it("rejects numbers sent as strings (the API contract is a number)", () => {
      expect(errorFor("budget", "25000")).toBe("Please enter your budget");
    });
    it("accepts $1 up to the maximum and rejects more", () => {
      expect(errorFor("budget", 1)).toBeUndefined();
      expect(errorFor("budget", MAX_BUDGET)).toBeUndefined();
      expect(errorFor("budget", MAX_BUDGET + 1)).toBe("Budget can't exceed $1,000,000,000");
      expect(errorFor("budget", Number.POSITIVE_INFINITY)).toBeDefined();
    });
    it("rejects the old bucket values", () => {
      expect(createIntakeSchema.safeParse({ ...valid, budget: undefined, budgetRange: "10k-50k" }).success).toBe(false);
    });
  });

  describe("timeline (delivery date)", () => {
    it("asks for a date when blank or missing", () => {
      expect(errorFor("timeline", "")).toBe("Please choose a delivery date");
      expect(errorFor("timeline", undefined)).toBe("Please choose a delivery date");
      expect(errorFor("timeline", null)).toBe("Please choose a delivery date");
    });
    it.each(["tomorrow", "2026-13-45", "2026-02-30", "12/01/2026", "2026-12-1", "2026-12-01T10:00:00Z", "1-3m", "<1m"])(
      "rejects the malformed date %s",
      (value) => {
        expect(errorFor("timeline", value)).toBe("Please enter a valid date");
      },
    );
    it("accepts today and future dates", () => {
      expect(errorFor("timeline", "2026-10-27")).toBeUndefined();
      expect(errorFor("timeline", "2026-10-28")).toBeUndefined();
      expect(errorFor("timeline", "2027-02-28")).toBeUndefined();
    });
    it("tolerates yesterday-UTC (users west of UTC are still on 'today') but rejects older dates", () => {
      expect(errorFor("timeline", "2026-10-26")).toBeUndefined();
      expect(errorFor("timeline", "2026-10-25")).toBe("Delivery date can't be in the past");
      expect(errorFor("timeline", "2020-01-01")).toBe("Delivery date can't be in the past");
    });
    it("rolls over correctly at the UTC day boundary", () => {
      vi.setSystemTime(new Date("2026-10-27T00:30:00Z"));
      expect(errorFor("timeline", "2026-10-26")).toBeUndefined();
      expect(errorFor("timeline", "2026-10-25")).toBe("Delivery date can't be in the past");
      vi.setSystemTime(new Date("2026-10-27T23:59:59Z"));
      expect(errorFor("timeline", "2026-10-26")).toBeUndefined();
    });
    it("rejects dates more than 10 years away", () => {
      expect(errorFor("timeline", "2036-10-27")).toBeUndefined();
      expect(errorFor("timeline", "2036-10-28")).toBe("Pick a date within the next 10 years");
      expect(errorFor("timeline", "9999-12-31")).toBe("Pick a date within the next 10 years");
    });
    it("accepts a leap day", () => {
      expect(errorFor("timeline", "2028-02-29")).toBeUndefined();
      expect(errorFor("timeline", "2027-02-29")).toBe("Please enter a valid date");
    });
  });

  describe("industry", () => {
    it("asks for an industry when blank or whitespace-only", () => {
      expect(errorFor("industry", "")).toBe("Please tell us your industry");
      expect(errorFor("industry", "   ")).toBe("Please tell us your industry");
    });
    it("accepts a 1-character industry and rejects over 120 characters", () => {
      expect(errorFor("industry", "x")).toBeUndefined();
      expect(errorFor("industry", "a".repeat(121))).toMatch(/under 120/);
    });
  });

  it("trims whitespace from accepted values", () => {
    const result = createIntakeSchema.parse({ ...valid, title: "  Booking app  " });
    expect(result.title).toBe("Booking app");
  });

  it("drops unknown fields such as a client-sent created_at", () => {
    const result = createIntakeSchema.parse({ ...valid, createdAt: "1999-01-01", tags: ["x"] });
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("tags");
  });
});

describe("date and money helpers", () => {
  it("formats dollars with thousands separators", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(999)).toBe("$999");
    expect(formatUsd(12500)).toBe("$12,500");
    expect(formatUsd(1_000_000_000)).toBe("$1,000,000,000");
  });

  it("formats a date-only string without timezone shifts", () => {
    expect(formatDate("2026-11-30")).toBe("Nov 30, 2026");
    expect(formatDate("2027-01-01")).toBe("Jan 1, 2027");
  });

  it("validates ISO calendar dates", () => {
    expect(isValidIsoDate("2026-12-31")).toBe(true);
    expect(isValidIsoDate("2026-12-32")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("counts whole days between dates, including across months and negatives", () => {
    expect(daysBetween("2026-10-27", "2026-10-27")).toBe(0);
    expect(daysBetween("2026-10-27", "2026-11-12")).toBe(16);
    expect(daysBetween("2026-10-27", "2026-10-20")).toBe(-7);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("returns the UTC date", () => {
    expect(isoDate(new Date("2026-10-27T23:59:59Z"))).toBe("2026-10-27");
  });
});

describe("submitter fields", () => {
  it("asks for name, email and company when blank or whitespace-only", () => {
    expect(errorFor("name", "")).toBe("Please tell us your name");
    expect(errorFor("name", "   ")).toBe("Please tell us your name");
    expect(errorFor("email", "")).toBe("Please enter your email");
    expect(errorFor("email", "   ")).toBe("Please enter your email");
    expect(errorFor("company", "")).toBe("Please tell us your company");
    expect(errorFor("company", "  ")).toBe("Please tell us your company");
  });

  it("rejects a one-character name but accepts two", () => {
    expect(errorFor("name", "A")).toMatch(/too short/);
    expect(errorFor("name", "Al")).toBeUndefined();
  });

  it.each(["plainaddress", "ana@", "@acme.com", "ana@acme", "ana acme@x.com", "ana@@acme.com"])(
    "rejects the invalid email %s",
    (email) => {
      expect(errorFor("email", email)).toMatch(/doesn't look right/);
    },
  );

  it.each(["ana@acme.com", "ana.silva+rfp@sub.acme.co.uk", "A@B.io"])("accepts the email %s", (email) => {
    expect(errorFor("email", email)).toBeUndefined();
  });

  it("trims and lower-cases the email so duplicates are easy to spot", () => {
    const parsed = createIntakeSchema.parse({ ...valid, email: "  Ana@ACME.com " });
    expect(parsed.email).toBe("ana@acme.com");
  });

  it("enforces maximum lengths", () => {
    expect(errorFor("name", "a".repeat(121))).toMatch(/under 120/);
    expect(errorFor("company", "a".repeat(161))).toMatch(/under 160/);
    expect(errorFor("email", `${"a".repeat(250)}@x.com`)).toBeDefined();
  });
});

describe("defaultPriority", () => {
  it(`is urgent when the deadline is ${URGENT_WITHIN_DAYS} days or less after submission`, () => {
    expect(defaultPriority("2026-10-27T10:00:00Z", "2026-10-27").priority).toBe("urgent"); // same day
    expect(defaultPriority("2026-10-27T10:00:00Z", "2026-11-10").priority).toBe("urgent"); // exactly 14
  });

  it("is normal from 15 days up and has no reason", () => {
    expect(defaultPriority("2026-10-27T10:00:00Z", "2026-11-11")).toEqual({ priority: "normal", reason: null });
  });

  it("explains why it is urgent, with correct singular/plural", () => {
    expect(defaultPriority("2026-10-27T10:00:00Z", "2026-10-28").reason).toBe("Delivery date is 1 day after submission.");
    expect(defaultPriority("2026-10-27T10:00:00Z", "2026-11-05").reason).toBe("Delivery date is 9 days after submission.");
  });

  it("never reports negative days for a date before submission", () => {
    expect(defaultPriority("2026-10-27T10:00:00Z", "2026-10-25")).toMatchObject({
      priority: "urgent",
      reason: "Delivery date is 0 days after submission.",
    });
  });
});

describe("passwordSchema", () => {
  it("asks for a password when empty or missing", () => {
    expect(passwordSchema.safeParse("").error?.issues[0]?.message).toBe("Please choose a password");
    expect(passwordSchema.safeParse(undefined).error?.issues[0]?.message).toBe("Please choose a password");
  });

  it("requires 8 characters, accepts exactly 8 and up to 128", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });

  it("does not trim: seven letters plus a space is a valid 8-character password", () => {
    expect(passwordSchema.safeParse("abcdefg ").success).toBe(true);
    expect(passwordSchema.parse("  keep my spaces  ")).toBe("  keep my spaces  ");
  });
});

describe("registerSchema", () => {
  it("accepts a complete registration", () => {
    expect(registerSchema.safeParse({ ...valid, password: "correct horse" }).success).toBe(true);
  });

  it("requires the password on top of every intake field", () => {
    expect(registerSchema.safeParse(valid).error?.flatten().fieldErrors.password?.[0]).toBe("Please choose a password");
  });
});

describe("projectSchema", () => {
  const { name: _n, email: _e, company: _c, ...project } = valid;

  it("accepts a project without any account fields", () => {
    expect(projectSchema.safeParse(project).success).toBe(true);
  });

  it("drops identity fields so a signed-in user can't impersonate someone else", () => {
    const parsed = projectSchema.parse({ ...project, name: "Mallory", email: "boss@acme.com", company: "Evil" });
    expect(parsed).not.toHaveProperty("name");
    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("company");
  });

  it("still enforces the project rules", () => {
    expect(projectSchema.safeParse({ ...project, title: "" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...project, budget: 0 }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts and normalises the email", () => {
    expect(loginSchema.parse({ email: "  Ana@ACME.com ", password: "x" })).toEqual({ email: "ana@acme.com", password: "x" });
  });

  it("asks for both fields", () => {
    const errors = loginSchema.safeParse({ email: "", password: "" }).error?.flatten().fieldErrors;
    expect(errors?.email?.[0]).toBe("Please enter your email");
    expect(errors?.password?.[0]).toBe("Please enter your password");
  });

  it("rejects a malformed email and an absurdly long password", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(129) }).success).toBe(false);
  });

  it("does not apply the registration length rule, so old short passwords can still log in", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "abc" }).success).toBe(true);
  });
});

describe("toCustomerDto (what customers may see)", () => {
  const full: IntakeDto = {
    id: "1", name: "Ana", email: "ana@acme.com", company: "Acme", title: "CRM", description: "Build a CRM.", budget: 5000,
    timeline: "2026-12-01", industry: "Health", tags: ["backend"], risks: [{ type: "budget", severity: "high", message: "Low." }],
    summary: "Secret summary", keyPoints: ["Secret point"], priority: "urgent", priorityReason: "Secret reason", createdAt: "2026-10-27T10:00:00.000Z",
  };

  it("keeps exactly what the customer sent and drops everything derived", () => {
    expect(Object.keys(toCustomerDto(full)).sort()).toEqual(
      ["budget", "createdAt", "description", "id", "industry", "timeline", "title"],
    );
    expect(Object.keys(toCustomerDto(full)).sort()).toEqual([...CUSTOMER_FIELDS].sort());
  });

  it("never leaks the analysis, even in the serialised JSON", () => {
    const json = JSON.stringify(toCustomerDto(full));
    for (const secret of ["Secret", "backend", "urgent", "Low.", "tags", "risks", "summary", "keyPoints", "priority"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("is an allowlist: a field added to IntakeDto later stays private", () => {
    const withNewField = { ...full, internalNotes: "do not show" } as IntakeDto;
    expect(JSON.stringify(toCustomerDto(withNewField))).not.toContain("do not show");
  });
});

describe("editIntakeSchema", () => {
  const { name: _n, email: _e, company: _c, ...project } = valid;

  it("accepts a valid edit, and a delivery date that has already passed (the service decides)", () => {
    expect(editIntakeSchema.safeParse(project).success).toBe(true);
    expect(editIntakeSchema.safeParse({ ...project, timeline: "2020-01-01" }).success).toBe(true);
  });

  it("still validates every field and the date format and range", () => {
    expect(editIntakeSchema.safeParse({ ...project, title: "ab" }).success).toBe(false);
    expect(editIntakeSchema.safeParse({ ...project, budget: 0 }).success).toBe(false);
    expect(editIntakeSchema.safeParse({ ...project, timeline: "tomorrow" }).success).toBe(false);
    expect(editIntakeSchema.safeParse({ ...project, timeline: "2050-01-01" }).success).toBe(false);
    expect(editIntakeSchema.safeParse({ ...project, timeline: "" }).error?.flatten().fieldErrors.timeline?.[0]).toBe(
      "Please choose a delivery date",
    );
  });

  it("ignores identity and AI fields in the body", () => {
    const parsed = editIntakeSchema.parse({ ...project, name: "Mallory", email: "x@y.co", priority: "urgent", userId: "a1" });
    expect(Object.keys(parsed).sort()).toEqual(["budget", "description", "industry", "timeline", "title"]);
  });
});

describe("isPastDelivery", () => {
  it("is true before yesterday (UTC) and false from yesterday on", () => {
    expect(isPastDelivery("2026-10-25")).toBe(true);
    expect(isPastDelivery("2026-10-26")).toBe(false);
    expect(isPastDelivery("2026-10-27")).toBe(false);
  });
});
