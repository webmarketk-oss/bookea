"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  AUTH_CALLBACK_PATH,
  RESET_PASSWORD_PATH,
  buildCallbackHref,
  buildResetPasswordHref,
  isPasswordRecoveryPending,
  parseAuthRedirect,
} from "@/lib/auth-recovery";
import { createClient } from "@/lib/supabase";

export function AuthRecoveryGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === RESET_PASSWORD_PATH || pathname === AUTH_CALLBACK_PATH) {
      return;
    }

    const auth = parseAuthRedirect();

    if (auth.hasAuthPayload) {
      if (auth.isRecovery || isPasswordRecoveryPending()) {
        router.replace(buildResetPasswordHref());
        return;
      }

      router.replace(buildCallbackHref());
      return;
    }

    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "PASSWORD_RECOVERY" &&
        window.location.pathname !== RESET_PASSWORD_PATH
      ) {
        router.replace(RESET_PASSWORD_PATH);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
