import { TarifsNav } from "@/components/tarifs/tarifs-nav";

export default function TarifsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      className="min-h-full bg-[#eef3f9] px-4 py-5 text-slate-950 sm:px-6"
      data-sidebar-collapse-area="true"
    >
      <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
            Bookea
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tarifs</h1>
        </div>
        <TarifsNav />
      </section>
      {children}
    </main>
  );
}
