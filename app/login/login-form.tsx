"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-800">
          Email
        </span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-800">
          Mot de passe
        </span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
        />
      </label>

      {state?.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-naxialis px-4 py-2.5 text-sm font-medium text-white hover:bg-naxialis-dark disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
