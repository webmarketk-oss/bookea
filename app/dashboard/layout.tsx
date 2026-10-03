import { DashboardShell } from "@/components/layout/dashboard-shell";
import { MobileDashboardNav } from "@/components/layout/mobile-dashboard-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f5f6fa] lg:flex-row">
      <MobileDashboardNav />
      <DashboardShell>
        {children}
      </DashboardShell>
    </div>
  );
}
