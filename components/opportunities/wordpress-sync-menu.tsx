"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  disabled?: boolean;
  syncing?: boolean;
  onIncremental: () => void;
  onFull: () => void;
};

export function WordPressSyncMenu({
  disabled,
  syncing,
  onIncremental,
  onFull,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="h-9 gap-1.5 border-slate-300 bg-white text-slate-700"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <RefreshCw
          className={`size-3.5 ${syncing ? "animate-spin" : ""}`}
          aria-hidden
        />
        {syncing ? "Sync en cours…" : "Synchroniser"}
      </Button>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-[15rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg sm:left-0 sm:right-auto"
        >
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            className="flex w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => {
              setMenuOpen(false);
              onIncremental();
            }}
          >
            Synchronisation incrémentale
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            className="flex w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => {
              setMenuOpen(false);
              onFull();
            }}
          >
            Synchronisation complète
          </button>
        </div>
      ) : null}
    </div>
  );
}
