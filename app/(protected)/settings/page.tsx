import type { Metadata } from "next";
import { EditorialAgentSettings } from "@/components/EditorialAgentSettings";
import { getServiceStatuses } from "@/lib/config-status";

export const metadata: Metadata = {
  title: "Paramètres",
};

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const services = getServiceStatuses();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configuration de l’agent éditorial et état des services. Aucun secret
          n’est affiché.
        </p>
      </div>

      <EditorialAgentSettings />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Services</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {services.map((service) => (
            <li
              key={service.label}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <span className="text-sm font-medium text-slate-900">
                {service.label}
              </span>
              <span
                className={`text-sm font-medium ${
                  service.configured ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {service.configured
                  ? service.label === "Authentification"
                    ? "Configurée"
                    : "Configuré"
                  : "À configurer"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
