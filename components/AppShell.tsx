"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppShell({
  children,
  userName,
  userEmail,
  signOutButton,
}: {
  children: ReactNode;
  userName: string;
  userEmail?: string | null;
  signOutButton: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          userName={userName}
          userEmail={userEmail}
          signOutButton={signOutButton}
        />
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
