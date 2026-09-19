"use client";

import { BookeaLogo } from "@/components/bookea-logo";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function prepareReset() {
      const supabase = createClient();
      const callbackUrl = new URL(window.location.href);
      const code = callbackUrl.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setFeedback({
            type: "error",
            message:
              "Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.",
          });
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setFeedback({
          type: "error",
          message:
            "Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.",
        });
        return;
      }

      setReady(true);
    }

    void prepareReset();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 6) {
      setFeedback({
        type: "error",
        message: "Le mot de passe doit contenir au moins 6 caractères.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setFeedback({
        type: "error",
        message: "Les deux mots de passe ne correspondent pas.",
      });
      return;
    }

    setLoading(true);
    setFeedback(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setFeedback({
        type: "error",
        message:
          "Le mot de passe n'a pas pu être enregistré. Réessayez ou demandez un nouveau lien.",
      });
      return;
    }

    setFeedback({
      type: "success",
      message: "Mot de passe mis à jour. Redirection vers votre espace...",
    });
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="bookea-surface flex min-h-screen items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-[#dfe5f2] bg-white p-5 shadow-2xl shadow-[#11152e]/8 sm:rounded-3xl sm:p-8">
        <BookeaLogo href="/login" showSlogan />
        <h1 className="mt-7 text-3xl font-black text-[#11152e] sm:mt-8 sm:text-4xl">
          Nouveau mot de passe
        </h1>
        <p className="mt-3 text-base font-medium leading-7 text-slate-500">
          Choisissez un nouveau mot de passe pour votre espace Bookea.
        </p>

        {feedback ? (
          <div
            role="alert"
            className={`mt-6 rounded-xl px-4 py-3 text-sm ${
              feedback.type === "error"
                ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        {ready ? (
          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label
                htmlFor="new-password"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Nouveau mot de passe
              </label>
              <input
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Confirmer le mot de passe
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
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
              {loading ? "Enregistrement..." : "Enregistrer le mot de passe"}
            </button>
          </form>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-500">
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="font-medium text-blue-600 hover:text-blue-700"
          >
            Retour à la connexion
          </button>
        </p>
      </div>
    </main>
  );
}
