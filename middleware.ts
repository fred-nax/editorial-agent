import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Défense en profondeur (AUTH-003) : les routes API privées exigent une session
 * même si une route oublie requireAuth.
 *
 * Utilise getToken (Edge-compatible) plutôt que d’importer auth.ts (bcrypt).
 *
 * Exceptions légitimes :
 * - Auth.js (/api/auth/*)
 * - OAuth Google callback
 * - Cron Google (Bearer dédié — la route valide le secret)
 */

function isPublicApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/google/oauth/callback") return true;
  if (pathname === "/api/google/sync/cron") return true;
  // Healthchecks Docker / reverse-proxy (informations minimales uniquement).
  if (pathname === "/api/health/live" || pathname === "/api/health/ready") {
    return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (isPublicApiPath(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Configuration d’authentification manquante." },
      { status: 500 }
    );
  }

  const token = await getToken({ req, secret });
  if (!token) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
