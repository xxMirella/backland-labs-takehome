import { NextResponse } from "next/server";
import { createIntake, listIntakesFor, projectSchema, toCustomerDto } from "@app/backend";
import { currentUser, isSameOrigin, scheduleAnalysis } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: { formErrors: ["Please log in first"] } }, { status: 401 });

/**
 * Team members get every intake with the AI analysis. Customers get only their own, and only the
 * fields they sent: the narrowing happens in the service, not here.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return NextResponse.json((await listIntakesFor(user)).intakes);
}

/** Signed-in users submit another project; who they are comes from the session, never from the body. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { formErrors: ["Forbidden"] } }, { status: 403 });
  const user = await currentUser();
  if (!user) return unauthorized();

  const parsed = projectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const intake = await createIntake({ ...parsed.data, name: user.name, email: user.email, company: user.company }, user.id);
  scheduleAnalysis(intake.id);
  return NextResponse.json(toCustomerDto(intake), { status: 201 });
}
