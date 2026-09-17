import { NextResponse } from "next/server";

/** POST /api/invites — admin issues an invite. PATCH — redeem by code (A3, A4). */
export async function POST() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}

export async function PATCH() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
