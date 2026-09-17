import { NextResponse } from "next/server";

/** GET /api/lessons — org lesson content, including 3D asset references (W3). */
export async function GET() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
