"use client";

import { AuthFeedback, getAuthFeedback } from "@/lib/auth-errors";
import {
  RESET_PASSWORD_PATH,
  buildPasswordRecoveryRedirectTo,
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
  parseAuthRedirect,
} from "@/lib/auth-recovery";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type AuthMode = "login" | "signup";

type LoginFormProps = {
  initialError?: AuthFeedback | null;
};

export function LoginForm({ initialError }: LoginFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "error" | "success" | "info";
    suggestSignup?: boolean;
    suggestLogin?: boolean;
  } | null>(
    initialError ?? null
  );

  useEffect(() => {
    const auth = parseAuthRedirect();
    const recoveryPending = isPasswordRecoveryPending();
    const client = createClient();

    if (auth.isRecovery || (auth.hasAuthPayload && recoveryPending)) {
      router.replace(RESET_PASSWORD_PATH + auth.url.search + auth.url.hash);
    }

    if (typeof window !== "undefined" && window.location.search.includes("reset=expired")) {
      setFeedback({
        type: "error",
        message:
          "Le lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.",
      });
    }

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && recoveryPending)) {
        setRecoveryMode(true);
        setPassword("");
        setFeedback({
          type: "info",
          message: "Choisissez un nouveau mot de passe pour votre compte.",
        });
      }
    });

    if (recoveryPending || auth.hasAuthPayload) {
      void client.auth.getSession().then(({ data: sessionData }) => {
        if (sessionData.session) {
          setRecoveryMode(true);
        }
      });
    }

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const result = getAuthFeedback(error, "login");
        setFeedback(result);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      const result = getAuthFeedback(error, "signup");
      setFeedback(result);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setFeedback({
      type: "success",
      message:
        "Compte créé ! Vérifiez votre email pour confirmer votre inscription, puis connectez-vous. Si c'est un compte admin, il sera activé par l'équipe Bookea.",
    });
    setMode("login");
    setPassword("");
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setFeedback({
        type: "error",
        message:
          "Saisissez votre email pour recevoir le lien de réinitialisation.",
      });
      return;
    }

    setLoading(true);
    setFeedback(null);

    markPasswordRecoveryPending();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: buildPasswordRecoveryRedirectTo(window.location.origin),
    });

    setLoading(false);

    if (error) {
      setFeedback({
        type: "error",
        message:
          "Impossible d'envoyer l'email de réinitialisation. Vérifiez l'adresse et réessayez.",
      });
      return;
    }

    setFeedback({
      type: "success",
      message:
        "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé. Ouvrez-le sur cet appareil, puis choisissez un nouveau mot de passe.",
    });
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
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

    clearPasswordRecoveryPending();
    setFeedback({
      type: "success",
      message: "Mot de passe mis à jour. Redirection vers votre espace...",
    });
    router.replace("/dashboard");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setFeedback(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      setFeedback({
        type: "error",
        message: "Impossible de lancer la connexion Google. Veuillez réessayer.",
      });
      setLoading(false);
    }
  }

  function switchToSignup() {
    setMode("signup");
    setFeedback(null);
  }

  function switchToLogin() {
    setMode("login");
    setFeedback(null);
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
              onClick={switchToSignup}
              className="mt-2 font-semibold underline underline-offset-2 hover:no-underline"
            >
              Créer un compte avec cet email
            </button>
          )}
          {feedback.suggestLogin && (
            <button
              type="button"
              onClick={switchToLogin}
              className="mt-2 font-semibold underline underline-offset-2 hover:no-underline"
            >
              Se connecter à la place
            </button>
          )}
        </div>
      )}

      {recoveryMode ? (
        <form onSubmit={handleUpdatePassword} className="space-y-5">
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
      ) : (
      <>
      <form onSubmit={handleEmailAuth} className="space-y-5">
        {mode === "signup" && (
          <div>
            <label
              htmlFor="full-name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Nom complet
            </label>
            <input
              id="full-name"
              name="full-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Samantha Kahlac"
              disabled={loading}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@centre-esthetique.fr"
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Mot de passe
            </label>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={loading}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
              >
                Mot de passe oublié ?
              </button>
            )}
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            ? "Chargement..."
            : mode === "login"
              ? "Se connecter"
              : "Créer mon compte"}
        </button>
      </form>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-slate-500">ou</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3.5 text-base font-medium text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continuer avec Google
      </button>

      <p className="text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>
            Pas encore de compte ?{" "}
            <button
              type="button"
              onClick={switchToSignup}
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Créer un compte
            </button>
          </>
        ) : (
          <>
            Déjà un compte ?{" "}
            <button
              type="button"
              onClick={switchToLogin}
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Se connecter
            </button>
          </>
        )}
      </p>
      </>
      )}
    </div>
  );
}
