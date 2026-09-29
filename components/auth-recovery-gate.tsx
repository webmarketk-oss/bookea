"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  AUTH_CALLBACK_PATH,
  RESET_PASSWORD_PATH,
  buildCallbackHref,
  buildResetPasswordHref,
  isPasswordRecoveryPending,
  navigatePreservingAuth,
  parseAuthRedirect,
} from "@/lib/auth-recovery";
import { createClient } from "@/lib/supabase";

export function AuthRecoveryGate() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === RESET_PASSWORD_PATH || pathname === AUTH_CALLBACK_PATH) {
      return;
    }

    const auth = parseAuthRedirect();
    const recoveryPending = isPasswordRecoveryPending();

    if (auth.hasAuthPayload) {
      if (auth.isRecovery || recoveryPending) {
        navigatePreservingAuth(buildResetPasswordHref());
        return;
      }

      navigatePreservingAuth(buildCallbackHref());
      return;
    }

    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "PASSWORD_RECOVERY" &&
        window.location.pathname !== RESET_PASSWORD_PATH
      ) {
        navigatePreservingAuth(RESET_PASSWORD_PATH);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [pathname]);

  return null;
}
