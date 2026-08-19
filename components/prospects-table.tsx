"use client";

import { useState } from "react";
import ProspectRow from "./prospect-row";
import { Prospect } from "./types";

const prospects: Prospect[] = [
  {
    id: "1",
    firstName: "Sophie",
    lastName: "Martin",
    phone: "06 71 22 90 91",
    treatment: "Épilation Laser",
    campaign: "Soldes Été",
    source: "Facebook",
    status: "À rappeler",
    commercial: "Samantha",
    nextContact: "Aujourd'hui",
    createdAt: "21/07",
    comments: 3,
  },
  {
    id: "2",
    firstName: "Julie",
    lastName: "Bernard",
    phone: "06 12 34 56 78",
    treatment: "Cryolipolyse",
    campaign: "Google",
    source: "Google Ads",
    status: "Nouveau",
    commercial: "Marie",
    nextContact: "Demain",
    createdAt: "22/07",
    comments: 1,
  },
  {
    id: "3",
    firstName: "Laura",
    lastName: "Petit",
    phone: "06 55 14 22 18",
    treatment: "Hydrafacial",
    campaign: "Instagram",
    source: "Instagram",
    status: "RDV pris",
    commercial: "Samantha",
    nextContact: "28/07",
    createdAt: "20/07",
    comments: 5,
  },
];

export default function ProspectsTable() {
  const [selectedId, setSelectedId] = useState("1");

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Prospects
          </h2>

          <p className="text-sm text-slate-500">
            {prospects.length} prospects
          </p>
        </div>

        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          + Nouveau prospect
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-4"></th>
              <th className="px-4 py-4">Date</th>
              <th className="px-4 py-4">Nom</th>
              <th className="px-4 py-4">Téléphone</th>
              <th className="px-4 py-4">Campagne</th>
              <th className="px-4 py-4">Soin</th>
              <th className="px-4 py-4">Source</th>
              <th className="px-4 py-4">Statut</th>
              <th className="px-4 py-4">Relance</th>
              <th className="px-4 py-4">Commercial</th>
              <th className="px-4 py-4 text-center">💬</th>
              <th className="px-4 py-4"></th>
            </tr>
          </thead>

          <tbody>
            {prospects.map((prospect) => (
              <ProspectRow
                key={prospect.id}
                prospect={prospect}
                selected={selectedId === prospect.id}
                onClick={() => setSelectedId(prospect.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}