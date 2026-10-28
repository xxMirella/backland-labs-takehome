import { NextResponse } from "next/server";
import { EmailTakenError, registerSchema, registerWithIntake, toCustomerDto, toSessionUser } from "@app/backend";
import { clientIp, isSameOrigin, registerLimiter, scheduleAnalysis, setSessionCookie } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { formErrors: ["Forbidden"] } }, { status: 403 });
  if (!registerLimiter.take(clientIp(req))) {
    return NextResponse.json({ error: { formErrors: ["Too many sign-ups from here. Try again later."] } }, { status: 429 });
  }

  const parsed = registerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const { user, session, intake } = await registerWithIntake(parsed.data);
    scheduleAnalysis(intake.id);
    const res = NextResponse.json({ user: toSessionUser(user), intake: toCustomerDto(intake) }, { status: 201 });
    setSessionCookie(res, session.token, session.expiresAt);
    return res;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json(
        { error: { fieldErrors: { email: ["An account with this email already exists. Please log in instead."] } } },
        { status: 409 },
      );
    }
    throw error;
  }
}
