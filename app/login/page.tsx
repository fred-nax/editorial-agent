import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Connexion",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium tracking-wide text-naxialis-muted uppercase">
            Naxialis
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Content Agent
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Back-office éditorial privé. Un seul compte administrateur.
          </p>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Se connecter
          </h2>
          <LoginForm />
        </section>
      </div>
    </div>
  );
}
