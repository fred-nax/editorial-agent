"use client";

import { useState } from "react";

export function CopySessionId({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Session OpenAI</h3>
      <p className="mt-2 font-mono text-xs break-all text-slate-700">
        {value ?? "—"}
      </p>
      {value ? (
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-3 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naxialis"
        >
          {copied ? "Copié" : "Copier l'identifiant"}
        </button>
      ) : null}
      <p className="sr-only" role="status">
        {copied ? "Identifiant copié." : ""}
      </p>
    </div>
  );
}
