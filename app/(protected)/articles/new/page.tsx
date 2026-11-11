import type { Metadata } from "next";
import { ArticleForm } from "@/components/ArticleForm";

export const metadata: Metadata = {
  title: "Nouvel article",
};

export default function NewArticlePage() {
  return (
    <div className="w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
          Nouvel article
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Préparez le sujet, lancez la génération, puis finalisez le brouillon
          dans WordPress.
        </p>
      </div>
      <ArticleForm />
    </div>
  );
}
