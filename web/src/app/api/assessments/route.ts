import { NextResponse } from "next/server";

/** GET /api/assessments — definitions. POST — submit an attempt for scoring (W4). */
export async function GET() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
