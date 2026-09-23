"use client";

import { createContext, useContext } from "react";

type SidebarControl = {
  collapseSidebar: () => void;
};

const SidebarControlContext = createContext<SidebarControl>({
  collapseSidebar: () => {},
});

export function SidebarControlProvider({
  collapseSidebar,
  children,
}: {
  collapseSidebar: () => void;
  children: React.ReactNode;
}) {
  return (
    <SidebarControlContext.Provider value={{ collapseSidebar }}>
      {children}
    </SidebarControlContext.Provider>
  );
}

export function useSidebarControl() {
  return useContext(SidebarControlContext);
}
