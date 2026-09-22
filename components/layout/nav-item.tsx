import Link from "next/link";
import { LucideIcon } from "lucide-react";

type NavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  collapsed?: boolean;
};

export default function NavItem({
  href,
  label,
  icon: Icon,
  active = false,
  collapsed = false,
}: NavItemProps) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bookea-gradient text-white shadow-lg shadow-blue-950/20"
          : "text-white/62 hover:bg-white/10 hover:text-white"
      } ${collapsed ? "justify-center" : ""}`}
    >
      <Icon size={20} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
