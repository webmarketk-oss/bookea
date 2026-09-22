"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  AUTH_CALLBACK_PATH,
  RESET_PASSWORD_PATH,
  buildResetPasswordHref,
  parseAuthRedirect,
} from "@/lib/auth-recovery";
import { createClient } from "@/lib/supabase";

export function AuthRecoveryGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const auth = parseAuthRedirect();

    if (auth.isRecovery && pathname !== RESET_PASSWORD_PATH) {
      router.replace(buildResetPasswordHref());
      return;
    }

    if (
      auth.hasAuthPayload &&
      pathname === "/" &&
      !auth.isRecovery
    ) {
      const callback = new URL(AUTH_CALLBACK_PATH, window.location.origin);
      auth.url.searchParams.forEach((value, key) => {
        callback.searchParams.set(key, value);
      });
      callback.hash = auth.url.hash;
      router.replace(`${callback.pathname}${callback.search}${callback.hash}`);
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
