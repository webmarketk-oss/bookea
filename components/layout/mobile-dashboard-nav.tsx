"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  UserRound,
  Users,
} from "lucide-react";
import { BookeaLogo } from "@/components/bookea-logo";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const primaryItems = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/dashboard/crm-leads", label: "Leads", icon: Users },
  { href: "/dashboard/crm-clients", label: "Clients", icon: UserRound },
  { href: "/dashboard/agenda", label: "Agenda", icon: Calendar },
  { href: "/dashboard/facturation", label: "Caisse", icon: ReceiptText },
];

export function MobileDashboardNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#11152e] px-4 py-3 text-white shadow-lg shadow-[#11152e]/15 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <BookeaLogo size="sm" showSlogan={false} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/80"
            aria-label="Déconnexion"
          >
            <LogOut className="h-5 w-5" />
          </button>
          <Link
            href="/dashboard/parametres-centre"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/80"
            aria-label="Ouvrir les paramètres"
          >
            <Menu className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-fit items-center gap-2 rounded-xl px-3 py-2 text-xs font-black",
                active
                  ? "bookea-gradient text-white"
                  : "bg-white/8 text-white/70"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
