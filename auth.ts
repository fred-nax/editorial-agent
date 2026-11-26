import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { resolveClientIpFromHeaders } from "@/lib/auth/client-ip";
import {
  assertLoginAttemptAllowed,
  purgeExpiredLoginAttempts,
  recordLoginAttempt,
} from "@/lib/auth/login-rate-limit";

function readAdminPasswordHash(): string | undefined {
  const raw = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!raw) {
    return undefined;
  }

  const unquoted = raw.replace(/^['"]|['"]$/g, "");
  if (unquoted.startsWith("$2")) {
    return unquoted;
  }

  try {
    const decoded = Buffer.from(unquoted, "base64").toString("utf8").trim();
    if (decoded.startsWith("$2")) {
      return decoded;
    }
  } catch {
    return unquoted;
  }

  return unquoted;
}

function readCredential(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return "";
}

/** Dummy bcrypt pour aligner le timing quand l’email est inconnu (AUTH-005). */
const DUMMY_PASSWORD_HASH =
  "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWX012345";

const SESSION_MAX_AGE_SEC = 60 * 60 * 12; // 12 h
const SESSION_UPDATE_AGE_SEC = 60 * 60; // 1 h

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SEC,
    updateAge: SESSION_UPDATE_AGE_SEC,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      /**
       * Point unique AUTH-001 : couvre loginAction ET POST /api/auth/callback/credentials.
       */
      async authorize(credentials, request) {
        const email = readCredential(credentials?.email).trim();
        const password = readCredential(credentials?.password);
        const adminEmail = process.env.ADMIN_EMAIL?.trim();
        const adminPasswordHash = readAdminPasswordHash();
        const { ip } = resolveClientIpFromHeaders(request.headers);

        void purgeExpiredLoginAttempts().catch(() => undefined);

        if (email) {
          const decision = await assertLoginAttemptAllowed({
            ipAddress: ip,
            login: email,
          });
          if (!decision.allowed) {
            return null;
          }
        }

        if (!email || !password || !adminEmail || !adminPasswordHash) {
          await bcrypt.compare(password || "x", DUMMY_PASSWORD_HASH);
          if (email) {
            await recordLoginAttempt({
              ipAddress: ip,
              login: email,
              success: false,
            });
          }
          return null;
        }

        const emailMatches = email.toLowerCase() === adminEmail.toLowerCase();
        const hashToCompare = emailMatches
          ? adminPasswordHash
          : DUMMY_PASSWORD_HASH;
        const passwordMatches = await bcrypt.compare(password, hashToCompare);

        if (!emailMatches || !passwordMatches) {
          await recordLoginAttempt({
            ipAddress: ip,
            login: email,
            success: false,
          });
          return null;
        }

        await recordLoginAttempt({
          ipAddress: ip,
          login: email,
          success: true,
        });

        return {
          id: "admin",
          email: adminEmail,
          name: "Administrateur Naxialis",
        };
      },
    }),
  ],
});
