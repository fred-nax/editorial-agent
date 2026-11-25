"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function InventoryStatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-[#94A3B8] uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[#0F172A]">{value}</p>
    </div>
  );
}

export function InventoryErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </p>
  );
}

export function InventoryListShell({
  loading,
  empty,
  emptyMessage,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
      {loading && empty ? (
        <p className="px-4 py-8 text-sm text-[#64748B]">Chargement…</p>
      ) : empty ? (
        <p className="px-4 py-8 text-sm text-[#64748B]">{emptyMessage}</p>
      ) : (
        children
      )}
    </div>
  );
}

export function InventoryPagination({
  total,
  page,
  pageCount,
  unitLabel = "résultat",
  onPrev,
  onNext,
}: {
  total: number;
  page: number;
  pageCount: number;
  unitLabel?: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const plural = total > 1 ? `${unitLabel}s` : unitLabel;
  return (
    <div className="flex items-center justify-between text-sm text-[#64748B]">
      <p>
        {total} {plural} · page {page}/{pageCount}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={onPrev}
        >
          Précédent
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={onNext}
        >
          Suivant
        </Button>
      </div>
    </div>
  );
}

export function InventorySearchInput({
  value,
  onChange,
  placeholder = "Rechercher titre ou slug…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="sm:max-w-xs"
    />
  );
}

const STATUS_TONE: Record<string, string> = {
  publish: "bg-emerald-50 text-emerald-800",
  published: "bg-emerald-50 text-emerald-800",
  draft: "bg-amber-50 text-amber-800",
  future: "bg-sky-50 text-sky-800",
  private: "bg-violet-50 text-violet-800",
  pending: "bg-orange-50 text-orange-800",
  archived: "bg-slate-100 text-slate-700",
  changed: "bg-sky-50 text-sky-800",
  missing: "bg-rose-50 text-rose-800",
};

export function InventoryStatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_TONE[status] ?? "bg-slate-100 text-slate-700"
      )}
    >
      {label ?? status}
    </span>
  );
}

export function InventorySyncMeta({
  lastFinishedAt,
  lastStatus,
  note,
  lastError,
  extra,
}: {
  lastFinishedAt: string | null;
  lastStatus?: string | null;
  note?: string | null;
  lastError?: string | null;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#475569]">
      <p>
        Dernière sync :{" "}
        {lastFinishedAt
          ? new Date(lastFinishedAt).toLocaleString("fr-FR")
          : "jamais"}
        {lastStatus ? ` (${lastStatus})` : ""}
      </p>
      {lastError ? <p className="mt-1 text-red-700">{lastError}</p> : null}
      {note ? <p className="mt-1 text-[#64748B]">{note}</p> : null}
      {extra}
    </div>
  );
}

export function formatInventoryDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleDateString("fr-FR");
}
