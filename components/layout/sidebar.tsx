"use client";

import {
  BarChart3,
  LayoutDashboard,
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
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { BookeaLogo } from "@/components/bookea-logo";
import NavItem from "./nav-item";
import NavGroup from "./nav-group";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
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

  return (
    <aside
      className={`h-screen shrink-0 border-r bg-white p-4 transition-all duration-200 ${
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
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
          aria-label={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav className="space-y-2">
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
          <div className="px-3 pt-3 pb-1 text-xs font-black uppercase tracking-wide text-slate-400">
            Messagerie Bookea
          </div>
          <NavItem
            href="/dashboard/messagerie"
            label="Mes messages"
            icon={MessageCircle}
            active={pathname.startsWith("/dashboard/messagerie")}
          />
          <div className="px-3 pt-3 pb-1 text-xs font-black uppercase tracking-wide text-slate-400">
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
          <div className="px-3 pt-3 pb-1 text-xs font-black uppercase tracking-wide text-slate-400">
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
      </nav>
    </aside>
  );
}
