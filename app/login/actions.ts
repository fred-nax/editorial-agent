"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { resolveClientIpFromHeaders } from "@/lib/auth/client-ip";
import { assertLoginAttemptAllowed } from "@/lib/auth/login-rate-limit";

const GENERIC_CREDENTIALS_ERROR = "Identifiants incorrects.";

/**
 * UX login : contrôle précoce du lockout (message clair).
 * L’enregistrement des tentatives et le rate-limit autoritatif sont dans
 * `authorize()` (auth.ts) pour aussi couvrir /api/auth/callback/credentials.
 */
export async function loginAction(
  _prevState: { error: string } | undefined,
  formData: FormData
): Promise<{ error: string } | undefined> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: GENERIC_CREDENTIALS_ERROR };
  }

  const headerList = await headers();
  const { ip } = resolveClientIpFromHeaders(headerList);

  const decision = await assertLoginAttemptAllowed({
    ipAddress: ip,
    login: email,
  });
  if (!decision.allowed) {
    return { error: decision.message ?? GENERIC_CREDENTIALS_ERROR };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: GENERIC_CREDENTIALS_ERROR };
    }
    throw error;
  }

  return undefined;
}
