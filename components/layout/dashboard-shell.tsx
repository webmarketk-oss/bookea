"use client";

import { useEffect, useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import { SidebarControlProvider } from "@/components/layout/sidebar-control";
import {
  COLLAPSE_SIDEBAR_EVENT,
  useSidebarSlide,
} from "@/components/layout/use-sidebar-slide";
import { loadPublicCenterProfile } from "@/lib/center-settings";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { sidebarRef, width, isDragging, visuallyCollapsed, didDragRef } =
    useSidebarSlide(sidebarCollapsed, setSidebarCollapsed);

  useEffect(() => {
    void fetch("/api/sms/dispatch").catch(() => null);
    void loadPublicCenterProfile().catch(() => null);
  }, []);

  useEffect(() => {
    function collapseSidebar() {
      setSidebarCollapsed(true);
    }

    window.addEventListener(COLLAPSE_SIDEBAR_EVENT, collapseSidebar);
    return () => {
      window.removeEventListener(COLLAPSE_SIDEBAR_EVENT, collapseSidebar);
    };
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
    <SidebarControlProvider
      collapseSidebar={() => setSidebarCollapsed(true)}
    >
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
    </SidebarControlProvider>
  );
}
