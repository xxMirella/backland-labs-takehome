import { NextResponse } from "next/server";
import { destroySession } from "@app/backend";
import { clearSessionCookie, currentToken, isSameOrigin } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { formErrors: ["Forbidden"] } }, { status: 403 });
  await destroySession(await currentToken());
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
