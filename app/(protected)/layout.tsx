import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { SignOutButton } from "@/components/SignOutButton";

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

  return (
    <AppShell
      userName={session.user.name ?? "Administrateur Naxialis"}
      userEmail={session.user.email}
      signOutButton={<SignOutButton />}
    >
      {children}
    </AppShell>
  );
}
