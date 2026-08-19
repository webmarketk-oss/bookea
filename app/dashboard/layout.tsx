import Sidebar from "@/components/layout/sidebar";
import { MobileDashboardNav } from "@/components/layout/mobile-dashboard-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f5f6fa] lg:flex">
      <MobileDashboardNav />
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="min-w-0 flex-1 p-0 lg:p-6">
        {children}
      </main>
    </div>
  );
}
