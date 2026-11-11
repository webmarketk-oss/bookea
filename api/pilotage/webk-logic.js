const CYNTHIA_EMAIL = "cynthia@webkagency.net";
const ADMIN_EMAIL = "webmarket.k@gmail.com";
const DEFAULT_THRESHOLD = 1;

function normalizeIdentity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Samantha, Cynthia, ou le compte admin Bookea. Un autre admin ne passe pas. */
function isWebkPilotageIdentity({ email, fullName, adminLabel } = {}) {
  const mail = normalizeIdentity(email);
  if (mail === CYNTHIA_EMAIL || mail === ADMIN_EMAIL) {
    return true;
  }
  const blob = `${mail} ${normalizeIdentity(fullName)} ${normalizeIdentity(adminLabel)}`;
  return /\bsamantha\b/.test(blob) || /\bcynthia\b/.test(blob);
}

function canOpenWebkPilotage(input = {}) {
  return Boolean(input.isAdmin) && isWebkPilotageIdentity(input);
}

function isCenterActive(admin) {
  if (!admin || typeof admin !== "object") {
    return true;
  }
  return admin.isActive !== false;
}

function thresholdOf(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 999) {
    return DEFAULT_THRESHOLD;
  }
  return number;
}

function isPilotageAlert(leads48h, threshold) {
  const count = Number(leads48h) || 0;
  const min = thresholdOf(threshold);
  return count === 0 || count < min;
}

function windowBounds(now) {
  const end = new Date(now);
  return {
    end,
    h48: new Date(end.getTime() - 48 * 60 * 60 * 1000),
    d7: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000),
    d14: new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000),
  };
}

/** Compte uniquement la date de réception. updated_at et les commentaires n’entrent pas. */
function countCreatedLeads(createdAts, now) {
  const { end, h48, d7, d14 } = windowBounds(now);
  let leads48h = 0;
  let leads7d = 0;
  let leadsPrev7d = 0;
  for (const value of createdAts || []) {
    const at = new Date(value);
    if (Number.isNaN(at.getTime()) || at > end || at < d14) {
      continue;
    }
    if (at >= h48) {
      leads48h += 1;
    }
    if (at >= d7) {
      leads7d += 1;
    } else {
      leadsPrev7d += 1;
    }
  }
  return { leads48h, leads7d, leadsPrev7d };
}

function formatPilotageDate(value) {
  const raw = String(value || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    return "";
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatActionLine(centerName, action) {
  const name = String(centerName || "").trim() || "Centre";
  const campaign = String(action?.campaign || "").trim();
  const title = campaign ? `${name} · ${campaign}` : name;
  const when = formatPilotageDate(action?.actedOn);
  const change = String(action?.changeText || "").trim();
  const parts = [title, when, change].filter(Boolean);
  let line = parts.join(" — ");
  const review = formatPilotageDate(action?.reviewOn);
  if (review) {
    line += ` — À revoir le ${review}`;
  }
  return line.endsWith(".") ? line : `${line}.`;
}

function sortActions(actions) {
  return [...(actions || [])].sort((left, right) => {
    const byDay = String(right.actedOn || "").localeCompare(String(left.actedOn || ""));
    if (byDay !== 0) {
      return byDay;
    }
    return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  });
}

const PILOTAGE_AXES = ["visage", "epilation", "minceur"];

function axisCount(row, camel, snake) {
  return Number(row?.[camel] ?? row?.[snake]) || 0;
}

function axisFigures(leadRow, rdvRow, minLeads, minRdv) {
  const leads48h = axisCount(leadRow, "leads48h", "leads_48h");
  const leads7d = axisCount(leadRow, "leads7d", "leads_7d");
  const leadsPrev7d = axisCount(leadRow, "leadsPrev7d", "leads_prev_7d");
  const leadsMonth = axisCount(leadRow, "leadsMonth", "leads_month");
  const leadsPrevMonth = axisCount(leadRow, "leadsPrevMonth", "leads_prev_month");
  const rdv48h = axisCount(rdvRow, "rdv48h", "rdv_48h");
  const rdv7d = axisCount(rdvRow, "rdv7d", "rdv_7d");
  const rdvPrev7d = axisCount(rdvRow, "rdvPrev7d", "rdv_prev_7d");
  const rdvMonth = axisCount(rdvRow, "rdvMonth", "rdv_month");
  const rdvPrevMonth = axisCount(rdvRow, "rdvPrevMonth", "rdv_prev_month");
  const figures = {
    leads48h,
    leads7d,
    leadsPrev7d,
    delta: leads7d - leadsPrev7d,
    leadsMonth,
    leadsPrevMonth,
    monthDelta: leadsMonth - leadsPrevMonth,
    alert: isPilotageAlert(leads48h, minLeads),
    rdv48h,
    rdv7d,
    rdvPrev7d,
    rdvDelta: rdv7d - rdvPrev7d,
    rdvMonth,
    rdvPrevMonth,
    rdvMonthDelta: rdvMonth - rdvPrevMonth,
    rdvAlert: isPilotageAlert(rdv48h, minRdv),
  };
  const active = [
    leads48h,
    leads7d,
    leadsPrev7d,
    leadsMonth,
    leadsPrevMonth,
    rdv48h,
    rdv7d,
    rdvPrev7d,
    rdvMonth,
    rdvPrevMonth,
  ].some((value) => value > 0);
  return active ? figures : null;
}

function axesByCenter(leadAxes, rdvAxes, thresholdByCenter) {
  const leads = new Map();
  const rdvs = new Map();
  for (const row of leadAxes || []) {
    const axis = String(row.axis || "");
    if (!PILOTAGE_AXES.includes(axis)) {
      continue;
    }
    const centerId = String(row.centerId || row.center_id || "");
    const bucket = leads.get(centerId) || {};
    bucket[axis] = row;
    leads.set(centerId, bucket);
  }
  for (const row of rdvAxes || []) {
    const axis = String(row.axis || "");
    if (!PILOTAGE_AXES.includes(axis)) {
      continue;
    }
    const centerId = String(row.centerId || row.center_id || "");
    const bucket = rdvs.get(centerId) || {};
    bucket[axis] = row;
    rdvs.set(centerId, bucket);
  }
  const centerIds = new Set([...leads.keys(), ...rdvs.keys()]);
  const result = new Map();
  for (const centerId of centerIds) {
    const limits = thresholdByCenter.get(centerId) || {
      leads: DEFAULT_THRESHOLD,
      rdv: DEFAULT_THRESHOLD,
    };
    const axes = {};
    for (const axis of PILOTAGE_AXES) {
      const figures = axisFigures(
        leads.get(centerId)?.[axis],
        rdvs.get(centerId)?.[axis],
        limits.leads,
        limits.rdv,
      );
      if (figures) {
        axes[axis] = figures;
      }
    }
    if (Object.keys(axes).length > 0) {
      result.set(centerId, axes);
    }
  }
  return result;
}

function buildPilotageCenters({
  centers,
  counts,
  rdvCounts,
  thresholds,
  actions,
  campaigns,
  leadAxes,
  rdvAxes,
}) {
  const countByCenter = new Map(
    (counts || []).map((row) => [String(row.centerId || row.center_id), row]),
  );
  const thresholdByCenter = new Map(
    (thresholds || []).map((row) => [
      String(row.centerId || row.center_id),
      {
        leads: thresholdOf(row.minLeads48h ?? row.min_leads_48h),
        rdv: thresholdOf(row.minRdv48h ?? row.min_rdv_48h),
      },
    ]),
  );
  const rdvByCenter = new Map(
    (rdvCounts || []).map((row) => [String(row.centerId || row.center_id), row]),
  );
  const actionsByCenter = new Map();
  for (const action of actions || []) {
    const centerId = String(action.centerId || action.center_id || "");
    const list = actionsByCenter.get(centerId) || [];
    list.push(action);
    actionsByCenter.set(centerId, list);
  }
  const campaignsByCenter = new Map();
  for (const campaign of campaigns || []) {
    const centerId = String(campaign.centerId || campaign.center_id || "");
    const name = String(campaign.name || "").trim();
    if (!centerId || !name) {
      continue;
    }
    const list = campaignsByCenter.get(centerId) || [];
    if (!list.includes(name)) {
      list.push(name);
    }
    campaignsByCenter.set(centerId, list);
  }
  const axisByCenter = axesByCenter(leadAxes, rdvAxes, thresholdByCenter);

  return (centers || [])
    .filter((center) => isCenterActive(center.admin))
    .map((center) => {
      const id = String(center.id);
      const count = countByCenter.get(id) || {};
      const leads48h = Number(count.leads48h ?? count.leads_48h) || 0;
      const leads7d = Number(count.leads7d ?? count.leads_7d) || 0;
      const leadsPrev7d = Number(count.leadsPrev7d ?? count.leads_prev_7d) || 0;
      const leadsMonth = Number(count.leadsMonth ?? count.leads_month) || 0;
      const leadsPrevMonth = Number(count.leadsPrevMonth ?? count.leads_prev_month) || 0;
      const limits = thresholdByCenter.get(id) || {
        leads: DEFAULT_THRESHOLD,
        rdv: DEFAULT_THRESHOLD,
      };
      const minLeads48h = limits.leads;
      const rdv = rdvByCenter.get(id) || {};
      const rdv48h = Number(rdv.rdv48h ?? rdv.rdv_48h) || 0;
      const rdv7d = Number(rdv.rdv7d ?? rdv.rdv_7d) || 0;
      const rdvPrev7d = Number(rdv.rdvPrev7d ?? rdv.rdv_prev_7d) || 0;
      const rdvMonth = Number(rdv.rdvMonth ?? rdv.rdv_month) || 0;
      const rdvPrevMonth = Number(rdv.rdvPrevMonth ?? rdv.rdv_prev_month) || 0;
      const minRdv48h = limits.rdv;
      const history = sortActions(actionsByCenter.get(id)).map(normalizeAction);
      return {
        id,
        name: String(center.name || "Centre"),
        city: String(center.city || ""),
        leads48h,
        leads7d,
        leadsPrev7d,
        delta: leads7d - leadsPrev7d,
        leadsMonth,
        leadsPrevMonth,
        monthDelta: leadsMonth - leadsPrevMonth,
        minLeads48h,
        alert: isPilotageAlert(leads48h, minLeads48h),
        rdv48h,
        rdv7d,
        rdvPrev7d,
        rdvDelta: rdv7d - rdvPrev7d,
        rdvMonth,
        rdvPrevMonth,
        rdvMonthDelta: rdvMonth - rdvPrevMonth,
        minRdv48h,
        rdvAlert: isPilotageAlert(rdv48h, minRdv48h),
        campaigns: campaignsByCenter.get(id) || [],
        lastAction: history[0] || null,
        history,
        axes: axisByCenter.get(id) || {},
      };
    });
}

function normalizeAction(action) {
  return {
    id: String(action.id || ""),
    actedOn: String(action.actedOn || action.acted_on || "").slice(0, 10),
    campaign: String(action.campaign || ""),
    changeText: String(action.changeText || action.change_text || ""),
    reviewOn: action.reviewOn || action.review_on
      ? String(action.reviewOn || action.review_on).slice(0, 10)
      : "",
    authorName: String(action.authorName || action.author_name || ""),
    createdAt: String(action.createdAt || action.created_at || ""),
  };
}

const BOOKED_RDV_STATUSES = new Set([
  "rdv pris",
  "rdv fixe",
  "rdv programme",
  "rdv confirme",
  "a relancer, rdv pris",
]);
const RECEIVED_DEPOSIT_STATUSES = new Set(["acompte recu", "acompte valide"]);
const COUNTED_APPOINTMENT_STATUSES = new Set([
  "confirmed",
  "present",
  "cancelled",
  "no_show",
  "sold",
  "in_progress",
  "done",
]);

function foldStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function earliestInstant(values) {
  let best = null;
  for (const value of values) {
    if (!value) {
      continue;
    }
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) {
      continue;
    }
    if (!best || at < best) {
      best = at;
    }
  }
  return best;
}

/**
 * Un crédit par rendez-vous, daté du moment où il a été pris.
 * L’acompte reçu peut être ce moment s’il arrive avant la confirmation.
 * L’acompte envoyé, un appel en absence ou un commentaire ne comptent pas.
 */
function rdvTakenTimestamps({ statusEvents, appointments } = {}) {
  const booked = [];
  const deposits = [];
  for (const event of statusEvents || []) {
    if (event?.type !== "status") {
      continue;
    }
    const folded = foldStatus(event.to);
    if (BOOKED_RDV_STATUSES.has(folded)) {
      booked.push(event.at);
    } else if (RECEIVED_DEPOSIT_STATUSES.has(folded)) {
      deposits.push(event.at);
    }
  }
  const takenAppointments = (appointments || [])
    .filter((item) => COUNTED_APPOINTMENT_STATUSES.has(String(item?.status || "")))
    .map((item) => item.at)
    .filter((at) => !Number.isNaN(new Date(at).getTime()))
    .sort((left, right) => new Date(left) - new Date(right));
  const anchor = earliestInstant([...booked, ...deposits, takenAppointments[0]]);
  if (!anchor) {
    return [];
  }
  return [anchor.toISOString(), ...takenAppointments.slice(1).map((at) => new Date(at).toISOString())];
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parisYmd(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

function frenchMonthName(month) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, month - 1, 1)),
  );
}

function monthRangeLabel(day, month) {
  const name = frenchMonthName(month);
  return day <= 1 ? `1 ${name}` : `1–${day} ${name}`;
}

/** Période du 1er au jour courant, et la même longueur le mois précédent. */
function monthPeriod(now) {
  const { year, month, day } = parisYmd(now);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const previousDay = Math.min(day, daysInMonth(previous.year, previous.month));
  return {
    currentLabel: monthRangeLabel(day, month),
    previousLabel: monthRangeLabel(previousDay, previous.month),
    currentDay: day,
    previousDay,
  };
}

function sortPilotageCenters(rows, direction, metric = "leads", period = "week") {
  const factor = direction === "asc" ? 1 : -1;
  const key =
    period === "month"
      ? metric === "rdv"
        ? "rdvMonth"
        : "leadsMonth"
      : metric === "rdv"
        ? "rdv7d"
        : "leads7d";
  return [...rows].sort((left, right) => {
    const leftValue = Number(left[key]) || 0;
    const rightValue = Number(right[key]) || 0;
    if (leftValue !== rightValue) {
      return (leftValue - rightValue) * factor;
    }
    return left.name.localeCompare(right.name, "fr");
  });
}

module.exports = {
  CYNTHIA_EMAIL,
  DEFAULT_THRESHOLD,
  buildPilotageCenters,
  canOpenWebkPilotage,
  countCreatedLeads,
  formatActionLine,
  rdvTakenTimestamps,
  formatPilotageDate,
  isCenterActive,
  monthPeriod,
  isPilotageAlert,
  isWebkPilotageIdentity,
  sortPilotageCenters,
  thresholdOf,
  windowBounds,
};
