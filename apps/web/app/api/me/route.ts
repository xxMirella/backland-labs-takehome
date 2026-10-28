import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  return user ? NextResponse.json({ user }) : NextResponse.json({ error: { formErrors: ["Not signed in"] } }, { status: 401 });
}
