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
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      <main
        className={`relative z-0 min-w-0 flex-1 p-0 lg:py-3 lg:pr-3 ${
          sidebarCollapsed ? "lg:pl-[5.5rem]" : "lg:pl-[18.5rem]"
        }`}
        onClick={collapseSidebarFromContent}
      >
        {children}
      </main>
    </>
  );
}
