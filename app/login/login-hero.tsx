"use client";

import { useEffect, useState } from "react";

const FEATURES = [
  {
    title: "Génération d’articles IA",
    description:
      "Création d’articles complets à partir d’un sujet grâce à l’agent OpenAI existant.",
  },
  {
    title: "Maillage interne contrôlé",
    description:
      "Sélection de liens vers des articles WordPress réellement existants et pertinents.",
  },
  {
    title: "Recherche web",
    description:
      "Recherche d’informations et de sources pour enrichir les contenus.",
  },
  {
    title: "Optimisation SEO / GEO",
    description:
      "Génération des titres, descriptions SEO, slugs, catégories WordPress, FAQ et tableaux HTML.",
  },
  {
    title: "File éditoriale",
    description:
      "Gestion des idées d’articles, priorités, angles éditoriaux et sujets à traiter.",
  },
  {
    title: "Recherche d’opportunités SEO",
    description:
      "Identification de sujets et d’opportunités pour développer le contenu du site.",
  },
  {
    title: "Veille éditoriale",
    description:
      "Analyse les publications récentes du web grâce à l’IA pour identifier des opportunités de contenu, proposer des idées d’articles SEO et GEO.",
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
        <div className="eyebrow">STRATÉGIE ÉDITORIALE · SEO / GEO</div>
        <h2>
          De la veille à la visibilité propulsé <span>par l&apos;IA.</span>
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
        <span>IA · SEO / GEO · WORDPRESS</span>
        <span>Naxialis Votre intelligence éditoriale.</span>
      </div>
    </section>
  );
}
