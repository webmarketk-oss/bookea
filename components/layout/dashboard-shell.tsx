"use client";

import { useState } from "react";

import Sidebar from "@/components/layout/sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function collapseSidebarFromContent(event: React.MouseEvent<HTMLElement>) {
    if (sidebarCollapsed) {
      return;
    }

    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const clickedCollapseArea =
      target === event.currentTarget ||
      target.dataset.sidebarCollapseArea === "true";

    if (clickedCollapseArea) {
      setSidebarCollapsed(true);
    }
  }

  return (
    <>
      <div className="hidden lg:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
      </div>

      <main
        className="min-w-0 flex-1 p-0 lg:p-6"
        onClick={collapseSidebarFromContent}
      >
        {children}
      </main>
    </>
  );
}
