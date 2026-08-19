import { Suspense } from "react";
import AgendaBoard from "@/components/agenda/agenda-board";

export default function AgendaPage() {
  return (
    <Suspense fallback={null}>
      <AgendaBoard />
    </Suspense>
  );
}
