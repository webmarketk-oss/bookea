import type { Metadata } from "next";
import Link from "next/link";
import { BookeaLogo } from "@/components/bookea-logo";

export const metadata: Metadata = {
  title: "Connexion - Bookea",
  description: "Connectez-vous à votre espace Bookea.",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <BookeaLogo href="/client" showSlogan />
        <h1 className="mt-8 text-4xl font-black tracking-tight text-slate-950">
          Connexion Bookea
        </h1>
        <p className="mt-3 text-base font-medium leading-7 text-slate-500">
          Choisissez votre espace. La connexion sécurisée sera ensuite reliée
          aux comptes clients, centres et administrateurs.
        </p>

        <div className="mt-7 grid gap-3">
          <Link
            href="/client#client"
            className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-left transition hover:border-blue-300 hover:bg-blue-100"
          >
            <span>
              <span className="block text-lg font-black text-slate-950">
                Espace cliente
              </span>
              <span className="mt-1 block text-sm font-semibold text-slate-500">
                Mes rendez-vous, carte fidélité et réservations.
              </span>
            </span>
            <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">
              Ouvrir
            </span>
          </Link>

          <Link
            href="/dashboard"
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-950 px-5 py-4 text-left text-white transition hover:bg-slate-800"
          >
            <span>
              <span className="block text-lg font-black">Espace centre</span>
              <span className="mt-1 block text-sm font-semibold text-slate-300">
                CRM, agenda, clients, facturation et réglages.
              </span>
            </span>
            <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950">
              Ouvrir
            </span>
          </Link>
        </div>

        <Link
          href="/client"
          className="mt-6 inline-flex text-sm font-bold text-slate-500 transition hover:text-blue-600"
        >
          Retour à l’interface publique
        </Link>
      </div>
    </main>
  );
}
