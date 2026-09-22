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
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1 text-[10px] font-black text-slate-600">
              0
            </span>
          </Button>

          {notificationsOpen && (
            <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-black text-slate-950">Notifications</p>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                  0
                </span>
              </div>

              <div className="space-y-2">
                <p className="rounded-xl border border-slate-100 p-3 text-sm font-semibold text-slate-500">
                  Aucune notification pour ce centre.
                </p>
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
