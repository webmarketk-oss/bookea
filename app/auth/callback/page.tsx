"use client";

import { BookeaLogo } from "@/components/bookea-logo";
import {
  RESET_PASSWORD_PATH,
  buildResetPasswordHref,
  isPasswordRecoveryPending,
  navigatePreservingAuth,
  parseAuthRedirect,
  waitForAuthSession,
} from "@/lib/auth-recovery";
import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Ouverture du lien...");

  useEffect(() => {
    async function finishAuth() {
      const auth = parseAuthRedirect();
      const supabase = createClient();
      let isRecovery =
        auth.isRecovery ||
        isPasswordRecoveryPending() ||
        (auth.next || "").includes(RESET_PASSWORD_PATH);

      const recoveryWait = new Promise<boolean>((resolve) => {
        let settled = false;
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") {
            settled = true;
            data.subscription.unsubscribe();
            resolve(true);
          }
        });

        window.setTimeout(() => {
          if (!settled) {
            data.subscription.unsubscribe();
            resolve(false);
          }
        }, 2500);
      });

      if (auth.code) {
        await supabase.auth.exchangeCodeForSession(auth.code);
      } else if (auth.tokenHash) {
        await supabase.auth.verifyOtp({
          type: auth.type === "recovery" || isRecovery ? "recovery" : "email",
          token_hash: auth.tokenHash,
        });
      }

      isRecovery = isRecovery || (await recoveryWait) || isPasswordRecoveryPending();
      const session = await waitForAuthSession(() => supabase.auth.getSession());

      if (isRecovery) {
        navigatePreservingAuth(
          session ? RESET_PASSWORD_PATH : buildResetPasswordHref(),
        );
        return;
      }

      if (!session && auth.hasAuthPayload) {
        setMessage("Le lien n'a pas pu être validé.");
        navigatePreservingAuth("/login?reset=expired");
        return;
      }

      const next = auth.next || (session ? "/dashboard" : "/login");
      navigatePreservingAuth(next);
    }

    void finishAuth();
  }, []);

  return (
    <main className="bookea-surface flex min-h-screen items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-[#dfe5f2] bg-white p-5 text-center shadow-2xl shadow-[#11152e]/8 sm:rounded-3xl sm:p-8">
        <BookeaLogo href="/login" showSlogan />
        <h1 className="mt-7 text-3xl font-black text-[#11152e]">
          Réinitialisation du mot de passe
        </h1>
        <p className="mt-3 text-base font-medium text-slate-500">{message}</p>
      </div>
    </main>
  );
}
