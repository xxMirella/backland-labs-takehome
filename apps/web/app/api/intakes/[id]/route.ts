import { NextResponse } from "next/server";
import { IntakeNotFoundError, PastDeliveryError, editIntakeSchema, toCustomerDto, updateIntake } from "@app/backend";
import { currentUser, isSameOrigin, scheduleAnalysis } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A customer edits one of their own intakes. Someone else's id answers 404, same as a missing one. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { formErrors: ["Forbidden"] } }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: { formErrors: ["Please log in first"] } }, { status: 401 });

  const parsed = editIntakeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id } = await params;
  try {
    const intake = await updateIntake(id, user.id, parsed.data);
    scheduleAnalysis(intake.id); // the analysis describes the old text until this finishes
    return NextResponse.json(toCustomerDto(intake));
  } catch (error) {
    if (error instanceof IntakeNotFoundError) {
      return NextResponse.json({ error: { formErrors: ["Intake not found"] } }, { status: 404 });
    }
    if (error instanceof PastDeliveryError) {
      return NextResponse.json({ error: { fieldErrors: { timeline: ["Delivery date can't be in the past"] } } }, { status: 400 });
    }
    throw error;
  }
}
