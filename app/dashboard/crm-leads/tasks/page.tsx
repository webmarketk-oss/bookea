import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { leads } from "@/lib/mock-data";

export default function LeadTasksPage() {
  const tasks = leads
    .filter((lead) => lead.nextAction && lead.nextAction !== "-")
    .map((lead) => ({
      id: lead.id,
      name: `${lead.firstName} ${lead.lastName}`,
      action: lead.nextAction,
      status: lead.status,
      reminderDate: lead.reminderDate,
    }));

  return (
    <main className="min-h-screen bg-slate-100 p-8" data-sidebar-collapse-area="true">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm font-semibold text-violet-600">Bookea CRM</p>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-slate-950">
            Tâches prospects
          </h1>
          <p className="mt-2 text-slate-500">
            Suivez les prochaines actions à traiter depuis les fiches leads.
          </p>
        </header>

        <Card className="border-slate-200 py-0 shadow-sm">
          <CardContent className="divide-y divide-slate-100 p-0">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="grid gap-3 p-5 md:grid-cols-[1fr_1.2fr_140px_140px]"
              >
                <p className="font-black text-slate-950">{task.name}</p>
                <p className="font-semibold text-slate-700">{task.action}</p>
                <p className="text-sm font-semibold text-slate-500">
                  {task.reminderDate ?? "Sans rappel"}
                </p>
                <Badge className="justify-self-start bg-slate-100 text-slate-600">
                  {task.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
