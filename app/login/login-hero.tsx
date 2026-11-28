"use client";

import { useEffect, useState } from "react";

const FEATURES = [
  {
    title: "Création de contenus IA",
    description:
      "Générez des articles structurés et documentés grâce à vos agents éditoriaux OpenAI.",
  },
  {
    title: "WordPress & Webflow",
    description:
      "Créez vos brouillons directement dans votre CMS et gardez le contrôle de vos publications.",
  },
  {
    title: "Espaces éditoriaux",
    description:
      "Pilotez vos environnements WordPress et Webflow depuis des espaces indépendants.",
  },
  {
    title: "Optimisation SEO & GEO",
    description:
      "Structurez vos contenus pour les moteurs de recherche et les nouvelles interfaces de recherche IA.",
  },
  {
    title: "Maillage interne intelligent",
    description:
      "Identifiez les contenus existants et créez des liens internes pertinents.",
  },
  {
    title: "Veille éditoriale",
    description:
      "Analysez l’actualité et identifiez de nouvelles idées de contenus adaptées à votre activité.",
  },
  {
    title: "Opportunités SEO",
    description:
      "Identifiez les sujets à fort potentiel éditorial et développez votre couverture thématique.",
  },
  {
    title: "Performances éditoriales",
    description:
      "Analysez vos résultats grâce à Google Search Console et Google Analytics.",
  },
  {
    title: "Pilotage des coûts IA",
    description:
      "Suivez vos consommations OpenAI et les coûts estimés de vos générations.",
  },
] as const;

const ROTATE_MS = 5500;

export function LoginHero() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      setIndex((current) => (current + 1) % FEATURES.length);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="hero" aria-label="Présentation de Naxialis Content Agent">
      <video
        autoPlay
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      >
        <source src="/login/background.mp4" type="video/mp4" />
      </video>

      <div className="hero-content">
        <div className="eyebrow">STRATÉGIE ÉDITORIALE · INTELLIGENCE ARTIFICIELLE</div>
        <h2>
          De la stratégie à la visibilité, <span>l&apos;IA à vos côtés.</span>
        </h2>

        <div
          className="feature-rotator"
          aria-label="Fonctionnalités de Naxialis Content Agent"
        >
          {FEATURES.map((feature, featureIndex) => {
            const active = featureIndex === index;
            return (
              <div
                key={feature.title}
                className={`feature-slide${active ? " is-active" : ""}`}
                aria-hidden={active ? "false" : "true"}
              >
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            );
          })}
        </div>

        <div className="feature-progress" aria-hidden="true">
          {FEATURES.map((feature, featureIndex) => (
            <span
              key={feature.title}
              className={featureIndex === index ? "is-active" : undefined}
            />
          ))}
        </div>
      </div>

      <div className="hero-bottom">
        <span>IA · SEO · GEO · WORDPRESS · WEBFLOW</span>
        <span>Naxialis — Votre intelligence éditoriale.</span>
      </div>
    </section>
  );
}
