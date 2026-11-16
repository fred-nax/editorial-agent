"use client";

import { useActionState, useId, useState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  return (
    <form action={formAction} noValidate>
      <div className="field">
        <label htmlFor={emailId}>Adresse e-mail</label>
        <input
          id={emailId}
          type="email"
          name="email"
          autoComplete="username"
          placeholder="vous@naxialis.com"
          required
          disabled={pending}
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? errorId : undefined}
        />
      </div>

      <div className="field">
        <label htmlFor={passwordId}>Mot de passe</label>
        <div className="password-wrap">
          <input
            id={passwordId}
            type={passwordVisible ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="Votre mot de passe"
            required
            disabled={pending}
            aria-invalid={state?.error ? true : undefined}
            aria-describedby={state?.error ? errorId : undefined}
          />
          <button
            className="toggle"
            type="button"
            onClick={() => setPasswordVisible((value) => !value)}
            aria-label={
              passwordVisible
                ? "Masquer le mot de passe"
                : "Afficher le mot de passe"
            }
            disabled={pending}
          >
            {passwordVisible ? "Masquer" : "Afficher"}
          </button>
        </div>
      </div>

      <button className="submit" type="submit" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
        {!pending ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M4 12h16m-6-6 6 6-6 6" />
          </svg>
        ) : null}
      </button>

      {state?.error ? (
        <p id={errorId} className="hint error" role="alert">
          {state.error}
        </p>
      ) : (
        <p className="hint" role="status" aria-live="polite">
          Accès réservé aux utilisateurs autorisés.
        </p>
      )}
    </form>
  );
}
