import type { Metadata } from "next";
import Link from "next/link";
import { BookeaLogo } from "@/components/bookea-logo";
import { ClientLoginForm } from "./client-login-form";

export const metadata: Metadata = {
  title: "Connexion client - Bookea",
  description: "Connectez-vous pour retrouver vos rendez-vous Bookea.",
};

export default function ClientLoginPage() {
  return (
    <main className="bookea-surface flex min-h-screen items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-[#dfe5f2] bg-white p-5 shadow-2xl shadow-[#11152e]/8 sm:rounded-3xl sm:p-8">
        <BookeaLogo href="/" showSlogan />
        <h1 className="mt-7 text-3xl font-black text-[#11152e] sm:mt-8 sm:text-4xl">
          Connexion client
        </h1>
        <p className="mt-3 text-base font-medium leading-7 text-slate-500">
          Connectez-vous pour retrouver vos rendez-vous, votre fidélité et vos
          messages avec les centres.
        </p>

        <div className="mt-7">
          <ClientLoginForm />
        </div>

        <p className="mt-6 text-center text-sm font-semibold text-slate-500">
          Vous êtes un centre ?{" "}
          <Link href="/login" className="text-blue-700 underline underline-offset-2">
            Connexion Pro
          </Link>
        </p>
      </div>
    </main>
  );
}
