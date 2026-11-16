import { NextResponse } from "next/server";
import { savePropertySelection } from "@/lib/google/connection";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

type Body = {
  gscPropertyUrl?: string | null;
  gscPropertyType?: string | null;
  gscPermissionLevel?: string | null;
  ga4AccountId?: string | null;
  ga4PropertyId?: string | null;
  ga4PropertyName?: string | null;
};

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  await savePropertySelection({
    gscPropertyUrl: body.gscPropertyUrl ?? null,
    gscPropertyType: body.gscPropertyType ?? null,
    gscPermissionLevel: body.gscPermissionLevel ?? null,
    ga4AccountId: body.ga4AccountId ?? null,
    ga4PropertyId: body.ga4PropertyId ?? null,
    ga4PropertyName: body.ga4PropertyName ?? null,
  });

  return NextResponse.json({ ok: true });
}
