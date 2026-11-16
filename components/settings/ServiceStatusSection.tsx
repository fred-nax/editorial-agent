"use client";

import type { ServiceHealthStatus } from "@/lib/config-status";

export type ServiceStatusView = {
  label: string;
  status: ServiceHealthStatus;
  detail?: string | null;
};

function statusLabel(status: ServiceHealthStatus, label: string): string {
  switch (status) {
    case "connected":
      return "Connecté";
    case "configured":
      return label === "Authentification" ? "Configurée" : "Configuré";
    case "error":
      return "Erreur";
    default:
      return "Non configuré";
  }
}

function statusClass(status: ServiceHealthStatus): string {
  switch (status) {
    case "connected":
      return "text-emerald-700";
    case "configured":
      return "text-sky-700";
    case "error":
      return "text-red-700";
    default:
      return "text-amber-700";
  }
}

export function ServiceStatusSection({
  services,
}: {
  services: ServiceStatusView[];
}) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          État des services
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Indicateurs locaux — aucune sonde externe à chaque affichage. Utilisez
          « Tester la connexion » pour vérifier OpenAI ou WordPress.
        </p>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
        {services.map((service) => (
          <li
            key={service.label}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <span className="text-sm font-medium text-slate-900">
                {service.label}
              </span>
              {service.detail ? (
                <p className="mt-0.5 max-w-xl truncate text-xs text-slate-500">
                  {service.detail}
                </p>
              ) : null}
            </div>
            <span
              className={`text-sm font-medium ${statusClass(service.status)}`}
            >
              {statusLabel(service.status, service.label)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
