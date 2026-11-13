"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  CircleHelp,
  CircleOff,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { parseResponseJson } from "@/lib/http/parse-response-json";

export type ManagedTheme = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  legacyKey: string | null;
  explorationAngles: unknown;
  defaultQuota: number;
  sortOrder: number;
};

type ThemeFormState = {
  name: string;
  description: string;
  angles: string[];
  defaultQuota: number;
  active: boolean;
};

const EMPTY_FORM: ThemeFormState = {
  name: "",
  description: "",
  angles: [""],
  defaultQuota: 5,
  active: true,
};

function asAngles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function formFromTheme(theme: ManagedTheme): ThemeFormState {
  const angles = asAngles(theme.explorationAngles);
  return {
    name: theme.name,
    description: theme.description ?? "",
    angles: angles.length > 0 ? angles : [""],
    defaultQuota: theme.defaultQuota,
    active: theme.active,
  };
}

function normalizeAngles(angles: string[]): string[] {
  return angles.map((item) => item.trim()).filter(Boolean);
}

function formsEqual(left: ThemeFormState, right: ThemeFormState): boolean {
  return (
    left.name.trim() === right.name.trim() &&
    left.description.trim() === right.description.trim() &&
    left.defaultQuota === right.defaultQuota &&
    left.active === right.active &&
    JSON.stringify(normalizeAngles(left.angles)) ===
      JSON.stringify(normalizeAngles(right.angles))
  );
}

type Props = {
  themes: ManagedTheme[];
  onChanged: () => Promise<void>;
  /** Contrôle externe (ex. depuis Configurer la recherche). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Affiche le bouton déclencheur (défaut : true). */
  showTrigger?: boolean;
};

type PendingNavigation =
  | { type: "select"; themeId: string }
  | { type: "create" }
  | { type: "close" }
  | null;

export function ThemeManagerDialog({
  themes,
  onChanged,
  open: openProp,
  onOpenChange,
  showTrigger = true,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? Boolean(openProp) : uncontrolledOpen;

  function setOpen(next: boolean) {
    if (!isControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  }
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<ThemeFormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<ThemeFormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNavigation>(null);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "form">("list");
  const menuRef = useRef<HTMLDivElement | null>(null);

  const sorted = useMemo(
    () =>
      [...themes].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
      ),
    [themes]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return sorted;
    }
    return sorted.filter((theme) => theme.name.toLowerCase().includes(needle));
  }, [sorted, query]);

  const selected = selectedId
    ? (sorted.find((theme) => theme.id === selectedId) ?? null)
    : null;

  const dirty = !formsEqual(form, baseline);
  const selectedIndex = selected
    ? sorted.findIndex((theme) => theme.id === selected.id)
    : -1;

  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccess(null);
      setSelectedId(null);
      setIsCreating(false);
      setForm(EMPTY_FORM);
      setBaseline(EMPTY_FORM);
      setQuery("");
      setMenuOpen(false);
      setMobilePane("list");
      setPendingNav(null);
      setDiscardOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || isCreating || !selectedId) {
      return;
    }
    const theme = themes.find((item) => item.id === selectedId);
    if (!theme) {
      setSelectedId(null);
      setIsCreating(true);
      setForm(EMPTY_FORM);
      setBaseline(EMPTY_FORM);
      return;
    }
    if (!dirty) {
      const next = formFromTheme(theme);
      setForm(next);
      setBaseline(next);
    }
  }, [themes, selectedId, isCreating, open, dirty]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function applyCreate() {
    setIsCreating(true);
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setError(null);
    setSuccess(null);
    setMenuOpen(false);
    setMobilePane("form");
  }

  function applySelect(themeId: string) {
    const theme = sorted.find((item) => item.id === themeId);
    if (!theme) {
      return;
    }
    const next = formFromTheme(theme);
    setIsCreating(false);
    setSelectedId(theme.id);
    setForm(next);
    setBaseline(next);
    setError(null);
    setSuccess(null);
    setMenuOpen(false);
    setMobilePane("form");
  }

  function requestCreate() {
    if (dirty) {
      setPendingNav({ type: "create" });
      setDiscardOpen(true);
      return;
    }
    applyCreate();
  }

  function requestSelect(themeId: string) {
    if (selectedId === themeId && !isCreating) {
      setMobilePane("form");
      return;
    }
    if (dirty) {
      setPendingNav({ type: "select", themeId });
      setDiscardOpen(true);
      return;
    }
    applySelect(themeId);
  }

  function requestClose(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      return;
    }
    if (dirty) {
      setPendingNav({ type: "close" });
      setDiscardOpen(true);
      return;
    }
    setOpen(false);
  }

  function confirmDiscard() {
    const nav = pendingNav;
    setDiscardOpen(false);
    setPendingNav(null);
    if (!nav) {
      return;
    }
    if (nav.type === "create") {
      applyCreate();
      return;
    }
    if (nav.type === "select") {
      applySelect(nav.themeId);
      return;
    }
    setOpen(false);
  }

  async function saveTheme() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        explorationAngles: normalizeAngles(form.angles),
        defaultQuota: form.defaultQuota,
        active: form.active,
        reactivate: false,
      };
      if (!payload.name) {
        throw new Error("Le nom est obligatoire.");
      }
      const response = selectedId && !isCreating
        ? await fetch(`/api/custom-themes/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/custom-themes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await parseResponseJson<{
        theme?: ManagedTheme;
        error?: string;
      }>(response, "Enregistrement impossible");
      await onChanged();
      if (data.theme) {
        const next = formFromTheme(data.theme);
        setIsCreating(false);
        setSelectedId(data.theme.id);
        setForm(next);
        setBaseline(next);
        setSuccess(
          selectedId && !isCreating
            ? "Thématique enregistrée."
            : "Thématique créée."
        );
      } else {
        setBaseline(form);
        setSuccess("Thématique enregistrée.");
      }
      setMobilePane("form");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d’enregistrement.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    setMenuOpen(false);
    try {
      const response = await fetch(`/api/custom-themes/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !selected.active }),
      });
      await parseResponseJson(response, "Mise à jour impossible");
      await onChanged();
      setForm((prev) => ({ ...prev, active: !selected.active }));
      setBaseline((prev) => ({ ...prev, active: !selected.active }));
      setSuccess(
        selected.active ? "Thématique désactivée." : "Thématique activée."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de statut.");
    } finally {
      setBusy(false);
    }
  }

  async function moveTheme(direction: -1 | 1) {
    if (!selected) {
      return;
    }
    const index = sorted.findIndex((item) => item.id === selected.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) {
      return;
    }
    const next = [...sorted];
    const current = next[index];
    const swap = next[swapIndex];
    if (!current || !swap) {
      return;
    }
    next[index] = swap;
    next[swapIndex] = current;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setMenuOpen(false);
    try {
      const response = await fetch("/api/custom-themes/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((item) => item.id) }),
      });
      await parseResponseJson(response, "Réordonnancement impossible");
      await onChanged();
      setSuccess("Ordre mis à jour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d’ordre.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) {
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/custom-themes/${deleteId}`, {
        method: "DELETE",
      });
      const data = await parseResponseJson<{
        deleted?: boolean;
        deactivated?: boolean;
        reason?: string | null;
      }>(response, "Suppression impossible");
      const removedId = deleteId;
      setDeleteId(null);
      await onChanged();
      if (selectedId === removedId) {
        setSelectedId(null);
        setIsCreating(true);
        setForm(EMPTY_FORM);
        setBaseline(EMPTY_FORM);
        setMobilePane("list");
      }
      setSuccess(
        data.deleted
          ? "Thématique supprimée."
          : data.reason ?? "Thématique désactivée (dépendances détectées)."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de suppression.");
      setDeleteId(null);
    } finally {
      setBusy(false);
    }
  }

  const formTitle = isCreating || !selected
    ? "Nouvelle thématique"
    : "Modifier la thématique";

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        {showTrigger ? (
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-slate-300 bg-white text-slate-700"
              />
            }
          >
            <Settings2 className="size-3.5" aria-hidden />
            Gérer les thématiques
          </DialogTrigger>
        ) : null}

        <DialogContent
          showCloseButton
          className="!max-h-[min(92vh,44rem)] w-[calc(100%-1.5rem)] !max-w-[60rem] gap-0 !overflow-hidden p-0 sm:p-0"
        >
          <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-3.5 sm:px-5">
            <DialogTitle>Thématiques SEO</DialogTitle>
            <DialogDescription>
              Organisez les domaines éditoriaux de votre site.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {(error || success) && (
              <div className="shrink-0 space-y-2 border-b border-slate-100 px-4 py-2 sm:px-5">
                {error ? (
                  <p
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  >
                    {error}
                  </p>
                ) : null}
                {success ? (
                  <p
                    role="status"
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                  >
                    {success}
                  </p>
                ) : null}
              </div>
            )}

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]">
              {/* Liste */}
              <aside
                className={`min-h-0 flex-col border-slate-200 lg:flex lg:border-r ${
                  mobilePane === "list" ? "flex" : "hidden lg:flex"
                }`}
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2.5">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Rechercher…"
                      aria-label="Rechercher une thématique"
                      className="h-8 w-full rounded-md border border-slate-200 bg-white pr-2 pl-8 text-sm outline-none focus-visible:border-[#0F5270] focus-visible:ring-2 focus-visible:ring-[#0F5270]/20"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={requestCreate}
                    disabled={busy}
                    className="shrink-0"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Nouvelle
                  </Button>
                </div>

                <ul
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
                  role="listbox"
                  aria-label="Liste des thématiques"
                >
                  {filtered.length === 0 ? (
                    <li className="px-3 py-8 text-center text-sm text-slate-500">
                      {sorted.length === 0
                        ? "Aucune thématique. Créez la première."
                        : "Aucun résultat pour cette recherche."}
                    </li>
                  ) : (
                    filtered.map((theme) => {
                      const activeRow =
                        !isCreating && selectedId === theme.id;
                      return (
                        <li key={theme.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={activeRow}
                            disabled={busy}
                            onClick={() => requestSelect(theme.id)}
                            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#0F5270]/30 ${
                              activeRow
                                ? "bg-[#0F5270]/10 text-slate-900"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {theme.name}
                            </span>
                            <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                              {theme.defaultQuota}
                            </span>
                            {theme.active ? (
                              <CheckCircle2
                                className="size-3.5 shrink-0 text-emerald-600"
                                aria-label="Active"
                              />
                            ) : (
                              <CircleOff
                                className="size-3.5 shrink-0 text-slate-400"
                                aria-label="Inactive"
                              />
                            )}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </aside>

              {/* Formulaire */}
              <section
                className={`min-h-0 flex-col overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 ${
                  mobilePane === "form" ? "flex" : "hidden lg:flex"
                }`}
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      className="mb-2 text-xs font-medium text-[#0F5270] underline lg:hidden"
                      onClick={() => setMobilePane("list")}
                    >
                      ← Retour à la liste
                    </button>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {formTitle}
                    </h3>
                    {selected && !isCreating ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {selected.legacyKey
                          ? "Thématique historique"
                          : "Thématique personnalisée"}
                        {dirty ? " · modifications non enregistrées" : ""}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Renseignez le nom, les angles et le quota.
                      </p>
                    )}
                  </div>

                  {selected && !isCreating ? (
                    <div className="relative" ref={menuRef}>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label="Actions secondaires"
                        disabled={busy}
                        onClick={() => setMenuOpen((value) => !value)}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                      {menuOpen ? (
                        <div
                          role="menu"
                          className="absolute top-full right-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            disabled={busy || selectedIndex <= 0}
                            onClick={() => void moveTheme(-1)}
                          >
                            <ArrowUp className="size-3.5" aria-hidden />
                            Monter
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            disabled={
                              busy ||
                              selectedIndex < 0 ||
                              selectedIndex >= sorted.length - 1
                            }
                            onClick={() => void moveTheme(1)}
                          >
                            <ArrowDown className="size-3.5" aria-hidden />
                            Descendre
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            disabled={busy}
                            onClick={() => void toggleActive()}
                          >
                            {selected.active ? (
                              <CircleOff className="size-3.5" aria-hidden />
                            ) : (
                              <Circle className="size-3.5" aria-hidden />
                            )}
                            {selected.active ? "Désactiver" : "Activer"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                            disabled={busy}
                            onClick={() => {
                              setMenuOpen(false);
                              setDeleteId(selected.id);
                            }}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                            Supprimer
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {!selected && !isCreating && sorted.length > 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm text-slate-500">
                    Sélectionnez une thématique ou créez-en une nouvelle.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-slate-700">
                        Nom de la thématique *
                      </span>
                      <input
                        value={form.name}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus-visible:border-[#0F5270] focus-visible:ring-2 focus-visible:ring-[#0F5270]/20"
                        maxLength={120}
                        placeholder="Ex. Cybersécurité"
                        disabled={busy}
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-slate-700">
                        Description
                      </span>
                      <textarea
                        value={form.description}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                        className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus-visible:border-[#0F5270] focus-visible:ring-2 focus-visible:ring-[#0F5270]/20"
                        maxLength={500}
                        placeholder="Sécurité des sites, API et applications métiers"
                        disabled={busy}
                      />
                    </label>

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-slate-700">
                        Angles éditoriaux
                      </legend>
                      <div className="space-y-2">
                        {form.angles.map((angle, index) => (
                          <div
                            key={`angle-${index}`}
                            className="flex items-center gap-2"
                          >
                            <input
                              value={angle}
                              onChange={(event) => {
                                const next = [...form.angles];
                                next[index] = event.target.value;
                                setForm((prev) => ({ ...prev, angles: next }));
                              }}
                              className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:border-[#0F5270] focus-visible:ring-2 focus-visible:ring-[#0F5270]/20"
                              placeholder="Ex. Audits et conformité"
                              maxLength={120}
                              disabled={busy}
                              aria-label={`Angle ${index + 1}`}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy || form.angles.length <= 1}
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  angles: prev.angles.filter(
                                    (_, i) => i !== index
                                  ),
                                }))
                              }
                            >
                              Retirer
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || form.angles.length >= 20}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            angles: [...prev.angles, ""],
                          }))
                        }
                      >
                        Ajouter un angle
                      </Button>
                    </fieldset>

                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col gap-1.5 text-sm">
                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor="theme-default-quota"
                            className="font-medium text-slate-700"
                          >
                            Quota par défaut
                          </label>
                          <TooltipProvider delay={200}>
                            <Tooltip>
                              <TooltipTrigger
                                type="button"
                                delay={200}
                                closeOnClick={false}
                                className="inline-flex size-5 items-center justify-center rounded text-slate-400 outline-none transition-colors hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-[#0F5270]/30"
                                aria-label="À propos du quota par défaut"
                              >
                                <CircleHelp className="size-3.5" aria-hidden />
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                sideOffset={6}
                                className="z-[60] max-w-[280px] flex-col items-start gap-1.5 whitespace-normal border border-slate-200 bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-slate-700 shadow-md [&>*:last-child]:border [&>*:last-child]:border-r-0 [&>*:last-child]:border-b-0 [&>*:last-child]:border-slate-200 [&>*:last-child]:bg-white [&>*:last-child]:fill-white"
                              >
                                <span className="font-semibold text-slate-900">
                                  À quoi sert le quota ?
                                </span>
                                <span>
                                  Nombre cible d’opportunités SEO à générer pour
                                  cette thématique lors d’une recherche.
                                </span>
                                <span>
                                  Exemple : avec un quota de 5, l’application
                                  cherche à produire 5 opportunités. Le résultat
                                  final peut être inférieur après validation et
                                  détection des doublons.
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <input
                          id="theme-default-quota"
                          type="number"
                          min={0}
                          max={20}
                          value={form.defaultQuota}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              defaultQuota: Number(event.target.value) || 0,
                            }))
                          }
                          className="h-9 w-28 rounded-md border border-slate-300 bg-white px-3 outline-none focus-visible:border-[#0F5270] focus-visible:ring-2 focus-visible:ring-[#0F5270]/20"
                          disabled={busy}
                        />
                      </div>
                      <label className="flex items-center gap-2 pb-1.5 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.active}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              active: event.target.checked,
                            }))
                          }
                          disabled={busy}
                          className="size-4 rounded border-slate-300"
                        />
                        Thématique active
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                      <Button
                        type="button"
                        disabled={busy || !dirty}
                        className="bg-naxialis text-white hover:bg-naxialis-dark"
                        onClick={() => void saveTheme()}
                      >
                        {busy
                          ? "Enregistrement…"
                          : isCreating || !selected
                            ? "Créer"
                            : "Enregistrer"}
                      </Button>
                      {dirty ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setForm(baseline);
                            setError(null);
                          }}
                        >
                          Annuler les modifications
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteId)}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette thématique ?</AlertDialogTitle>
            <AlertDialogDescription>
              Si elle est liée à des opportunités ou des recherches, elle sera
              seulement désactivée. Aucune opportunité ne sera effacée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-red-700 text-white hover:bg-red-800"
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={discardOpen}
        onOpenChange={(next) => {
          if (!next) {
            setDiscardOpen(false);
            setPendingNav(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Des changements non enregistrés seront perdus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer l’édition</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Abandonner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
