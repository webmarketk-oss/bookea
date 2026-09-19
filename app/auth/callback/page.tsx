"use client";

import { BookeaLogo } from "@/components/bookea-logo";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Validation en cours...");

  useEffect(() => {
    async function finishAuth() {
      const callbackUrl = new URL(window.location.href);
      const hashParams = new URLSearchParams(
        callbackUrl.hash.startsWith("#")
          ? callbackUrl.hash.slice(1)
          : callbackUrl.hash
      );
      const code = callbackUrl.searchParams.get("code");
      const authType =
        callbackUrl.searchParams.get("type") || hashParams.get("type");
      const next =
        callbackUrl.searchParams.get("next") ||
        (authType === "recovery" ? "/auth/reset-password" : "/dashboard");

      if (code) {
        const supabase = createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setMessage("Le lien n'a pas pu être validé.");
          router.replace("/login");
          return;
        }
      }

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
