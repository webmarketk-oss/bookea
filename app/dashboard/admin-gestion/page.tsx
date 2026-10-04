"use client";

import { Bell, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AgencyWorkspace } from "@/components/admin-gestion/agency-workspace";
import { loadIsBookeaAdmin } from "@/lib/center-access";

export default function AdminGestionPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadIsBookeaAdmin().then((isAdmin) => {
      if (!alive) return;
      setAllowed(isAdmin);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <header>
          <p className="text-sm font-medium text-violet-600">Bookea Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Facturation WebK & Bookea
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-500">
            Gestion interne des factures, du portefeuille centres et des cycles
            mensuels. Invisible pour les centres.
          </p>
        </header>

        {loading ? (
          <div className="grid min-h-56 place-items-center rounded-[2rem] border border-slate-200 bg-white text-slate-500">
            <div className="flex items-center gap-3 font-semibold">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement...
            </div>
          </div>
        ) : !allowed ? (
          <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
            <Bell className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-base font-semibold">Accès réservé</p>
            <p className="mt-2 font-medium text-slate-500">
              Cet espace est réservé à l’équipe Bookea.
            </p>
          </div>
        ) : (
          <AgencyWorkspace />
        )}
      </div>
    </main>
  );
}
