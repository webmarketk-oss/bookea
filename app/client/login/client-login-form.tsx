"use client";

import { getAuthFeedback } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const CLIENT_HOME = "/client/compte";

export function ClientLoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "error" | "success" | "info";
    suggestSignup?: boolean;
    suggestLogin?: boolean;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setFeedback(getAuthFeedback(error, "login"));
        setLoading(false);
        return;
      }
      router.push(CLIENT_HOME);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          account_type: "client",
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${CLIENT_HOME}`,
      },
    });

    if (error) {
      setFeedback(getAuthFeedback(error, "signup"));
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push(CLIENT_HOME);
      router.refresh();
      return;
    }

    setFeedback({
      type: "success",
      message:
        "Compte créé. Vérifiez votre email pour confirmer, puis connectez-vous.",
    });
    setMode("login");
    setPassword("");
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          role="alert"
          className={`rounded-xl px-4 py-3 text-sm ${
            feedback.type === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : feedback.type === "success"
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          <p>{feedback.message}</p>
          {feedback.suggestSignup && (
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setFeedback(null);
              }}
              className="mt-2 font-semibold underline underline-offset-2 hover:no-underline"
            >
              Créer un compte client avec cet email
            </button>
          )}
          {feedback.suggestLogin && (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setFeedback(null);
              }}
              className="mt-2 font-semibold underline underline-offset-2 hover:no-underline"
            >
              Se connecter à la place
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {mode === "signup" && (
          <div>
            <label
              htmlFor="client-full-name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Nom complet
            </label>
            <input
              id="client-full-name"
              name="full-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Votre nom"
              disabled={loading}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
            />
          </div>
        )}
        <div>
          <label
            htmlFor="client-email"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id="client-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vous@email.com"
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
          />
        </div>
        <div>
          <label
            htmlFor="client-password"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Mot de passe
          </label>
          <input
            id="client-password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-700 hover:to-blue-800 hover:shadow-xl hover:shadow-blue-600/30 disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
        >
          {loading
            ? "Connexion..."
            : mode === "login"
              ? "Se connecter"
              : "Créer mon compte client"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setFeedback(null);
        }}
        className="w-full text-center text-sm font-semibold text-slate-600 underline underline-offset-2 hover:no-underline"
      >
        {mode === "login"
          ? "Pas encore de compte ? Créer un compte client"
          : "Déjà un compte ? Se connecter"}
      </button>
    </div>
  );
}
