"use client";

import { Bell, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState } from "react";

type CRMHeaderProps = {
  onNewLead: () => void;
};

export default function CRMHeader({ onNewLead }: CRMHeaderProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

      <div>
        <h1 className="text-4xl font-bold tracking-tight">
          Prospects
        </h1>

        <p className="mt-2 text-muted-foreground">
          Gérez et suivez tous vos prospects.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setNotificationsOpen((open) => !open)}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
              3
            </span>
          </Button>

          {notificationsOpen && (
            <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-black text-slate-950">Notifications</p>
                <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-black text-red-600">
                  3
                </span>
              </div>

              <div className="space-y-2">
                {[
                  {
                    title: "Julie Martin à rappeler",
                    text: "Relance prévue aujourd'hui.",
                    color: "bg-orange-50 text-orange-700",
                  },
                  {
                    title: "RDV à confirmer",
                    text: "Julie Martin · 10:30 · Cabine 2.",
                    color: "bg-violet-50 text-violet-700",
                  },
                  {
                    title: "Acompte en attente",
                    text: "Marie Dubois · 180,00 € à valider.",
                    color: "bg-emerald-50 text-emerald-700",
                  },
                ].map((notification) => (
                  <button
                    key={notification.title}
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="w-full rounded-xl border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <span
                      className={`mb-2 inline-flex rounded-full px-2 py-1 text-xs font-black ${notification.color}`}
                    >
                      {notification.title}
                    </span>
                    <p className="text-sm font-semibold text-slate-500">
                      {notification.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2">

          <Avatar className="h-10 w-10">
            <AvatarFallback>SK</AvatarFallback>
          </Avatar>

          <div className="hidden text-left md:block">
            <p className="font-semibold">Samantha</p>
            <p className="text-xs text-muted-foreground">
              Responsable
            </p>
          </div>

        </div>

        <Button className="h-11" onClick={onNewLead}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau prospect
        </Button>

      </div>

    </div>
  );
}
