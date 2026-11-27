import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness — processus capable de répondre.
 * Public, informations minimales (OBS-001 / healthchecks).
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, status: "live" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
