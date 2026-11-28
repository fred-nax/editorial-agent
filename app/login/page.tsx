import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";
import { LoginHero } from "./login-hero";
import "./login-page.css";

export const metadata: Metadata = {
  title: "Connexion",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="login-page">
      <main className="layout">
        <LoginHero />

        <section className="signin" aria-label="Connexion à l'application">
          <div className="top">
            <span className="private">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Espace privé
            </span>
          </div>

          <div className="form-wrap">
            <div className="login-logo" aria-label="Naxialis Content Agent">
              <span className="login-logo-mark" aria-hidden="true">
                N
              </span>
              <span className="login-logo-wordmark">
                NAXIALIS AI
                <small>Solutions métier augmentées par l&apos;IA</small>
              </span>
            </div>

            <p className="intro">CONTENT AGENT · INTELLIGENCE ÉDITORIALE</p>
            <h1>Bienvenue.</h1>
            <p className="sub">
              Pilotez votre stratégie éditoriale, créez vos contenus avec
              l&apos;IA et suivez leurs performances depuis un espace unique.
            </p>

            <div className="platforms" aria-label="Plateformes compatibles">
              <p className="platforms-title">Plateformes compatibles</p>
              <ul className="platforms-list">
                <li className="platform-item">
                  {/* alt vide : le nom est déjà présent en texte adjacent */}
                  <img src="/icons/wordpress.svg" alt="" width={26} height={26} />
                  <span>WordPress</span>
                </li>
                <li className="platform-item">
                  <img src="/icons/webflow.svg" alt="" width={26} height={26} />
                  <span>Webflow</span>
                </li>
              </ul>
            </div>

            <LoginForm />

            <div className="footer">
              <div className="line" />
              Votre intelligence éditoriale, dans un espace sécurisé.
              <br />© 2026 Naxialis
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
