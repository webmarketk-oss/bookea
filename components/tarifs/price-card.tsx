import type { ReactNode } from "react";

export function PriceCard({
  title,
  price,
  period,
  detail,
  highlight = false,
  children,
}: {
  title: string;
  price: string;
  period?: string;
  detail?: string;
  highlight?: boolean;
  children?: ReactNode;
}) {
  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        highlight ? "border-violet-300 ring-2 ring-violet-100" : "border-slate-200"
      }`}
    >
      {highlight ? (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-violet-600">
          Recommandé
        </p>
      ) : null}
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {detail ? (
        <p className="mt-1 text-sm font-medium text-slate-500">{detail}</p>
      ) : null}
      <p className="mt-4 text-3xl font-semibold tracking-tight">
        {price}
        {period ? (
          <span className="ml-1 text-sm font-medium text-slate-500">{period}</span>
        ) : null}
      </p>
      {children}
    </article>
  );
}
