"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard/tarifs/whatsapp", label: "WhatsApp Seya" },
  { href: "/dashboard/tarifs/sms", label: "SMS" },
  { href: "/dashboard/tarifs/crm", label: "CRM + SMS" },
] as const;

export function TarifsNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              active ? "bg-slate-950 text-white" : "text-slate-600"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
