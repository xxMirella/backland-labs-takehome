import { prisma, type Intake } from "@app/db";
import { analyzeIntake, isAnalysisConfigured } from "./ai";
import {
  PRIORITIES,
  CUSTOMER_FIELDS,
  defaultPriority,
  isPastDelivery,
  isoDate,
  riskSchema,
  stringArraySchema,
  type CreateIntakeInput,
  type IntakeDto,
  type IntakeListing,
  type ProjectInput,
  type SessionUserDto,
  type StatsDto,
} from "./contract";

// Parses DB values so a bad row fails loudly instead of leaking into the API.
function toDto(row: Intake): IntakeDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    title: row.title,
    description: row.description,
    budget: row.budget,
    timeline: isoDate(row.timeline),
    industry: row.industry,
    tags: stringArraySchema.parse(row.tags),
    risks: riskSchema.array().parse(row.risks),
    summary: row.summary,
    keyPoints: stringArraySchema.parse(row.keyPoints),
    priority: PRIORITIES.find((p) => p === row.priority) ?? "normal",
    priorityReason: row.priorityReason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Runs the AI analysis and stores the result. Never throws: the intake is already saved. */
async function tryAnalyze(row: Intake): Promise<Intake> {
  if (!isAnalysisConfigured()) {
    console.warn("OPENROUTER_API_KEY not set: skipping AI analysis");
    return row;
  }
  try {
    const { tags, risks, summary, keyPoints, priority, priorityReason } = await analyzeIntake(toDto(row));
    return await prisma.intake.update({
      where: { id: row.id },
      data: {
        tags,
        risks,
        summary,
        keyPoints,
        // The model's call wins; a missing/invalid priority keeps the deadline-based default.
        ...(priority && { priority, priorityReason: priority === "urgent" ? priorityReason || row.priorityReason : null }),
      },
    });
  } catch (error) {
    console.error(`AI analysis failed for intake ${row.id}:`, error);
    return row;
  }
}

/** `userId` ties the intake to its owner so non-admins only ever see their own. */
export class IntakeNotFoundError extends Error {
  constructor() {
    super("Intake not found");
  }
}
export class PastDeliveryError extends Error {
  constructor() {
    super("Delivery date can't be in the past");
  }
}

/**
 * Saves the intake right away with a deadline-based priority. The AI analysis is slow, so callers run
 * `analyzeAndTagIntake(id)` after responding instead of making the customer wait for it.
 */
export async function createIntake(input: CreateIntakeInput, userId?: string): Promise<IntakeDto> {
  const { priority, reason } = defaultPriority(isoDate(), input.timeline);
  const row = await prisma.intake.create({
    data: {
      ...input,
      timeline: new Date(`${input.timeline}T00:00:00Z`),
      priority,
      priorityReason: reason,
      ...(userId && { userId }),
    },
  });
  return toDto(row);
}

/** Team members get everything; customers get a narrow query that never loads the AI columns. */
export async function listIntakesFor(user: Pick<SessionUserDto, "id" | "isAdmin">): Promise<IntakeListing> {
  if (user.isAdmin) {
    const rows = await prisma.intake.findMany({ orderBy: { createdAt: "desc" } });
    return { scope: "all", intakes: rows.map(toDto) };
  }
  const rows = await prisma.intake.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: Object.fromEntries(CUSTOMER_FIELDS.map((f) => [f, true])) as Record<(typeof CUSTOMER_FIELDS)[number], true>,
  });
  return {
    scope: "own",
    intakes: rows.map((r) => ({ ...r, timeline: isoDate(r.timeline), createdAt: r.createdAt.toISOString() })),
  };
}

/** Customers edit their own intake. The priority is recomputed from the new date until the AI re-runs. */
export async function updateIntake(id: string, userId: string, input: ProjectInput): Promise<IntakeDto> {
  const current = await prisma.intake.findFirst({ where: { id, userId } });
  if (!current) throw new IntakeNotFoundError(); // same answer whether it doesn't exist or belongs to someone else
  if (input.timeline !== isoDate(current.timeline) && isPastDelivery(input.timeline)) throw new PastDeliveryError();

  const { priority, reason } = defaultPriority(current.createdAt.toISOString(), input.timeline);
  const row = await prisma.intake.update({
    where: { id },
    data: { ...input, timeline: new Date(`${input.timeline}T00:00:00Z`), priority, priorityReason: reason },
  });
  return toDto(row);
}

/** Re-runs the analysis for an existing intake (e.g. after a failed attempt). */
export async function analyzeAndTagIntake(id: string): Promise<IntakeDto> {
  return toDto(await tryAnalyze(await prisma.intake.findUniqueOrThrow({ where: { id } })));
}

/** Aggregate counts only, safe to show to visitors who are not signed in. */
export async function getStats(): Promise<StatsDto> {
  const [total, urgent] = await Promise.all([
    prisma.intake.count(),
    prisma.intake.count({ where: { priority: "urgent" } }),
  ]);
  return { total, urgent };
}
