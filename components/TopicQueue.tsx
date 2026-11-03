"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArticleStatus } from "@/components/ArticleStatus";
import { formatDate } from "@/lib/format";
import type { TopicStatus } from "@/lib/status";

export type TopicListItem = {
  id: string;
  subject: string;
  status: TopicStatus;
  priority: number;
  notes: string | null;
  category: string | null;
  angle: string | null;
  createdAt: Date | string;
};

const priorityLabel: Record<number, string> = {
  0: "Basse",
  1: "Haute",
  2: "Normale",
  3: "Normale",
};

export function TopicQueue({ topics }: { topics: TopicListItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return topics;
    }
    return topics.filter((item) =>
      item.subject.toLowerCase().includes(needle)
    );
  }, [topics, query]);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = subject.trim();
    if (!value) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: value }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d’ajouter le sujet.");
      }

      setSubject("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function archiveTopic(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/topics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d’archiver le sujet.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteTopic(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/topics/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible de supprimer le sujet.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setPendingId(null);
    }
  }

  async function generateTopic(topic: TopicListItem) {
    setPendingId(topic.id);
    setError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Impossible de lancer la génération.");
      }
      router.push(`/articles/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setError(null);
          }}
          placeholder="Ajouter un sujet à la file"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-naxialis px-4 py-2 text-sm font-medium text-white hover:bg-naxialis-dark disabled:opacity-60"
        >
          Ajouter
        </button>
      </form>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher un sujet"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
      />

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Aucun sujet dans la file pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {filtered.map((topic) => (
            <li
              key={topic.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {topic.subject}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(topic.createdAt)}
                  {topic.notes ? ` · ${topic.notes}` : ""}
                  {topic.category ? ` · ${topic.category}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                  Priorité {priorityLabel[topic.priority] ?? topic.priority}
                </span>
                <ArticleStatus status={topic.status} />
                {topic.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      disabled={pendingId === topic.id}
                      onClick={() => archiveTopic(topic.id)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Archiver
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === topic.id}
                      onClick={() => deleteTopic(topic.id)}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Supprimer
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === topic.id}
                      onClick={() => generateTopic(topic)}
                      className="rounded-md border border-naxialis/30 bg-naxialis/5 px-3 py-1.5 text-xs font-medium text-naxialis hover:bg-naxialis/10 disabled:opacity-60"
                    >
                      Générer
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-400"
                  >
                    Générer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
