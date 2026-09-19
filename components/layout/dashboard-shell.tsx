"use client";

import { useEffect, useState } from "react";

import Sidebar from "@/components/layout/sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    void fetch("/api/sms/dispatch").catch(() => null);
  }, []);

  function collapseSidebarFromContent(event: React.MouseEvent<HTMLElement>) {
    if (sidebarCollapsed) {
      return;
    }

    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const clickedInteractiveElement = target.closest(
      [
        "a",
        "button",
        "input",
        "select",
        "textarea",
        "label",
        "[role='button']",
        "[role='tab']",
        "[data-sidebar-keep-open='true']",
      ].join(","),
    );

    if (clickedInteractiveElement) {
      return;
    }

    setSidebarCollapsed(true);
  }

  return (
    <>
      <div
        className={`hidden shrink-0 lg:block ${sidebarCollapsed ? "w-20" : "w-72"}`}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
      </div>

      <main
        className="relative z-0 min-w-0 flex-1 p-0 lg:py-3 lg:pr-3 lg:pl-2"
        onClick={collapseSidebarFromContent}
      >
        {children}
      </main>
    </>
  );
}
