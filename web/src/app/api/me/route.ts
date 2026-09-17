import { NextResponse } from "next/server";

/** GET /api/me — profile + settings for the signed-in worker (W1). */
export async function GET() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
