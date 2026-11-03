import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
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
      async authorize(credentials) {
        const email = readCredential(credentials?.email).trim();
        const password = readCredential(credentials?.password);
        const adminEmail = process.env.ADMIN_EMAIL?.trim();
        const adminPasswordHash = readAdminPasswordHash();

        if (!email || !password || !adminEmail || !adminPasswordHash) {
          return null;
        }

        if (email.toLowerCase() !== adminEmail.toLowerCase()) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(password, adminPasswordHash);
        if (!passwordMatches) {
          return null;
        }

        return {
          id: "admin",
          email: adminEmail,
          name: "Administrateur Naxialis",
        };
      },
    }),
  ],
});
