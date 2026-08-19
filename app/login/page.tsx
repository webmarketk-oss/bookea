import type { Metadata } from "next";
import { BookeaLogo } from "@/components/bookea-logo";
import { LoginForm } from "./login-form";

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
          Connectez-vous à votre espace centre pour accéder au CRM, à
          l&apos;agenda, aux clientes et à la facturation.
        </p>

        <div className="mt-7">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
