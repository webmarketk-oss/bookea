"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, LucideIcon } from "lucide-react";
import Link from "next/link";
import { ReactNode, useState } from "react";

type NavGroupProps = {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
  collapsed?: boolean;
  href?: string;
  active?: boolean;
  defaultOpen?: boolean;
};

export default function NavGroup({
  label,
  icon: Icon,
  children,
  collapsed = false,
  href,
  active = false,
  defaultOpen = false,
}: NavGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsed) {
    if (href) {
      return (
        <Link
          href={href}
          title={label}
          className={`flex justify-center rounded-lg px-3 py-2 transition-colors ${
            active
              ? "bookea-gradient text-white shadow-lg shadow-blue-950/20"
              : "text-white/62 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icon size={20} />
        </Link>
      );
    }

    return (
      <div className="flex justify-center rounded-lg px-3 py-2 text-white/62">
        <Icon size={20} />
      </div>
    );
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
          active
            ? "bg-white/10 text-white"
            : "text-white/62 hover:bg-white/10 hover:text-white"
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon size={20} />
          <span>{label}</span>
        </div>

        <ChevronDown
          size={18}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Collapsible.Trigger>

      <Collapsible.Content className="mt-1 ml-8 space-y-1">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
