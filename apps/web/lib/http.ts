import { cookies } from "next/headers";
import { after, type NextResponse } from "next/server";
import { analyzeAndTagIntake, createRateLimiter, getSessionUser } from "@app/backend";

export const SESSION_COOKIE = "session";

const cookieBase = {
  httpOnly: true, // not readable from JavaScript, so XSS can't steal the session
  sameSite: "lax" as const, // not sent on cross-site POSTs
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setSessionCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set(SESSION_COOKIE, token, { ...cookieBase, expires });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

export async function currentUser() {
  return getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function currentToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

/** Extra CSRF guard on top of SameSite: browsers always send Origin on cross-site POSTs. */
export function isSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl, server-to-server)
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export const loginLimiter = createRateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
export const registerLimiter = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });

/** Runs the (slow) AI analysis after the response has been sent, so customers never wait for it. */
export function scheduleAnalysis(intakeId: string) {
  after(async () => {
    try {
      await analyzeAndTagIntake(intakeId);
    } catch (error) {
      console.error(`Scheduled analysis failed for intake ${intakeId}:`, error);
    }
  });
}
