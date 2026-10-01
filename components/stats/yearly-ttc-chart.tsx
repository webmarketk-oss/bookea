"use client";

import { useMemo, useState } from "react";
import type { BillingInvoice } from "@/lib/billing-supabase";
import { buildYearlyTtcSeries } from "@/lib/yearly-revenue";

const MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

const YEAR_COLORS = [
  "#059669",
  "#2563eb",
  "#c026d3",
  "#ea580c",
  "#e11d48",
  "#0f766e",
  "#7c3aed",
];

type HoveredPoint = {
  x: number;
  y: number;
  year: number;
  month: string;
  value: number;
  color: string;
};

function yearColor(index: number) {
  return YEAR_COLORS[Math.max(0, index) % YEAR_COLORS.length];
}

function formatEuro(value: number) {
  return value.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function niceChartMax(value: number) {
  const safe = Math.max(1, value);
  if (safe <= 4) {
    return 4;
  }
  const magnitude = 10 ** Math.floor(Math.log10(safe));
  return Math.ceil(safe / magnitude) * magnitude;
}

export function YearlyTtcChart({ invoices }: { invoices: BillingInvoice[] }) {
  const series = useMemo(() => buildYearlyTtcSeries(invoices), [invoices]);
  const [hiddenYears, setHiddenYears] = useState<number[]>([]);
  const visible = series.filter((row) => !hiddenYears.includes(row.year));
  const chartMax = niceChartMax(
    Math.max(1, ...visible.flatMap((row) => row.months)),
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) =>
    Math.round(chartMax * step),
  );

  function toggleYear(year: number) {
    setHiddenYears((current) =>
      current.includes(year)
        ? current.filter((item) => item !== year)
        : [...current, year],
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
          {series.map((row, index) => {
            const hidden = hiddenYears.includes(row.year);
            const color = yearColor(index);
            return (
              <button
                key={row.year}
                type="button"
                onClick={() => toggleYear(row.year)}
                className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                  hidden
                    ? "border-slate-200 bg-white text-slate-400"
                    : "border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <i
                  className="mr-2 inline-block h-2 w-2 rounded-full"
                  style={{ background: color }}
                />
                {row.year}
              </button>
            );
          })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-5 text-sm font-medium text-slate-500">
          Aucune année sélectionnée.
        </p>
      ) : (
        <TtcLineChart
          series={visible}
          allYears={series.map((row) => row.year)}
          max={chartMax}
          ticks={ticks}
        />
      )}
    </div>
  );
}

function TtcLineChart({
  series,
  allYears,
  max,
  ticks,
}: {
  series: Array<{ year: number; months: number[] }>;
  allYears: number[];
  max: number;
  ticks: number[];
}) {
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);
  const width = 720;
  const height = 280;
  const pad = { left: 58, right: 12, top: 28, bottom: 34 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;

  function point(index: number, value: number) {
    return {
      x: pad.left + (index * innerWidth) / 11,
      y: pad.top + innerHeight - (value / max) * innerHeight,
    };
  }

  function pathFor(values: number[]) {
    return values
      .map((value, index) => {
        const { x, y } = point(index, value);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="relative min-w-[640px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-72 w-full"
          role="img"
          aria-label="Courbes du chiffre TTC par année"
          onMouseLeave={() => setHovered(null)}
        >
          {ticks.map((tick) => {
            const y = pad.top + innerHeight - (tick / max) * innerHeight;
            return (
              <g key={tick}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-semibold"
                >
                  {formatEuro(tick)}
                </text>
              </g>
            );
          })}

          {MONTH_LABELS.map((label, index) => {
            const x = pad.left + (index * innerWidth) / 11;
            return (
              <text
                key={label}
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="fill-slate-500 text-[11px] font-semibold"
              >
                {label}
              </text>
            );
          })}

          {series.map((row) => {
            const color = yearColor(allYears.indexOf(row.year));
            return (
              <g key={row.year}>
                <path
                  d={pathFor(row.months)}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {row.months.map((value, index) => {
                  const { x, y } = point(index, value);
                  const active =
                    hovered?.year === row.year &&
                    hovered.month === MONTH_LABELS[index];
                  return (
                    <g key={`${row.year}-${index}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r="14"
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() =>
                          setHovered({
                            x,
                            y,
                            year: row.year,
                            month: MONTH_LABELS[index],
                            value,
                            color,
                          })
                        }
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={active ? 5.5 : 3.5}
                        fill={color}
                        className="pointer-events-none"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hovered ? (
          <div
            className={`pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg ${
              hovered.y < 56 ? "translate-y-3" : "-translate-y-[calc(100%+10px)]"
            } ${
              hovered.x < 80
                ? "translate-x-0"
                : hovered.x > width - 80
                  ? "-translate-x-full"
                  : "-translate-x-1/2"
            }`}
            style={{
              left: `${(hovered.x / width) * 100}%`,
              top: `${(hovered.y / height) * 100}%`,
            }}
          >
            <p className="text-[11px] font-semibold text-slate-500">
              {hovered.month} {hovered.year}
            </p>
            <p
              className="mt-0.5 text-lg font-black leading-none"
              style={{ color: hovered.color }}
            >
              {formatEuro(hovered.value)}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
