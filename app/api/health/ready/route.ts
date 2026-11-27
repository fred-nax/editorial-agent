import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness — PostgreSQL joignable.
 * Public : pas de secrets, pas de nom de base, pas de détails internes.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, status: "ready" },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    // Ne pas exposer le message d’erreur PostgreSQL ni le nom de base.
    return NextResponse.json(
      { ok: false, status: "not_ready" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
