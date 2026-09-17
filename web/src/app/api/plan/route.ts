import { NextResponse } from "next/server";

/** GET /api/plan — the worker's learning plan and module progress (W2). */
export async function GET() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
