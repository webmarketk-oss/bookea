"use client";

import { useEffect, useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import { useSidebarSlide } from "@/components/layout/use-sidebar-slide";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { sidebarRef, width, isDragging, visuallyCollapsed, didDragRef } =
    useSidebarSlide(sidebarCollapsed, setSidebarCollapsed);

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
        collapsed={visuallyCollapsed}
        isDragging={isDragging}
        width={width}
        sidebarRef={sidebarRef}
        didDragRef={didDragRef}
        onCollapsedChange={setSidebarCollapsed}
      />
      <div
        aria-hidden
        className={`hidden shrink-0 lg:block ${
          isDragging ? "" : "transition-[width] duration-200"
        }`}
        style={{ width }}
      />

      <main
        className="relative z-0 min-w-0 flex-1 p-0 lg:py-3 lg:pr-3 lg:pl-3"
        onClick={collapseSidebarFromContent}
      >
        {children}
      </main>
    </>
  );
}
