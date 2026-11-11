"use client";

import { ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { formatPilotageDate, monthPeriod, sortPilotageCenters } from "@/api/pilotage/webk-logic";
import { createClient } from "@/lib/supabase";

type PilotageAction = {
  id: string;
  actedOn: string;
  campaign: string;
  changeText: string;
  reviewOn: string;
  authorName: string;
  createdAt: string;
};

type PilotageMetric = "leads" | "rdv";
type PilotagePeriod = "week" | "month";

type PilotageCenter = {
  id: string;
  name: string;
  city: string;
  leads48h: number;
  leads7d: number;
  leadsPrev7d: number;
  delta: number;
  leadsMonth: number;
  leadsPrevMonth: number;
  monthDelta: number;
  minLeads48h: number;
  alert: boolean;
  rdv48h: number;
  rdv7d: number;
  rdvPrev7d: number;
  rdvDelta: number;
  rdvMonth: number;
  rdvPrevMonth: number;
  rdvMonthDelta: number;
  minRdv48h: number;
  rdvAlert: boolean;
  campaigns: string[];
  lastAction: PilotageAction | null;
  history: PilotageAction[];
  axes?: Partial<Record<PilotageAxis, AxisFigures>>;
};

type PilotageAxis = "visage" | "epilation" | "minceur";

type AxisFigures = Pick<
  PilotageCenter,
  | "leads48h"
  | "leads7d"
  | "leadsPrev7d"
  | "delta"
  | "leadsMonth"
  | "leadsPrevMonth"
  | "monthDelta"
  | "alert"
  | "rdv48h"
  | "rdv7d"
  | "rdvPrev7d"
  | "rdvDelta"
  | "rdvMonth"
  | "rdvPrevMonth"
  | "rdvMonthDelta"
  | "rdvAlert"
>;

const axisTables: { key: PilotageAxis; title: string }[] = [
  { key: "visage", title: "Visage" },
  { key: "epilation", title: "Laser" },
  { key: "minceur", title: "Minceur" },
];

function axisPreview(
  counts: [number, number, number, number, number, number, number, number, number, number],
  minLeads: number,
  minRdv: number,
): AxisFigures {
  const [leads48h, leads7d, leadsPrev7d, leadsMonth, leadsPrevMonth, rdv48h, rdv7d, rdvPrev7d, rdvMonth, rdvPrevMonth] = counts;
  return {
    leads48h,
    leads7d,
    leadsPrev7d,
    delta: leads7d - leadsPrev7d,
    leadsMonth,
    leadsPrevMonth,
    monthDelta: leadsMonth - leadsPrevMonth,
    alert: leads48h === 0 || leads48h < minLeads,
    rdv48h,
    rdv7d,
    rdvPrev7d,
    rdvDelta: rdv7d - rdvPrev7d,
    rdvMonth,
    rdvPrevMonth,
    rdvMonthDelta: rdvMonth - rdvPrevMonth,
    rdvAlert: rdv48h === 0 || rdv48h < minRdv,
  };
}

const previewAxes: Record<string, PilotageCenter["axes"]> = {
  pelissanne: {
    visage: axisPreview([0, 1, 3, 6, 8, 1, 2, 3, 2, 3], 1, 1),
    epilation: axisPreview([0, 2, 4, 7, 10, 1, 3, 3, 2, 4], 1, 1),
    minceur: axisPreview([0, 1, 2, 5, 6, 0, 1, 2, 1, 2], 1, 1),
  },
  bruz: {
    visage: axisPreview([2, 8, 6, 10, 7, 0, 1, 2, 4, 3], 2, 2),
    epilation: axisPreview([1, 6, 5, 8, 6, 0, 1, 1, 3, 2], 2, 2),
    minceur: axisPreview([3, 14, 10, 12, 9, 0, 1, 2, 5, 3], 2, 2),
  },
  gaillard: {
    visage: axisPreview([1, 7, 6, 4, 4, 1, 3, 2, 1, 2], 3, 3),
    epilation: axisPreview([0, 4, 5, 2, 2, 0, 1, 2, 1, 2], 3, 3),
  },
};

const previewCenters: PilotageCenter[] = [
  {
    id: "pelissanne",
    name: "Pélissanne",
    city: "Pélissanne",
    leads48h: 0,
    leads7d: 4,
    leadsPrev7d: 9,
    delta: -5,
    leadsMonth: 18,
    leadsPrevMonth: 24,
    monthDelta: -6,
    minLeads48h: 1,
    alert: true,
    rdv48h: 2,
    rdv7d: 6,
    rdvPrev7d: 8,
    rdvDelta: -2,
    rdvMonth: 5,
    rdvPrevMonth: 9,
    rdvMonthDelta: -4,
    minRdv48h: 1,
    rdvAlert: false,
    campaigns: ["Minceur", "Laser"],
    lastAction: {
      id: "a1",
      actedOn: "2026-11-11",
      campaign: "Minceur",
      changeText: "Zone élargie et nouveau visuel lancé",
      reviewOn: "2026-11-13",
      authorName: "Samantha",
      createdAt: "2026-11-11T16:40:00.000Z",
    },
    history: [
      {
        id: "a1",
        actedOn: "2026-11-11",
        campaign: "Minceur",
        changeText: "Zone élargie et nouveau visuel lancé",
        reviewOn: "2026-11-13",
        authorName: "Samantha",
        createdAt: "2026-11-11T16:40:00.000Z",
      },
      {
        id: "a0",
        actedOn: "2026-11-08",
        campaign: "Laser",
        changeText: "Audience resserrée sur la zone",
        reviewOn: "",
        authorName: "Cynthia",
        createdAt: "2026-11-08T09:15:00.000Z",
      },
    ],
  },
  {
    id: "bruz",
    name: "JFG Clinic Bruz",
    city: "Bruz",
    leads48h: 6,
    leads7d: 28,
    leadsPrev7d: 21,
    delta: 7,
    leadsMonth: 30,
    leadsPrevMonth: 22,
    monthDelta: 8,
    minLeads48h: 2,
    alert: false,
    rdv48h: 0,
    rdv7d: 3,
    rdvPrev7d: 5,
    rdvDelta: -2,
    rdvMonth: 12,
    rdvPrevMonth: 8,
    rdvMonthDelta: 4,
    minRdv48h: 2,
    rdvAlert: true,
    campaigns: ["Soin minceur"],
    lastAction: null,
    history: [],
  },
  {
    id: "gaillard",
    name: "JFG Clinic Gaillard",
    city: "Gaillard",
    leads48h: 1,
    leads7d: 11,
    leadsPrev7d: 11,
    delta: 0,
    leadsMonth: 6,
    leadsPrevMonth: 6,
    monthDelta: 0,
    minLeads48h: 3,
    alert: true,
    rdv48h: 1,
    rdv7d: 4,
    rdvPrev7d: 4,
    rdvDelta: 0,
    rdvMonth: 2,
    rdvPrevMonth: 4,
    rdvMonthDelta: -2,
    minRdv48h: 3,
    rdvAlert: true,
    campaigns: ["Visage", "Laser"],
    lastAction: null,
    history: [],
  },
];

function formatChangeStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

function ModificationHistory({
  center,
  saving,
  onSave,
}: {
  center: PilotageCenter;
  saving: boolean;
  onSave: (draft: {
    actedOn: string;
    campaign: string;
    changeText: string;
    reviewOn: string;
  }) => Promise<boolean>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const [draft, setDraft] = useState({
    actedOn: todayIso(),
    campaign: "",
    changeText: "",
    reviewOn: "",
  });
  const latest = center.history[0];

  function place() {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom;
    const openUp = below < 280 && rect.top > below;
    setStyle({
      position: "fixed",
      left,
      width,
      maxHeight: Math.min(520, openUp ? rect.top - 12 : below - 12),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    place();
    commentRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-label={`Commentaire de ${center.name}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex max-w-[18rem] items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-left text-xs font-semibold text-slate-700 hover:border-slate-300"
      >
        <span className="truncate">{latest ? latest.changeText : "Ajouter un commentaire"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <aside
              ref={panelRef}
              style={style}
              onClick={(event) => event.stopPropagation()}
              className="z-[200] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-xl"
            >
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Historique
              </p>
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {center.history.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-slate-500">Aucune modification.</li>
                ) : (
                  center.history.map((action) => (
                    <li
                      key={action.id}
                      className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-2 px-3 py-1.5"
                    >
                      <span className="text-xs font-medium text-slate-400">
                        {formatChangeStamp(action.createdAt)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium leading-4 text-slate-800">
                          {action.changeText}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                          {[
                            action.campaign,
                            action.reviewOn ? `À revoir le ${formatPilotageDate(action.reviewOn)}` : "",
                            action.authorName,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <form
                className="grid gap-2 border-t border-slate-100 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onSave(draft).then((saved) => {
                    if (saved) {
                      setDraft({
                        actedOn: todayIso(),
                        campaign: "",
                        changeText: "",
                        reviewOn: "",
                      });
                    }
                  });
                }}
              >
                <label className="text-xs font-medium text-slate-600">
                  Commentaire
                  <textarea
                    ref={commentRef}
                    required
                    value={draft.changeText}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, changeText: event.target.value }))
                    }
                    className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-slate-600">
                    Date de l’action
                    <input
                      type="date"
                      required
                      value={draft.actedOn}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, actedOn: event.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    À revoir le
                    <input
                      type="date"
                      value={draft.reviewOn}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, reviewOn: event.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                    />
                  </label>
                </div>
                <label className="text-xs font-medium text-slate-600">
                  Campagne
                  {center.campaigns.length > 0 ? (
                    <select
                      value={draft.campaign}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, campaign: event.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                    >
                      <option value="">Non précisée</option>
                      {center.campaigns.map((campaign) => (
                        <option key={campaign} value={campaign}>
                          {campaign}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={draft.campaign}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, campaign: event.target.value }))
                      }
                      placeholder="Si elle est connue"
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                    />
                  )}
                </label>
                <button
                  type="submit"
                  disabled={saving || !draft.changeText.trim()}
                  className="h-9 rounded-lg bg-slate-950 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Enregistrer
                </button>
              </form>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}

function todayIso() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function projectAxis(center: PilotageCenter, axis: PilotageAxis) {
  const figures = center.axes?.[axis];
  if (!figures) {
    return null;
  }
  return { ...center, ...figures };
}

function centerView(center: PilotageCenter, metric: PilotageMetric, period: PilotagePeriod) {
  const monthly = period === "month";
  if (metric === "rdv") {
    return {
      recent: center.rdv48h,
      week: monthly ? center.rdvMonth : center.rdv7d,
      previous: monthly ? center.rdvPrevMonth : center.rdvPrev7d,
      delta: monthly ? center.rdvMonthDelta : center.rdvDelta,
      min: center.minRdv48h,
      alert: center.rdvAlert,
      recentLabel: `${center.rdv48h} RDV sur 48 h`,
    };
  }
  const noun = center.leads48h > 1 ? "leads" : "lead";
  return {
    recent: center.leads48h,
    week: monthly ? center.leadsMonth : center.leads7d,
    previous: monthly ? center.leadsPrevMonth : center.leadsPrev7d,
    delta: monthly ? center.monthDelta : center.delta,
    min: center.minLeads48h,
    alert: center.alert,
    recentLabel: `${center.leads48h} ${noun} sur 48 h`,
  };
}

function isLocalPreview() {
  if (typeof window === "undefined") {
    return false;
  }
  const host = window.location.hostname;
  return (
    (host === "localhost" || host === "127.0.0.1") &&
    new URLSearchParams(window.location.search).get("apercu") === "1"
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

export default function PilotageWebkPage() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [centers, setCenters] = useState<PilotageCenter[]>([]);
  const [metric, setMetric] = useState<PilotageMetric>("leads");
  const [period, setPeriod] = useState<PilotagePeriod>("week");
  const [direction, setDirection] = useState<"desc" | "asc">("desc");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [leadThresholds, setLeadThresholds] = useState<Record<string, string>>({});
  const [rdvThresholds, setRdvThresholds] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState("");
  const [axesReady, setAxesReady] = useState(false);

  async function load() {
    if (isLocalPreview()) {
      setPreview(true);
      setCenters(
        previewCenters.map((center) => ({ ...center, axes: previewAxes[center.id] })),
      );
      setLeadThresholds(
        Object.fromEntries(previewCenters.map((center) => [center.id, String(center.minLeads48h)])),
      );
      setRdvThresholds(
        Object.fromEntries(previewCenters.map((center) => [center.id, String(center.minRdv48h)])),
      );
      setAxesReady(true);
      setDenied(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch("/api/pilotage/webk", { headers: await authHeaders() });
    if (response.status === 401 || response.status === 403) {
      setDenied(true);
      setCenters([]);
      setLoading(false);
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Le pilotage n’a pas pu être chargé.");
      setLoading(false);
      return;
    }
    const next = (body.centers || []) as PilotageCenter[];
    setCenters(next);
    setLeadThresholds(
      Object.fromEntries(next.map((center) => [center.id, String(center.minLeads48h)])),
    );
    setRdvThresholds(
      Object.fromEntries(next.map((center) => [center.id, String(center.minRdv48h)])),
    );
    setAxesReady(body.axesReady === true);
    setDenied(false);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const alerts = centers.filter((center) => center.alert || center.rdvAlert);
  const ranking = useMemo(() => {
    const source = alertsOnly
      ? centers.filter((center) => centerView(center, metric, period).alert)
      : centers;
    return sortPilotageCenters(source, direction, metric, period);
  }, [alertsOnly, centers, direction, metric, period]);
  const axisRankings = useMemo(
    () =>
      axisTables.map((axis) => {
        const source = centers.flatMap((center) => {
          const projected = projectAxis(center, axis.key);
          return projected ? [projected] : [];
        });
        const visible = alertsOnly
          ? source.filter((center) => centerView(center, metric, period).alert)
          : source;
        return {
          ...axis,
          rows: sortPilotageCenters(visible, direction, metric, period),
        };
      }),
    [alertsOnly, centers, direction, metric, period],
  );
  const columns = monthPeriod(new Date());
  const currentColumn = period === "month" ? columns.currentLabel : "7 jours";
  const previousColumn = period === "month" ? columns.previousLabel : "7 jours précédents";

  async function saveThresholds(centerId: string) {
    const leads = Number(leadThresholds[centerId]);
    const rdv = Number(rdvThresholds[centerId]);
    const valid = (value: number) => Number.isInteger(value) && value >= 0 && value <= 999;
    if (!valid(leads) || !valid(rdv)) {
      setError("Chaque seuil doit être un nombre entre 0 et 999.");
      return;
    }
    setSavingId(centerId);
    setError("");
    if (preview) {
      setCenters((current) =>
        current.map((center) =>
          center.id === centerId
            ? {
                ...center,
                minLeads48h: leads,
                alert: center.leads48h === 0 || center.leads48h < leads,
                minRdv48h: rdv,
                rdvAlert: center.rdv48h === 0 || center.rdv48h < rdv,
              }
            : center,
        ),
      );
      setSavingId("");
      return;
    }
    for (const body of [
      { op: "threshold", metric: "leads", centerId, minLeads48h: leads },
      { op: "threshold", metric: "rdv", centerId, minRdv48h: rdv },
    ]) {
      const response = await fetch("/api/pilotage/webk", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        setSavingId("");
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error || "Le seuil n’a pas été enregistré.");
        setSavingId("");
        return;
      }
    }
    await load();
    setSavingId("");
  }

  async function saveAction(
    center: PilotageCenter,
    draft: { actedOn: string; campaign: string; changeText: string; reviewOn: string },
  ) {
    const changeText = draft.changeText.trim();
    if (!changeText) {
      return false;
    }
    setSavingId(center.id);
    setError("");
    if (preview) {
      const action: PilotageAction = {
        id: `local-${Date.now()}`,
        actedOn: draft.actedOn,
        campaign: draft.campaign,
        changeText,
        reviewOn: draft.reviewOn,
        authorName: "Samantha",
        createdAt: new Date().toISOString(),
      };
      setCenters((current) =>
        current.map((item) =>
          item.id === center.id
            ? { ...item, history: [action, ...item.history], lastAction: action }
            : item,
        ),
      );
      setSavingId("");
      return true;
    }
    const response = await fetch("/api/pilotage/webk", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        op: "action",
        centerId: center.id,
        actedOn: draft.actedOn,
        campaign: draft.campaign,
        changeText,
        reviewOn: draft.reviewOn,
      }),
    });
    if (response.status === 401 || response.status === 403) {
      setDenied(true);
      setSavingId("");
      return false;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "La modification n’a pas été enregistrée.");
      setSavingId("");
      return false;
    }
    await load();
    setSavingId("");
    return true;
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] text-slate-500">
        <div className="flex items-center gap-3 font-semibold">
          <Loader2 className="h-5 w-5 animate-spin" />
          Chargement...
        </div>
      </main>
    );
  }

  if (denied) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-8 text-slate-950">
        <div className="max-w-md rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-base font-semibold">Accès réservé</p>
          <p className="mt-2 font-medium text-slate-500">
            Pilotage WEBK est réservé à Samantha et Cynthia.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
        <header>
          <p className="text-sm font-medium text-violet-600">Interne WEBK</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pilotage WEBK</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            {metric === "rdv"
              ? "RDV pris dans Bookea, à la date où le rendez-vous a été pris. Un acompte reçu compte aussi, une seule fois. Un acompte seulement envoyé ne compte pas."
              : "Leads reçus dans Bookea, par date d’arrivée. Un changement de statut ou un commentaire ne compte pas."}
          </p>
          <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setMetric("leads")}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${
                metric === "leads" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              Leads reçus
            </button>
            <button
              type="button"
              onClick={() => setMetric("rdv")}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${
                metric === "rdv" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              RDV pris
            </button>
          </div>
          {preview ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              Aperçu local, données fictives. Rien n’est enregistré.
            </p>
          ) : null}
        </header>

        {error ? (
          <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Centres actifs en alerte
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Un centre remonte ici dès qu’il est à 0, ou sous le seuil réglé dans le classement, sur les 48 dernières heures.
          </p>
          {alerts.length === 0 ? (
            <p className="mt-4 text-sm font-medium text-slate-600">Aucun centre en alerte.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {alerts.map((center) => (
                <article key={center.id} className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                  <p className="font-semibold">{center.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {center.leads48h} lead{center.leads48h > 1 ? "s" : ""} · seuil {center.minLeads48h}
                    {" · "}
                    {center.rdv48h} RDV · objectif {center.minRdv48h}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setPeriod("week")}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${
                period === "week" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              7 derniers jours
            </button>
            <button
              type="button"
              onClick={() => setPeriod("month")}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${
                period === "month" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              Mois en cours
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Tous les axes · {period === "month"
                ? metric === "rdv"
                  ? "Classement des RDV du mois"
                  : "Classement des leads du mois"
                : metric === "rdv"
                  ? "Classement des RDV sur 7 jours"
                  : "Classement des leads sur 7 jours"}
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDirection((current) => (current === "desc" ? "asc" : "desc"))}
                className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
              >
                {direction === "desc" ? "Du plus au moins" : "Du moins au plus"}
              </button>
              <button
                type="button"
                onClick={() => setAlertsOnly((current) => !current)}
                className={`h-9 rounded-xl px-3 text-sm font-semibold ${
                  alertsOnly ? "bg-amber-100 text-amber-950" : "border border-slate-200"
                }`}
              >
                {alertsOnly ? "Alertes seulement" : "Tous les centres"}
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Centre</th>
                  <th className={`py-2 pr-3 font-medium ${period === "month" ? "normal-case" : ""}`}>{currentColumn}</th>
                  <th className={`py-2 pr-3 font-medium ${period === "month" ? "normal-case" : ""}`}>{previousColumn}</th>
                  <th className="py-2 pr-3 font-medium">Évolution</th>
                  <th className="py-2 pr-3 font-medium">Seuil 48 h</th>
                  <th className="py-2 font-medium">Dernière modification</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((center) => (
                  <tr key={center.id} className="border-t border-slate-100">
                    <td className="py-3 pr-3 font-semibold">
                      {center.name}
                      {centerView(center, metric, period).alert ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          Alerte
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">{centerView(center, metric, period).week}</td>
                    <td className="py-3 pr-3">{centerView(center, metric, period).previous}</td>
                    <td className={`py-3 pr-3 font-semibold ${centerView(center, metric, period).delta < 0 ? "text-rose-600" : centerView(center, metric, period).delta > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                      {centerView(center, metric, period).delta > 0
                        ? `+${centerView(center, metric, period).delta}`
                        : centerView(center, metric, period).delta}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-[11px] font-medium text-slate-500">
                          Leads
                          <input
                            type="number"
                            min={0}
                            max={999}
                            aria-label={`Seuil de leads de ${center.name}`}
                            value={leadThresholds[center.id] ?? ""}
                            onChange={(event) =>
                              setLeadThresholds((current) => ({
                                ...current,
                                [center.id]: event.target.value,
                              }))
                            }
                            className="mt-1 block h-8 w-16 rounded-lg border border-slate-200 px-2 text-sm text-slate-900"
                          />
                        </label>
                        <label className="text-[11px] font-medium text-slate-500">
                          RDV
                          <input
                            type="number"
                            min={0}
                            max={999}
                            aria-label={`Objectif RDV de ${center.name}`}
                            value={rdvThresholds[center.id] ?? ""}
                            onChange={(event) =>
                              setRdvThresholds((current) => ({
                                ...current,
                                [center.id]: event.target.value,
                              }))
                            }
                            className="mt-1 block h-8 w-16 rounded-lg border border-slate-200 px-2 text-sm text-slate-900"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={savingId === center.id}
                          onClick={() => void saveThresholds(center.id)}
                          className="h-8 rounded-lg bg-slate-950 px-2.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Enregistrer
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {center.leads48h} lead{center.leads48h > 1 ? "s" : ""} · {center.rdv48h} RDV sur 48 h
                      </p>
                    </td>
                    <td className="py-3 text-slate-600">
                      <ModificationHistory
                        center={center}
                        saving={savingId === center.id}
                        onSave={(draft) => saveAction(center, draft)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {axesReady ? (
            axisRankings.map((axis) => (
              <div key={axis.key} className="mt-8 border-t border-slate-100 pt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {axis.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Classé par le soin, puis par le nom de l’offre. Diététique et Autre restent dans le global.
                </p>
                {axis.rows.length === 0 ? (
                  <p className="mt-4 text-sm font-medium text-slate-600">Aucun centre sur cet axe.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="py-2 pr-3 font-medium">Centre</th>
                          <th className={`py-2 pr-3 font-medium ${period === "month" ? "normal-case" : ""}`}>{currentColumn}</th>
                          <th className={`py-2 pr-3 font-medium ${period === "month" ? "normal-case" : ""}`}>{previousColumn}</th>
                          <th className="py-2 font-medium">Évolution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {axis.rows.map((center) => {
                          const view = centerView(center, metric, period);
                          return (
                            <tr key={center.id} className="border-t border-slate-100">
                              <td className="py-3 pr-3 font-semibold">
                                {center.name}
                                {view.alert ? (
                                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                    Alerte
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-3 pr-3">{view.week}</td>
                              <td className="py-3 pr-3">{view.previous}</td>
                              <td className={`py-3 font-semibold ${view.delta < 0 ? "text-rose-600" : view.delta > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                                {view.delta > 0 ? `+${view.delta}` : view.delta}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
              Les tableaux Visage, Laser et Minceur s’affichent dès que les axes sont installés dans la base.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
