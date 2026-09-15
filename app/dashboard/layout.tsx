import { DashboardShell } from "@/components/layout/dashboard-shell";
import { MobileDashboardNav } from "@/components/layout/mobile-dashboard-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f5f6fa] lg:flex">
      <MobileDashboardNav />
      <DashboardShell>
        {children}
      </DashboardShell>
    </div>
  );
}
