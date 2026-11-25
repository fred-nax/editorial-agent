import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { SignOutButton } from "@/components/SignOutButton";
import { WorkspaceProvider } from "@/components/workspace";
import {
  listEnabledWorkspaces,
  resolveActiveWorkspace,
  WorkspaceContextError,
  WORKSPACE_IDS,
  requireWorkspace,
  buildWorkspaceCookieOptions,
} from "@/lib/workspace";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const workspaces = await listEnabledWorkspaces();
  let active;
  try {
    active = await resolveActiveWorkspace();
  } catch (error) {
    // Cookie invalide / manipulé : rebascule sur WordPress et réécrit le cookie.
    if (
      error instanceof WorkspaceContextError &&
      error.code === "WORKSPACE_NOT_FOUND"
    ) {
      active = await requireWorkspace(WORKSPACE_IDS.wordpress);
      const jar = await cookies();
      const opts = buildWorkspaceCookieOptions(active.id);
      jar.set(opts.name, opts.value, {
        httpOnly: opts.httpOnly,
        sameSite: opts.sameSite,
        path: opts.path,
        maxAge: opts.maxAge,
        secure: opts.secure,
      });
    } else {
      throw error;
    }
  }

  return (
    <WorkspaceProvider
      initial={{
        workspaces,
        active,
      }}
    >
      <AppShell
        userName={session.user.name ?? "Administrateur Naxialis"}
        userEmail={session.user.email}
        signOutButton={<SignOutButton />}
      >
        {children}
      </AppShell>
    </WorkspaceProvider>
  );
}
