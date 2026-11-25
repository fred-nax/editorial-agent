"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Eye,
  Lightbulb,
  Loader2,
  Pencil,
  SquarePen,
  Trash2,
} from "lucide-react";
import { EditorialRapprochementPanel } from "@/components/EditorialRapprochementPanel";
import {
  WebflowRefsFields,
  type WebflowRefsSelection,
} from "@/components/cms/WebflowRefsFields";
import { TopicStatusBadge } from "@/components/dashboard/status-badge";
import { TitleSuggestionsPicker } from "@/components/TitleSuggestionsPicker";
import { useWorkspaceOptional } from "@/components/workspace";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import type { TopicStatus } from "@/lib/status";
import { transmitsVeilleContext } from "@/lib/topics/build-generation-context";
import type { TitleSuggestion } from "@/lib/titles/types";

export type TopicListItem = {
  id: string;
  subject: string;
  status: TopicStatus;
  priority: number;
  notes: string | null;
  category: string | null;
  angle: string | null;
  origin?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceName?: string | null;
  sourcePublishedOn?: string | null;
  sourceKind?: string | null;
  webflowCategoryItemId?: string | null;
  webflowAuthorItemId?: string | null;
  createdAt: Date | string;
  /** Génération associée la plus pertinente (terminée de préférence). */
  articleId?: string | null;
};

const priorityLabel: Record<number, string> = {
  0: "Basse",
  1: "Haute",
  2: "Normale",
  3: "Normale",
};

type StatusFilter = "all" | TopicStatus;

function buildWriteHref(topic: TopicListItem, preferredTitle?: string) {
  const params = new URLSearchParams({ topicId: topic.id });
  const title = preferredTitle?.trim();
  if (title) {
    params.set("preferredTitle", title);
  }
  return `/articles/new?${params.toString()}`;
}

export function TopicQueue({ topics }: { topics: TopicListItem[] }) {
  const router = useRouter();
  const workspaceCtx = useWorkspaceOptional();
  const workspaceFetch = workspaceCtx?.workspaceFetch ?? fetch;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editTopic, setEditTopic] = useState<TopicListItem | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editAngle, setEditAngle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editWebflowRefs, setEditWebflowRefs] = useState<WebflowRefsSelection>({
    categoryItemId: "",
    authorItemId: "",
  });
  const isWebflowWorkspace = workspaceCtx?.active?.cmsProvider === "webflow";
  const [editPriority, setEditPriority] = useState("0");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [titleSuggestions, setTitleSuggestions] = useState<
    TitleSuggestion[] | null
  >(null);
  const [titleSuggestBusy, setTitleSuggestBusy] = useState(false);
  const [titleSuggestError, setTitleSuggestError] = useState<string | null>(
    null
  );
  const [leaveAgentTitle, setLeaveAgentTitle] = useState(true);
  const [preferredTitle, setPreferredTitle] = useState("");
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<
    number | null
  >(null);

  const [deleteTopic, setDeleteTopic] = useState<TopicListItem | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return topics.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        item.subject.toLowerCase().includes(needle) ||
        (item.angle?.toLowerCase().includes(needle) ?? false) ||
        (item.notes?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [topics, query, statusFilter]);

  function openEdit(topic: TopicListItem) {
    setEditTopic(topic);
    setEditSubject(topic.subject);
    setEditAngle(topic.angle ?? "");
    setEditNotes(topic.notes ?? "");
    setEditWebflowRefs({
      categoryItemId: topic.webflowCategoryItemId?.trim() ?? "",
      authorItemId: topic.webflowAuthorItemId?.trim() ?? "",
    });
    setEditPriority(
      topic.priority === 1 ? "1" : topic.priority === 0 ? "0" : "2"
    );
    setEditError(null);
    setTitleSuggestions(null);
    setTitleSuggestError(null);
    setTitleSuggestBusy(false);
    setLeaveAgentTitle(true);
    setPreferredTitle("");
    setSelectedSuggestionIndex(null);
  }

  function clearTitleSelection() {
    setLeaveAgentTitle(true);
    setPreferredTitle("");
    setSelectedSuggestionIndex(null);
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = subject.trim();
    if (!value) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await workspaceFetch("/api/topics", {
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
      const response = await workspaceFetch(`/api/topics/${id}`, {
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

  async function confirmDeleteTopic() {
    if (!deleteTopic) {
      return;
    }
    const id = deleteTopic.id;
    setPendingId(id);
    setError(null);
    try {
      const response = await workspaceFetch(`/api/topics/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible de supprimer le sujet.");
      }
      setDeleteTopic(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
      setDeleteTopic(null);
    } finally {
      setPendingId(null);
    }
  }

  async function saveEdit(options?: { thenWrite?: boolean }) {
    if (!editTopic) {
      return;
    }
    const value = editSubject.trim();
    if (!value) {
      setEditError("Le sujet est obligatoire.");
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const response = await workspaceFetch(`/api/topics/${editTopic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: value,
          angle: editAngle.trim() || null,
          notes: editNotes.trim() || null,
          priority: Number(editPriority),
          ...(isWebflowWorkspace
            ? {
                webflowCategoryItemId: editWebflowRefs.categoryItemId || null,
                webflowAuthorItemId: editWebflowRefs.authorItemId || null,
              }
            : {}),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Impossible d’enregistrer le sujet.");
      }
      const href = buildWriteHref(
        { ...editTopic, subject: value },
        leaveAgentTitle ? undefined : preferredTitle
      );
      setEditTopic(null);
      if (options?.thenWrite) {
        router.push(href);
        return;
      }
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setEditSaving(false);
    }
  }

  async function requestTitleSuggestions() {
    const value = editSubject.trim();
    if (!value || titleSuggestBusy) {
      return;
    }
    setTitleSuggestBusy(true);
    setTitleSuggestError(null);
    clearTitleSelection();
    try {
      const body: Record<string, string> = { subject: value };
      if (editAngle.trim()) {
        body.angle = editAngle.trim();
      }
      const response = await workspaceFetch("/api/titles/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        suggestions?: TitleSuggestion[];
        error?: string;
      };
      if (!response.ok || !payload.suggestions) {
        throw new Error(payload.error ?? "Impossible de suggérer des titres.");
      }
      setTitleSuggestions(payload.suggestions);
    } catch (err) {
      setTitleSuggestError(
        err instanceof Error ? err.message : "Suggestion impossible."
      );
    } finally {
      setTitleSuggestBusy(false);
    }
  }

  function writeHrefFor(topic: TopicListItem) {
    const title =
      editTopic?.id === topic.id && !leaveAgentTitle
        ? preferredTitle
        : undefined;
    return buildWriteHref(topic, title);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setError(null);
          }}
          placeholder="Ajouter un sujet à la file"
          className="min-w-0 flex-1 border-[#E2E8F0] bg-white"
        />
        <Button
          type="submit"
          disabled={submitting}
          className="bg-naxialis text-white hover:bg-naxialis-dark"
        >
          {submitting ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : null}
          Ajouter
        </Button>
      </form>

      <EditorialRapprochementPanel
        subject={subject}
        layout="full"
        disabled={submitting}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un sujet"
          className="min-w-0 flex-1 border-[#E2E8F0] bg-white"
        />
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setStatusFilter(value as StatusFilter);
            }
          }}
        >
          <SelectTrigger className="h-9 w-full border-[#E2E8F0] bg-white sm:w-48">
            <SelectValue placeholder="Filtrer" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="generating">Génération</SelectItem>
            <SelectItem value="completed">Terminés</SelectItem>
            <SelectItem value="archived">Archivés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-8 text-center text-sm text-slate-500">
          Aucun sujet dans la file pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          {filtered.map((topic) => {
            const busy = pendingId === topic.id;
            const canEdit = topic.status === "pending";
            const canDelete =
              (topic.status === "pending" || topic.status === "archived") &&
              !topic.articleId;
            const canArchive =
              topic.status === "pending" || topic.status === "completed";
            const canWrite = topic.status === "pending";
            const canView = topic.status === "completed" && Boolean(topic.articleId);

            return (
              <li
                key={topic.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0F172A]">
                    {topic.subject}
                    {topic.origin === "veille" ? (
                      <span className="ml-2 align-middle rounded-full border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Veille éditoriale
                      </span>
                    ) : null}
                  </p>
                  {transmitsVeilleContext(topic) ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Contexte de veille transmis à l'agent
                    </p>
                  ) : null}
                  {topic.origin === "veille" ? (
                    <div className="mt-1 space-y-1 text-xs text-slate-600">
                      <p className="text-slate-500">
                        {formatDate(topic.createdAt)}
                      </p>
                      {topic.angle ? <p>Angle : {topic.angle}</p> : null}
                      {topic.notes ? <p>{topic.notes}</p> : null}
                      {topic.sourceUrl ? (
                        <a
                          href={topic.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-naxialis underline-offset-2 hover:underline"
                        >
                          {topic.sourceName || "Publication source"}
                          {topic.sourceTitle ? ` — ${topic.sourceTitle}` : ""}
                        </a>
                      ) : null}
                      {topic.sourcePublishedOn ? (
                        <p>Publication vérifiée : {topic.sourcePublishedOn}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(topic.createdAt)}
                      {topic.angle ? ` · ${topic.angle}` : ""}
                      {topic.notes ? ` · ${topic.notes}` : ""}
                      {topic.category ? ` · ${topic.category}` : ""}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="rounded-full border border-[#E2E8F0] bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                    Priorité {priorityLabel[topic.priority] ?? topic.priority}
                  </span>
                  <TopicStatusBadge status={topic.status} />

                  {canEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#E2E8F0] bg-white"
                      disabled={busy}
                      onClick={() => openEdit(topic)}
                    >
                      <Pencil data-icon="inline-start" />
                      Modifier
                    </Button>
                  ) : null}

                  {canWrite ? (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-naxialis text-white hover:bg-naxialis-dark"
                      disabled={busy}
                      nativeButton={false}
                      render={<Link href={writeHrefFor(topic)} />}
                    >
                      <SquarePen data-icon="inline-start" />
                      Rédiger
                    </Button>
                  ) : null}

                  {canView ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#E2E8F0] bg-white"
                      nativeButton={false}
                      render={<Link href={`/articles/${topic.articleId}`} />}
                    >
                      <Eye data-icon="inline-start" />
                      Voir l&apos;article
                    </Button>
                  ) : null}

                  {canArchive ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#E2E8F0] bg-white"
                      disabled={busy}
                      onClick={() => void archiveTopic(topic.id)}
                    >
                      <Archive data-icon="inline-start" />
                      Archiver
                    </Button>
                  ) : null}

                  {canDelete ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                      disabled={busy}
                      onClick={() => setDeleteTopic(topic)}
                    >
                      <Trash2 data-icon="inline-start" />
                      Supprimer
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={Boolean(editTopic)}
        onOpenChange={(open) => {
          if (!open) {
            setEditTopic(null);
          }
        }}
      >
        <DialogContent className="max-w-lg gap-4">
          <DialogHeader>
            <DialogTitle>Modifier le sujet</DialogTitle>
            <DialogDescription>
              Ajustez le sujet, la priorité et, si besoin, un titre souhaité avant
              rédaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="topic-edit-subject">Sujet</Label>
              <Textarea
                id="topic-edit-subject"
                value={editSubject}
                onChange={(event) => setEditSubject(event.target.value)}
                rows={3}
                disabled={editSaving}
                className="border-[#E2E8F0] bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Priorité</Label>
              <Select
                value={editPriority}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setEditPriority(value);
                  }
                }}
                disabled={editSaving}
              >
                <SelectTrigger className="h-9 w-full border-[#E2E8F0] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Haute</SelectItem>
                  <SelectItem value="2">Normale</SelectItem>
                  <SelectItem value="0">Basse</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic-edit-angle">
                Angle{" "}
                <span className="font-normal text-slate-500">(facultatif)</span>
              </Label>
              <Textarea
                id="topic-edit-angle"
                value={editAngle}
                onChange={(event) => setEditAngle(event.target.value)}
                rows={2}
                disabled={editSaving}
                className="border-[#E2E8F0] bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic-edit-notes">
                Notes{" "}
                <span className="font-normal text-slate-500">(facultatif)</span>
              </Label>
              <Textarea
                id="topic-edit-notes"
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
                rows={2}
                disabled={editSaving}
                className="border-[#E2E8F0] bg-white"
              />
            </div>

            {isWebflowWorkspace && editTopic ? (
              <WebflowRefsFields
                value={editWebflowRefs}
                onChange={setEditWebflowRefs}
                initialCategoryItemId={editTopic.webflowCategoryItemId}
                initialAuthorItemId={editTopic.webflowAuthorItemId}
                disabled={editSaving}
              />
            ) : null}

            <div className="space-y-3 rounded-lg border border-[#E2E8F0] bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[#0F172A]">
                  Suggestions de titres
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[#E2E8F0] bg-white"
                  disabled={editSaving || titleSuggestBusy || !editSubject.trim()}
                  onClick={() => void requestTitleSuggestions()}
                >
                  {titleSuggestBusy ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Lightbulb data-icon="inline-start" />
                  )}
                  {titleSuggestions
                    ? "Régénérer"
                    : "Suggérer 5 titres"}
                </Button>
              </div>
              <TitleSuggestionsPicker
                formId="topic-edit"
                radioName="topic-edit-title-choice"
                busy={editSaving}
                titleSuggestBusy={titleSuggestBusy}
                titleSuggestError={titleSuggestError}
                suggestionsStale={false}
                titleSuggestions={titleSuggestions}
                leaveAgentTitle={leaveAgentTitle}
                preferredTitle={preferredTitle}
                selectedSuggestionIndex={selectedSuggestionIndex}
                onClearSelection={clearTitleSelection}
                onSelectSuggestion={(index, title) => {
                  setLeaveAgentTitle(false);
                  setSelectedSuggestionIndex(index);
                  setPreferredTitle(title);
                }}
                onPreferredTitleChange={(value) => {
                  setPreferredTitle(value);
                  setSelectedSuggestionIndex(null);
                  setLeaveAgentTitle(false);
                }}
              />
            </div>

            {editError ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {editError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              className="bg-naxialis text-white hover:bg-naxialis-dark"
              disabled={editSaving}
              onClick={() => void saveEdit({ thenWrite: true })}
            >
              {editSaving ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <SquarePen data-icon="inline-start" />
              )}
              Enregistrer et rédiger
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="border-[#E2E8F0] bg-white"
                disabled={editSaving}
                onClick={() => setEditTopic(null)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-[#E2E8F0] bg-white"
                disabled={editSaving}
                onClick={() => void saveEdit()}
              >
                {editSaving ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : null}
                Enregistrer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTopic)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTopic(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce sujet ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera définitivement le sujet de votre file
              éditoriale. Elle ne pourra pas être annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={Boolean(pendingId)}
              onClick={() => void confirmDeleteTopic()}
            >
              {pendingId ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Trash2 data-icon="inline-start" />
              )}
              Supprimer le sujet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
