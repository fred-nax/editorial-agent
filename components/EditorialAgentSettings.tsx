"use client";

import { useEffect, useState } from "react";
import { MAX_INSTRUCTION_LENGTH } from "@/lib/agent/instructions";

type EditorialAgentView = {
  id: string;
  name: string | null;
  instructions: string;
  updatedAt: string | null;
};

type AgentResponse = {
  agent?: EditorialAgentView;
  error?: string;
};

function formatUpdatedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function readAgentResponse(response: Response): Promise<AgentResponse> {
  const text = await response.text();
  if (!text) {
    return { error: `Réponse vide (HTTP ${response.status}).` };
  }
  try {
    const payload = JSON.parse(text) as AgentResponse;
    if (!response.ok) {
      return { error: payload.error ?? "La requête a échoué." };
    }
    return payload;
  } catch {
    return { error: "Réponse invalide du serveur." };
  }
}

export function EditorialAgentSettings() {
  const [agent, setAgent] = useState<EditorialAgentView | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/agent/instructions", {
          method: "GET",
          credentials: "same-origin",
        });
        const payload = await readAgentResponse(response);
        if (cancelled) {
          return;
        }
        if (!payload.agent) {
          setError(payload.error ?? "Impossible de lire les instructions.");
          return;
        }
        setAgent(payload.agent);
        setDraft(payload.agent.instructions);
      } catch {
        if (!cancelled) {
          setError("Impossible de lire les instructions.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = agent !== null && draft !== agent.instructions;
  const updatedLabel = formatUpdatedAt(agent?.updatedAt ?? null);

  async function save() {
    if (!agent || saving || !dirty) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/agent/instructions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: draft }),
      });
      const payload = await readAgentResponse(response);
      if (!payload.agent) {
        setError(payload.error ?? "L’enregistrement a échoué.");
        return;
      }
      setAgent(payload.agent);
      setDraft(payload.agent.instructions);
      setNotice("Instructions enregistrées.");
    } catch {
      setError("L’enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdits() {
    if (!agent) {
      return;
    }
    setDraft(agent.instructions);
    setNotice(null);
    setError(null);
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          Agent éditorial
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Les instructions sont lues et enregistrées directement sur l’agent
          OpenAI configuré. Aucune copie n’est conservée dans l’application.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement des instructions…</p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {dirty ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Des modifications ne sont pas enregistrées.
        </p>
      ) : null}

      {agent ? (
        <div className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-800">Nom</dt>
              <dd className="mt-1 text-sm text-slate-700">
                {agent.name?.trim() ? agent.name : "Sans nom"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-800">
                Identifiant
              </dt>
              <dd className="mt-1">
                <input
                  value={agent.id}
                  readOnly
                  aria-label="Identifiant de l’agent"
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600"
                />
              </dd>
            </div>
          </dl>

          {updatedLabel ? (
            <p className="text-xs text-slate-500">
              Dernière mise à jour chez OpenAI : {updatedLabel}
            </p>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-800">
              Instructions
            </span>
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setNotice(null);
              }}
              rows={18}
              disabled={saving}
              spellCheck
              aria-label="Instructions de l’agent éditorial"
              className="min-h-72 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 text-slate-900 outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20 disabled:bg-slate-50"
            />
            <span className="mt-1 block text-xs text-slate-500">
              {draft.length.toLocaleString("fr-FR")} /{" "}
              {MAX_INSTRUCTION_LENGTH.toLocaleString("fr-FR")} caractères
            </span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="inline-flex items-center justify-center rounded-md bg-naxialis px-4 py-2.5 text-sm font-medium text-white hover:bg-naxialis-dark disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer les instructions"}
            </button>
            <button
              type="button"
              onClick={cancelEdits}
              disabled={!dirty || saving}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              Annuler les modifications
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
