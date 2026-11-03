import type { Metadata } from "next";
import { ArticleForm } from "@/components/ArticleForm";

export const metadata: Metadata = {
  title: "Nouvel article",
};

export default function NewArticlePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Nouvel article</h1>
        <p className="mt-1 text-sm text-slate-600">
          Saisissez un sujet. La génération crée un brouillon WordPress, sans publication.
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <ArticleForm />
      </section>
    </div>
  );
}
