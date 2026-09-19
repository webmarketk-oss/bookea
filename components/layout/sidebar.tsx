"use client";

import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Users,
  Calendar,
  Bot,
  FolderOpen,
  Mail,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { BookeaLogo } from "@/components/bookea-logo";
import { createClient } from "@/lib/supabase";
import { CenterSwitcher } from "./center-switcher";
import NavItem from "./nav-item";
import NavGroup from "./nav-group";

type SidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};

export default function Sidebar({
  collapsed,
  onCollapsedChange,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const crmOpen =
    pathname.startsWith("/dashboard/crm-leads") ||
    pathname.startsWith("/dashboard/crm-clients") ||
    pathname.startsWith("/dashboard/seya-crm") ||
    pathname.startsWith("/dashboard/messagerie") ||
    pathname.startsWith("/dashboard/mailing") ||
    pathname.startsWith("/dashboard/sms") ||
    pathname.startsWith("/dashboard/documents") ||
    pathname.startsWith("/dashboard/statistiques") ||
    pathname.startsWith("/dashboard/facturation");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-white/10 bg-[#11152e] p-4 text-white transition-all duration-200 ${
        collapsed ? "w-20" : "w-72"
      }`}
    >
      <div className="mb-8 flex items-center justify-between gap-3">
        {collapsed ? (
          <BookeaLogo size="sm" showText={false} />
        ) : (
          <BookeaLogo size="md" showSlogan />
        )}

        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      <CenterSwitcher collapsed={collapsed} />

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        <NavItem
          href="/dashboard"
          label="Dashboard"
          icon={LayoutDashboard}
          active={pathname === "/dashboard"}
          collapsed={collapsed}
        />

        <NavGroup
          label="CRM Leads"
          icon={Users}
          collapsed={collapsed}
          href="/dashboard/crm-leads"
          active={crmOpen}
          defaultOpen={crmOpen}
        >
          <NavItem
            href="/dashboard/crm-leads"
            label="Prospects / KPI"
            icon={Users}
            active={pathname.startsWith("/dashboard/crm-leads")}
          />
          <NavItem
            href="/dashboard/crm-clients"
            label="Clients"
            icon={UserRound}
            active={pathname.startsWith("/dashboard/crm-clients")}
          />
          <NavItem
            href="/dashboard/seya-crm"
            label="Seya CRM"
            icon={Bot}
            active={pathname.startsWith("/dashboard/seya-crm")}
          />
          <div className="px-3 pt-3 pb-1 text-xs font-black uppercase text-white/40">
            Messagerie Bookea
          </div>
          <NavItem
            href="/dashboard/messagerie"
            label="Mes messages"
            icon={MessageCircle}
            active={pathname.startsWith("/dashboard/messagerie")}
          />
          <div className="px-3 pt-3 pb-1 text-xs font-black uppercase text-white/40">
            Marketing
          </div>
          <NavItem
            href="/dashboard/mailing"
            label="Mailing"
            icon={Mail}
            active={pathname.startsWith("/dashboard/mailing")}
          />
          <NavItem
            href="/dashboard/sms"
            label="Envoi SMS"
            icon={MessageCircle}
            active={pathname.startsWith("/dashboard/sms")}
          />
          <div className="px-3 pt-3 pb-1 text-xs font-black uppercase text-white/40">
            Facturation
          </div>
          <NavItem
            href="/dashboard/facturation"
            label="Facturation"
            icon={ReceiptText}
            active={pathname.startsWith("/dashboard/facturation")}
          />
          <NavItem
            href="/dashboard/statistiques"
            label="Statistiques"
            icon={BarChart3}
            active={pathname.startsWith("/dashboard/statistiques")}
          />
          <NavItem
            href="/dashboard/documents"
            label="Documents"
            icon={FolderOpen}
            active={pathname.startsWith("/dashboard/documents")}
          />
        </NavGroup>

        <NavItem
          href="/dashboard/agenda"
          label="Agenda"
          icon={Calendar}
          active={pathname.startsWith("/dashboard/agenda")}
          collapsed={collapsed}
        />

        <NavItem
          href="/dashboard/parametres-centre"
          label="Paramètres du centre"
          icon={Settings}
          active={pathname.startsWith("/dashboard/parametres-centre")}
          collapsed={collapsed}
        />

        <NavItem
          href="/dashboard/admin-centres"
          label="Admin centres"
          icon={ShieldCheck}
          active={pathname.startsWith("/dashboard/admin-centres")}
          collapsed={collapsed}
        />
      </nav>

      <button
        type="button"
        onClick={() => void handleLogout()}
        title="Déconnexion"
        className={`mt-auto flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold text-white/62 transition-colors hover:bg-white/10 hover:text-white ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <LogOut size={20} />
        {!collapsed && <span>Déconnexion</span>}
      </button>
    </aside>
  );
}
