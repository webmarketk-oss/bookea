import type { AuthError } from "@supabase/supabase-js";

type AuthMode = "login" | "signup";

export type AuthFeedback = {
  message: string;
  type: "error" | "success" | "info";
  suggestSignup?: boolean;
  suggestLogin?: boolean;
};

export function getAuthFeedback(
  error: AuthError,
  mode: AuthMode
): AuthFeedback {
  const msg = error.message.toLowerCase();

  if (msg.includes("invalid login credentials")) {
    return {
      type: "error",
      message: "Email ou mot de passe incorrect.",
      suggestSignup: mode === "login",
    };
  }

  if (msg.includes("user already registered")) {
    return {
      type: "error",
      message: "Un compte existe déjà avec cet email.",
      suggestLogin: true,
    };
  }

  if (msg.includes("email not confirmed")) {
    return {
      type: "info",
      message:
        "Veuillez confirmer votre email avant de vous connecter. Consultez votre boîte de réception.",
    };
  }

  if (msg.includes("password") && msg.includes("short")) {
    return {
      type: "error",
      message: "Le mot de passe doit contenir au moins 6 caractères.",
    };
  }

  return {
    type: "error",
    message: error.message,
  };
}

export function getCallbackErrorMessage(errorCode: string | null): AuthFeedback | null {
  if (errorCode === "auth_callback_error") {
    return {
      type: "error",
      message: "La connexion avec Google a échoué. Veuillez réessayer.",
    };
  }

  return null;
}
