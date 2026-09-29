"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";

type NavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
};

export default function NavItem({
  href,
  label,
  icon: Icon,
  active = false,
  collapsed = false,
}: NavItemProps) {
  const className = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bookea-gradient text-white shadow-lg shadow-blue-950/20"
      : "text-white/62 hover:bg-white/10 hover:text-white"
  } ${collapsed ? "justify-center" : ""}`;

  if (collapsed) {
    return (
      <a href={href} title={label} className={className}>
        <Icon size={20} className="pointer-events-none" />
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      <Icon size={20} className="pointer-events-none" />
      <span>{label}</span>
    </Link>
  );
}
