import { NextResponse } from "next/server";

/**
 * GET /api/aggregates — materialized department rollups (M2, M3).
 *
 * Reads ONE precomputed item. Never fans out across workers: aggregates are
 * written by the async profiler, not computed when a manager opens the page.
 */
export async function GET() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
