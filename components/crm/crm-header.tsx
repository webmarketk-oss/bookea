"use client";

import { Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/layout/notifications-bell";

type CRMHeaderProps = {
  onNewLead: () => void;
};

export default function CRMHeader({ onNewLead }: CRMHeaderProps) {
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
        <NotificationsBell />

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
