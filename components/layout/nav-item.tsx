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
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "text-gray-600 hover:bg-gray-100 hover:text-black"
      } ${collapsed ? "justify-center" : ""}`}
    >
      <Icon size={20} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
