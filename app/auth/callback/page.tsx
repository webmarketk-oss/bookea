"use client";

import { BookeaLogo } from "@/components/bookea-logo";
import { RESET_PASSWORD_PATH, parseAuthRedirect } from "@/lib/auth-recovery";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Validation en cours...");

  useEffect(() => {
    async function finishAuth() {
      const auth = parseAuthRedirect();
      const supabase = createClient();
      const shouldDetectRecovery =
        Boolean(auth.code || auth.tokenHash) && !auth.next && !auth.isRecovery;
      let isRecovery = auth.isRecovery;

      const recoveryWait = shouldDetectRecovery
        ? new Promise<boolean>((resolve) => {
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
            }, 800);
          })
        : Promise.resolve(false);

      if (auth.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(auth.code);

        if (error) {
          setMessage("Le lien n'a pas pu être validé.");
          router.replace("/login");
          return;
        }
      } else if (auth.tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          type: auth.type === "recovery" ? "recovery" : "email",
          token_hash: auth.tokenHash,
        });

        if (error) {
          setMessage("Le lien n'a pas pu être validé.");
          router.replace("/login");
          return;
        }
      }

      isRecovery = isRecovery || (await recoveryWait);

      const next =
        isRecovery || auth.next?.includes(RESET_PASSWORD_PATH)
          ? RESET_PASSWORD_PATH
          : auth.next || "/dashboard";

      router.replace(next);
    }

    void finishAuth();
  }, [router]);

  return (
    <main className="bookea-surface flex min-h-screen items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-[#dfe5f2] bg-white p-5 text-center shadow-2xl shadow-[#11152e]/8 sm:rounded-3xl sm:p-8">
        <BookeaLogo href="/login" showSlogan />
        <h1 className="mt-7 text-3xl font-black text-[#11152e]">
          Connexion Bookea
        </h1>
        <p className="mt-3 text-base font-medium text-slate-500">{message}</p>
      </div>
    </main>
  );
}
