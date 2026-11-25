"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  WORKSPACE_BROADCAST_CHANNEL,
  WORKSPACE_REQUEST_HEADER,
  WORKSPACE_SWITCH_STORAGE_KEY,
} from "@/lib/workspace/client-constants";
import type { WorkspaceBootstrap, WorkspaceView } from "./types";

type WorkspaceContextValue = {
  workspaces: WorkspaceView[];
  active: WorkspaceView;
  switching: boolean;
  /** Epoch incrémenté à chaque changement — annuler les réponses tardives. */
  epoch: number;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  /**
   * fetch scoppé : en-tête workspace + AbortController lié à l’epoch courant.
   * Ignore les réponses si l’espace a changé entre-temps.
   */
  workspaceFetch: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

type SwitchMessage = {
  type: "workspace-switched";
  workspaceId: string;
  at: number;
};

function readStorageSignal(): SwitchMessage | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_SWITCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SwitchMessage;
    if (parsed?.type !== "workspace-switched" || !parsed.workspaceId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStorageSignal(workspaceId: string) {
  const payload: SwitchMessage = {
    type: "workspace-switched",
    workspaceId,
    at: Date.now(),
  };
  try {
    localStorage.setItem(WORKSPACE_SWITCH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: WorkspaceBootstrap;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspaces, setWorkspaces] = useState(initial.workspaces);
  const [active, setActive] = useState(initial.active);
  const [switching, setSwitching] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const activeIdRef = useRef(active.id);
  const epochRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    activeIdRef.current = active.id;
  }, [active.id]);

  // Resync après router.refresh() (ex. langue d’espace mise à jour en Paramètres).
  useEffect(() => {
    setWorkspaces(initial.workspaces);
    setActive((current) => {
      if (current.id !== initial.active.id) {
        return current;
      }
      if (
        current.defaultLanguage === initial.active.defaultLanguage &&
        current.name === initial.active.name &&
        current.siteLabel === initial.active.siteLabel &&
        current.siteUrl === initial.active.siteUrl
      ) {
        return current;
      }
      return initial.active;
    });
  }, [initial.active, initial.workspaces]);

  const bumpEpoch = useCallback(() => {
    epochRef.current += 1;
    setEpoch(epochRef.current);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
  }, []);

  const applyRemoteSwitch = useCallback(
    (workspaceId: string) => {
      if (workspaceId === activeIdRef.current) {
        return;
      }
      const next = workspaces.find((w) => w.id === workspaceId);
      if (!next) {
        return;
      }
      bumpEpoch();
      setActive(next);
      // Remise à zéro visuelle : revenir au dashboard de l’espace.
      if (pathname !== "/dashboard") {
        router.replace("/dashboard");
      } else {
        router.refresh();
      }
    },
    [bumpEpoch, pathname, router, workspaces]
  );

  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(WORKSPACE_BROADCAST_CHANNEL)
        : null;

    function onMessage(event: MessageEvent<SwitchMessage>) {
      if (event.data?.type === "workspace-switched" && event.data.workspaceId) {
        applyRemoteSwitch(event.data.workspaceId);
      }
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== WORKSPACE_SWITCH_STORAGE_KEY || !event.newValue) {
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue) as SwitchMessage;
        if (parsed?.type === "workspace-switched" && parsed.workspaceId) {
          applyRemoteSwitch(parsed.workspaceId);
        }
      } catch {
        // ignore
      }
    }

    channel?.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);

    // Alignement au montage si un autre onglet a basculé pendant l’hydratation.
    const signal = readStorageSignal();
    if (signal && signal.workspaceId !== activeIdRef.current) {
      // Cookie partagé : refresh pour resynchroniser le HTML serveur.
      applyRemoteSwitch(signal.workspaceId);
    }

    return () => {
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [applyRemoteSwitch]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      if (switching || workspaceId === activeIdRef.current) {
        return;
      }
      const next = workspaces.find(
        (w) => w.id === workspaceId || w.slug === workspaceId
      );
      if (!next) {
        return;
      }

      setSwitching(true);
      bumpEpoch();
      try {
        const response = await fetch("/api/workspace", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: next.id }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          active?: WorkspaceView;
          error?: string;
        };
        if (!response.ok || !payload.active) {
          throw new Error(payload.error ?? "Changement d’espace impossible.");
        }

        setActive(payload.active);
        writeStorageSignal(payload.active.id);
        try {
          const channel = new BroadcastChannel(WORKSPACE_BROADCAST_CHANNEL);
          channel.postMessage({
            type: "workspace-switched",
            workspaceId: payload.active.id,
            at: Date.now(),
          } satisfies SwitchMessage);
          channel.close();
        } catch {
          // BroadcastChannel indisponible
        }

        // Toujours rediriger vers le dashboard de l’espace sélectionné.
        if (pathname !== "/dashboard") {
          router.replace("/dashboard");
        }
        router.refresh();
      } catch (error) {
        // Restaure l’epoch sans changer l’espace affiché.
        console.error(error);
        throw error;
      } finally {
        setSwitching(false);
      }
    },
    [bumpEpoch, pathname, router, switching, workspaces]
  );

  const workspaceFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const startedEpoch = epochRef.current;
      const workspaceId = activeIdRef.current;
      const headers = new Headers(init?.headers);
      headers.set(WORKSPACE_REQUEST_HEADER, workspaceId);
      if (!abortRef.current) {
        abortRef.current = new AbortController();
      }
      const response = await fetch(input, {
        ...init,
        headers,
        credentials: init?.credentials ?? "same-origin",
        signal: abortRef.current.signal,
      });

      if (startedEpoch !== epochRef.current || workspaceId !== activeIdRef.current) {
        throw new DOMException("Workspace context changed", "AbortError");
      }
      return response;
    },
    []
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      active,
      switching,
      epoch,
      switchWorkspace,
      workspaceFetch,
    }),
    [workspaces, active, switching, epoch, switchWorkspace, workspaceFetch]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace doit être utilisé dans WorkspaceProvider.");
  }
  return ctx;
}

/** Variante douce pour composants optionnels (hors shell protégé). */
export function useWorkspaceOptional(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
