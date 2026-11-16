import { NextResponse } from "next/server";
import {
  listGa4Properties,
  listSearchConsoleSites,
} from "@/lib/google/properties";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const [gsc, ga4] = await Promise.all([
      listSearchConsoleSites(),
      listGa4Properties(),
    ]);
    return NextResponse.json({ gsc, ga4 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de charger les propriétés Google.",
      },
      { status: 502 }
    );
  }
}
