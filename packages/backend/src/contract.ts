import { z } from "zod";

export const MAX_BUDGET = 1_000_000_000;
const MAX_TIMELINE_YEARS = 10;
const DAY_MS = 86_400_000;

/** Today's date as "YYYY-MM-DD" in UTC. */
export const isoDate = (date: Date = new Date()) => date.toISOString().slice(0, 10);

/** True for a real calendar date written as "YYYY-MM-DD" (rejects 2026-13-45, 2026-02-30...). */
export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && isoDate(date) === value;
}

/** Whole days from one "YYYY-MM-DD" date to another (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** "$12,500" */
export const formatUsd = (amount: number) => `$${amount.toLocaleString("en-US")}`;

/** "Nov 30, 2026" from a "YYYY-MM-DD" string, without timezone shifts. */
export const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// The server accepts "today" in any timezone: UTC-12 is a day behind UTC, so only dates before
// yesterday (UTC) are certainly in the past. The browser enforces the strict local-date check.
const earliestTimeline = () => isoDate(new Date(Date.now() - DAY_MS));
const latestTimeline = () => {
  const limit = new Date();
  limit.setUTCFullYear(limit.getUTCFullYear() + MAX_TIMELINE_YEARS);
  return isoDate(limit);
};

/** True when a delivery date is certainly in the past (same lenient UTC rule the schema uses). */
export const isPastDelivery = (date: string) => date < earliestTimeline();

export const createIntakeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please tell us your name")
    .min(2, "That name is too short (at least 2 characters)")
    .max(120, "Keep the name under 120 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Please enter your email")
    .email("That email doesn't look right (e.g. name@company.com)")
    .max(254, "That email is too long"),
  company: z.string().trim().min(1, "Please tell us your company").max(160, "Keep the company under 160 characters"),
  title: z
    .string()
    .trim()
    .min(1, "Please give your project a title")
    .min(3, "That title is too short (at least 3 characters)")
    .max(200, "Keep the title under 200 characters"),
  description: z
    .string()
    .trim()
    .min(1, "Please describe your project")
    .min(10, "That description is too short (at least 10 characters)")
    .max(5000, "Keep the description under 5000 characters"),
  budget: z
    .number({ required_error: "Please enter your budget", invalid_type_error: "Please enter your budget" })
    .int("Please enter a whole dollar amount")
    .positive("Budget must be greater than $0")
    .max(MAX_BUDGET, `Budget can't exceed ${formatUsd(MAX_BUDGET)}`),
  timeline: z
    .string({ required_error: "Please choose a delivery date", invalid_type_error: "Please choose a delivery date" })
    .min(1, "Please choose a delivery date")
    .refine(isValidIsoDate, "Please enter a valid date")
    .refine((d) => !isValidIsoDate(d) || d >= earliestTimeline(), "Delivery date can't be in the past")
    .refine(
      (d) => !isValidIsoDate(d) || d <= latestTimeline(),
      `Pick a date within the next ${MAX_TIMELINE_YEARS} years`,
    ),
  industry: z.string().trim().min(1, "Please tell us your industry").max(120, "Keep the industry under 120 characters"),
});

export type CreateIntakeInput = z.infer<typeof createIntakeSchema>;

/** The project part of an intake: what a signed-in user submits (their identity comes from the session). */
export const projectSchema = createIntakeSchema.omit({ name: true, email: true, company: true });
export type ProjectInput = z.infer<typeof projectSchema>;

/**
 * Editing an existing intake: an unchanged delivery date may already be in the past, so only the
 * service rejects past dates, and only when the customer actually changes the date.
 */
export const editIntakeSchema = projectSchema.extend({
  timeline: z
    .string({ required_error: "Please choose a delivery date", invalid_type_error: "Please choose a delivery date" })
    .min(1, "Please choose a delivery date")
    .refine(isValidIsoDate, "Please enter a valid date")
    .refine((d) => !isValidIsoDate(d) || d <= latestTimeline(), `Pick a date within the next ${MAX_TIMELINE_YEARS} years`),
});

/** Passwords are never trimmed or truncated: spaces are legitimate characters. */
export const passwordSchema = z
  .string({ required_error: "Please choose a password", invalid_type_error: "Please choose a password" })
  .min(1, "Please choose a password")
  .min(8, "Your password needs at least 8 characters")
  .max(128, "Keep the password under 128 characters");

/** Registering = creating the account and submitting the first intake in one step. */
export const registerSchema = createIntakeSchema.extend({ password: passwordSchema });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Please enter your email")
    .email("That email doesn't look right (e.g. name@company.com)"),
  password: z.string({ required_error: "Please enter your password" }).min(1, "Please enter your password").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export type SessionUserDto = { id: string; name: string; email: string; company: string; isAdmin: boolean };
export type StatsDto = { total: number; urgent: number };

/** Shape returned by the API. Frontend imports this from "@app/backend/contract". */
export type IntakeDto = CreateIntakeInput & {
  id: string;
  tags: string[];
  risks: Risk[];
  summary: string | null;
  keyPoints: string[];
  priority: Priority;
  priorityReason: string | null;
  createdAt: string; // ISO 8601
};

export const stringArraySchema = z.array(z.string());

export const RISK_TYPES = ["risk", "missing_info", "budget"] as const;
export const SEVERITIES = ["low", "medium", "high"] as const;

/** One finding from the AI analysis of an intake. */
export const riskSchema = z.object({
  type: z.enum(RISK_TYPES),
  severity: z.enum(SEVERITIES),
  message: z.string().min(1),
});
export type Risk = z.infer<typeof riskSchema>;

export const RISK_TYPE_LABELS: Record<Risk["type"], string> = {
  risk: "Risk",
  missing_info: "Missing info",
  budget: "Budget",
};

export const PRIORITIES = ["urgent", "normal"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Deadlines this close to the submission date are treated as urgent. */
export const URGENT_WITHIN_DAYS = 14;

/** Deadline-based priority, used when the AI analysis is unavailable (and as guidance for it). */
export function defaultPriority(submittedAt: string, timeline: string): { priority: Priority; reason: string | null } {
  const days = daysBetween(submittedAt.slice(0, 10), timeline);
  return days <= URGENT_WITHIN_DAYS
    ? { priority: "urgent", reason: `Delivery date is ${Math.max(days, 0)} day${days === 1 ? "" : "s"} after submission.` }
    : { priority: "normal", reason: null };
}

/**
 * What a customer may see of their own intake: exactly what they sent. Everything the AI or the team
 * derived (tags, risks, summary, key points, priority) is deliberately absent.
 */
export const CUSTOMER_FIELDS = ["id", "title", "description", "budget", "timeline", "industry", "createdAt"] as const;
export type CustomerIntakeDto = Pick<IntakeDto, (typeof CUSTOMER_FIELDS)[number]>;

/** Allowlist, not a blocklist: new fields on IntakeDto stay private until added to CUSTOMER_FIELDS. */
export const toCustomerDto = (intake: IntakeDto): CustomerIntakeDto =>
  Object.fromEntries(CUSTOMER_FIELDS.map((key) => [key, intake[key]])) as CustomerIntakeDto;

/** `all` for the team (full analysis), `own` for customers (only what they sent). */
export type IntakeListing =
  | { scope: "all"; intakes: IntakeDto[] }
  | { scope: "own"; intakes: CustomerIntakeDto[] };
