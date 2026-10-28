import { NextResponse } from "next/server";
import { InvalidCredentialsError, authenticate, createSession, loginSchema, toSessionUser } from "@app/backend";
import { clientIp, isSameOrigin, loginLimiter, setSessionCookie } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { formErrors: ["Forbidden"] } }, { status: 403 });

  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const key = `${clientIp(req)}|${parsed.data.email}`;
  if (!loginLimiter.take(key)) {
    return NextResponse.json(
      { error: { formErrors: ["Too many attempts. Please wait a few minutes and try again."] } },
      { status: 429 },
    );
  }

  try {
    const user = await authenticate(parsed.data.email, parsed.data.password);
    loginLimiter.reset(key);
    const session = await createSession(user.id);
    const res = NextResponse.json({ user: toSessionUser(user) });
    setSessionCookie(res, session.token, session.expiresAt);
    return res;
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      // Same answer for an unknown email and a wrong password.
      return NextResponse.json({ error: { formErrors: ["Wrong email or password."] } }, { status: 401 });
    }
    throw error;
  }
}
