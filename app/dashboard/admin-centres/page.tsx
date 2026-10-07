"use client";

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { formatEuro } from "@/lib/bookea-tarifs";
import { setCenterSeyaQuota } from "@/lib/center-billing";
import { saveActiveCenterId } from "@/lib/center-access";
import {
  formatOfferDate,
  mergeOfferHistory,
  normalizeBookeaPlan,
  seyaOfferFromQuota,
  withCurrentOffersInHistory,
  type BookeaPlan,
  type OfferHistoryItem,
} from "@/lib/center-offers";
import {
  SEYA_PACK_LIMITS,
  normalizeSeyaQuota,
  seyaConversationCount,
  seyaRemainingConversations,
} from "@/lib/seya-quota";
import { createClient } from "@/lib/supabase";
import {
  creditSmsQuota,
  MONTHLY_SMS_LIMIT,
  normalizeSmsQuota,
  type SmsQuotaRecord,
} from "@/lib/sms-settings";

type CenterLegal = {
  legalName?: string;
};

type CenterPublicCenter = {
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
};

type CenterRow = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  postal_code: string | null;
  public_profile_enabled: boolean | null;
  owner_profile_id: string | null;
  created_at: string;
  settings?: {
    admin?: {
      isActive?: boolean;
    };
    sms?: {
      quota?: SmsQuotaRecord;
    };
    seya?: {
      conversations?: unknown[];
    };
    seyaQuota?: {
      conversationLimit?: number | null;
    };
    bookeaPlan?: unknown;
    offerHistory?: unknown;
    adminAlerts?: unknown;
    legal?: CenterLegal;
  } | null;
};

type CenterMemberRow = {
  center_id: string;
  profile_id: string;
  role: string | null;
  is_active?: boolean | null;
  profiles:
    | {
        email: string | null;
        full_name: string | null;
      }
    | Array<{
        email: string | null;
        full_name: string | null;
      }>
    | null;
};

type CenterCardData = Omit<CenterRow, "settings" | "phone"> & {
  legalName: string;
  address: string;
  phone: string;
  isActive: boolean;
  members: Array<{
    profileId: string;
    email: string;
    name: string;
    role: string;
  }>;
  smsRemaining: number;
  smsMonthlyGrant: number;
  smsUsedThisMonth: number;
  seyaUsed: number;
  seyaLimit: number | null;
  whatsappOffer: ReturnType<typeof seyaOfferFromQuota>;
  bookeaPlan: BookeaPlan | null;
  offerHistory: OfferHistoryItem[];
  facebookPage: { pageId: string; pageName: string } | null;
};

const defaultSources = [
  { name: "Instagram", slug: "instagram", is_organic: true, display_order: 1 },
  { name: "Google", slug: "google", is_organic: true, display_order: 2 },
  { name: "Bookea", slug: "bookea", is_organic: true, display_order: 3 },
  { name: "Appel entrant", slug: "appel-entrant", is_organic: true, display_order: 4 },
];

export default function AdminCentresPage() {
  const supabase = useMemo(() => createClient(), []);
  const [centers, setCenters] = useState<CenterCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attachingCenterId, setAttachingCenterId] = useState<string | null>(null);
  const [removingMemberKey, setRemovingMemberKey] = useState<string | null>(null);
  const [togglingCenterId, setTogglingCenterId] = useState<string | null>(null);
  const [creditingCenterId, setCreditingCenterId] = useState<string | null>(null);
  const [savingSeyaCenterId, setSavingSeyaCenterId] = useState<string | null>(null);
  const [savingIdentityCenterId, setSavingIdentityCenterId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    city: "",
    email: "",
    ownerEmail: "",
  });

  useEffect(() => {
    void loadCenters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCenters() {
    setLoading(true);

    try {
      const { data: centerRows, error: centersError } = await supabase
        .from("centers")
        .select("id,name,slug,city,email,phone,address_line1,postal_code,public_profile_enabled,owner_profile_id,created_at,sms:settings->sms,admin:settings->admin,seya:settings->seya,seyaQuota:settings->seyaQuota,bookeaPlan:settings->bookeaPlan,offerHistory:settings->offerHistory,adminAlerts:settings->adminAlerts,legal:settings->legal,publicCenter:settings->public->center")
        .order("created_at", { ascending: false });

      if (centersError) throw new Error(centersError.message);

      const centerIds = ((centerRows ?? []) as CenterRow[]).map((center) => center.id);
      let memberRows: CenterMemberRow[] = [];

      if (centerIds.length > 0) {
        const { data: members, error: membersError } = await supabase
          .from("center_members")
          .select("center_id,profile_id,role,is_active,profiles(email,full_name)")
          .in("center_id", centerIds);

        if (membersError) throw new Error(membersError.message);
        memberRows = (members ?? []) as unknown as CenterMemberRow[];
      }

      const facebookByCenter = new Map<string, { pageId: string; pageName: string }>();
      if (centerIds.length > 0) {
        const { data: facebookRows } = await supabase
          .from("facebook_page_connections")
          .select("center_id,page_id,page_name,is_active")
          .in("center_id", centerIds)
          .eq("is_active", true);
        for (const row of facebookRows ?? []) {
          facebookByCenter.set(String(row.center_id), {
            pageId: String(row.page_id || ""),
            pageName: String(row.page_name || "Page Facebook"),
          });
        }
      }

      setCenters(
        ((centerRows ?? []) as Array<
          CenterRow & {
            sms?: { quota?: SmsQuotaRecord } | null;
            admin?: { isActive?: boolean } | null;
            seya?: { conversations?: unknown[] } | null;
            seyaQuota?: { conversationLimit?: number | null } | null;
            bookeaPlan?: unknown;
            offerHistory?: unknown;
            adminAlerts?: unknown;
            legal?: CenterLegal | null;
            publicCenter?: CenterPublicCenter | null;
          }
        >).map((center) => {
          const quota = normalizeSmsQuota(center.settings?.sms?.quota ?? center.sms?.quota);
          const seyaQuota = normalizeSeyaQuota(
            center.settings?.seyaQuota ?? center.seyaQuota,
          );
          const bookeaPlan = normalizeBookeaPlan(
            center.settings?.bookeaPlan ?? center.bookeaPlan,
          );
          const whatsappOffer = seyaOfferFromQuota(seyaQuota);
          const offerHistory = withCurrentOffersInHistory(
            mergeOfferHistory(
              center.settings?.offerHistory ?? center.offerHistory,
              center.settings?.adminAlerts ?? center.adminAlerts,
            ),
            { whatsapp: whatsappOffer, bookea: bookeaPlan },
          );

          return {
            id: center.id,
            name: center.name,
            slug: center.slug,
            city: center.city,
            email:
              firstText(center.email, center.publicCenter?.email) || null,
            phone: firstText(center.phone, center.publicCenter?.phone),
            address_line1:
              firstText(center.address_line1, center.publicCenter?.address) ||
              null,
            postal_code: center.postal_code,
            legalName: firstText(
              center.settings?.legal?.legalName,
              center.legal?.legalName,
              center.publicCenter?.legalName,
            ),
            address: firstText(
              center.address_line1,
              center.publicCenter?.address,
            ),
            public_profile_enabled: center.public_profile_enabled,
            owner_profile_id: center.owner_profile_id,
            created_at: center.created_at,
            isActive: isCenterActive(center.settings ?? { admin: center.admin }),
            members: memberRows
              .filter(
                (member) =>
                  member.center_id === center.id && member.is_active !== false,
              )
              .map((member) => {
                const profile = relationObject(member.profiles);
                return {
                  profileId: member.profile_id,
                  email: profile?.email ?? "Compte sans email",
                  name: profile?.full_name ?? "Utilisateur Bookea",
                  role: member.role ?? "viewer",
                };
              }),
            smsRemaining: quota.remaining,
            smsMonthlyGrant: quota.monthlyGrant,
            smsUsedThisMonth: quota.usedThisMonth,
            seyaUsed: seyaConversationCount(center.settings?.seya ?? center.seya),
            seyaLimit: seyaQuota.conversationLimit,
            whatsappOffer,
            bookeaPlan,
            offerHistory,
            facebookPage: facebookByCenter.get(center.id) || null,
          };
        }),
      );
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de charger les centres.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const name = form.name.trim();
      const slug = slugify(form.slug || form.name);
      const ownerEmail = form.ownerEmail.trim().toLowerCase();

      if (!name) {
        throw new Error("Le nom du centre est obligatoire.");
      }

      if (!slug) {
        throw new Error("Le slug du centre est obligatoire.");
      }

      const { data: center, error: centerError } = await supabase
        .from("centers")
        .insert({
          name,
          slug,
          city: form.city.trim() || null,
          email: form.email.trim() || null,
          owner_profile_id: null,
          country: "France",
          description: "Centre Bookea",
          public_profile_enabled: false,
          theme_color: "#2563eb",
        })
        .select("id")
        .single();

      if (centerError) throw new Error(centerError.message);

      const centerId = center.id as string;

      await Promise.all([
        createDefaultSettings(centerId),
        createDefaultRooms(centerId),
        createDefaultSources(centerId),
      ]);

      let attached = false;
      if (ownerEmail) {
        try {
          await attachOwnerViaApi(centerId, ownerEmail);
          attached = true;
        } catch {
          attached = false;
        }
      }

      setForm({ name: "", slug: "", city: "", email: "", ownerEmail: "" });
      setNotice({
        type: attached ? "success" : "info",
        message: attached
          ? "Centre créé et responsable rattaché."
          : ownerEmail
            ? "Centre créé. Le responsable n’a pas encore de compte : rattachez son email après inscription."
            : "Centre créé vierge. Le responsable devra créer son compte avant rattachement.",
      });
      await loadCenters();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Le centre n'a pas pu être créé.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleAttachOwner(centerId: string, email: string) {
    setAttachingCenterId(centerId);
    setNotice(null);

    try {
      const member = await attachOwnerViaApi(centerId, email);
      setNotice({
        type: "success",
        message: `Accès rattaché : ${member.email || email}`,
      });
      await loadCenters();
      return { ok: true as const };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de rattacher ce responsable.";
      setNotice({
        type: "error",
        message,
      });
      return { ok: false as const, error: message };
    } finally {
      setAttachingCenterId(null);
    }
  }

  async function handleRemoveMember(centerId: string, profileId: string) {
    setRemovingMemberKey(`${centerId}:${profileId}`);
    setNotice(null);

    try {
      const { error } = await supabase
        .from("center_members")
        .delete()
        .eq("center_id", centerId)
        .eq("profile_id", profileId);

      if (error) {
        throw new Error(error.message);
      }

      const center = centers.find((item) => item.id === centerId);
      if (center?.owner_profile_id === profileId) {
        const { error: ownerError } = await supabase
          .from("centers")
          .update({ owner_profile_id: null, updated_at: new Date().toISOString() })
          .eq("id", centerId);

        if (ownerError) {
          throw new Error(ownerError.message);
        }
      }

      setNotice({
        type: "success",
        message: "Accès retiré. Vous pouvez rattacher un autre email.",
      });
      await loadCenters();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de retirer cet accès.",
      });
    } finally {
      setRemovingMemberKey(null);
    }
  }

  async function handleToggleActive(centerId: string, nextActive: boolean) {
    setTogglingCenterId(centerId);
    setNotice(null);

    try {
      const { data, error } = await supabase
        .from("centers")
        .select("settings")
        .eq("id", centerId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const currentSettings =
        data?.settings && typeof data.settings === "object"
          ? (data.settings as Record<string, unknown>)
          : {};
      const currentAdmin =
        currentSettings.admin && typeof currentSettings.admin === "object"
          ? (currentSettings.admin as Record<string, unknown>)
          : {};

      const { error: updateError } = await supabase
        .from("centers")
        .update({
          settings: {
            ...currentSettings,
            admin: {
              ...currentAdmin,
              isActive: nextActive,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", centerId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setCenters((current) =>
        current.map((center) =>
          center.id === centerId ? { ...center, isActive: nextActive } : center,
        ),
      );
      setNotice({
        type: "success",
        message: nextActive
          ? "Centre réactivé. Il réapparaît dans le sélecteur."
          : "Centre passé inactif. Il n’apparaît plus dans le sélecteur.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de changer le statut du centre.",
      });
    } finally {
      setTogglingCenterId(null);
    }
  }

  async function handleCreditSms(centerId: string, amount: number) {
    setCreditingCenterId(centerId);
    setNotice(null);

    try {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Indiquez un nombre de SMS à ajouter.");
      }

      const nextQuota = await creditSmsQuota(centerId, amount);
      setCenters((current) =>
        current.map((center) =>
          center.id === centerId
            ? {
                ...center,
                smsRemaining: nextQuota.remaining,
                smsMonthlyGrant: nextQuota.monthlyGrant,
                smsUsedThisMonth: nextQuota.usedThisMonth,
              }
            : center,
        ),
      );
      setNotice({
        type: "success",
        message: `${amount} SMS ajoutés au solde du centre. Nouveau solde : ${nextQuota.remaining}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible d'ajouter des SMS à ce centre.",
      });
    } finally {
      setCreditingCenterId(null);
    }
  }

  async function handleSetSeyaQuota(
    centerId: string,
    conversationLimit: number | null,
  ) {
    setSavingSeyaCenterId(centerId);
    setNotice(null);

    try {
      const next = await setCenterSeyaQuota(centerId, conversationLimit);
      setCenters((current) =>
        current.map((center) =>
          center.id === centerId
            ? {
                ...center,
                seyaLimit: next.quota.conversationLimit,
                seyaUsed: next.used,
              }
            : center,
        ),
      );
      setNotice({
        type: "success",
        message:
          next.quota.conversationLimit == null
            ? "Plafond Seya retiré. Le centre reste ouvert."
            : next.quota.conversationLimit === 0
              ? "Seya bloqué pour les nouvelles conversations."
              : `Plafond Seya posé à ${next.quota.conversationLimit} conversations.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible d’enregistrer le plafond Seya.",
      });
    } finally {
      setSavingSeyaCenterId(null);
    }
  }

  async function handleSaveIdentity(
    centerId: string,
    identity: {
      legalName: string;
      address: string;
      phone: string;
      email: string;
    },
  ) {
    setSavingIdentityCenterId(centerId);
    setNotice(null);

    try {
      const { data, error } = await supabase
        .from("centers")
        .select("settings")
        .eq("id", centerId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      const currentSettings = asObject(data?.settings);
      const currentLegal = asObject(currentSettings.legal);
      const currentPublic = asObject(currentSettings.public);
      const currentPublicCenter = asObject(currentPublic.center);
      const legalName = identity.legalName.trim();
      const address = identity.address.trim();
      const phone = identity.phone.trim();
      const email = identity.email.trim();

      const { error: updateError } = await supabase
        .from("centers")
        .update({
          email: email || null,
          phone: phone || null,
          address_line1: address || null,
          settings: {
            ...currentSettings,
            legal: {
              ...currentLegal,
              legalName,
            },
            public: {
              ...currentPublic,
              center: {
                ...currentPublicCenter,
                legalName,
                address,
                phone,
                email,
              },
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", centerId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setCenters((current) =>
        current.map((center) =>
          center.id === centerId
            ? {
                ...center,
                legalName,
                address,
                phone,
                email: email || null,
                address_line1: address || null,
              }
            : center,
        ),
      );
      setNotice({
        type: "success",
        message: "Coordonnées du centre enregistrées.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible d’enregistrer les coordonnées du centre.",
      });
    } finally {
      setSavingIdentityCenterId(null);
    }
  }

  async function attachOwnerViaApi(centerId: string, email: string) {
    const ownerEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      throw new Error("Email incomplet. Exemple : sandra.lucard@gmail.com");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const response = await fetch("/api/admin/center-members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({ centerId, email: ownerEmail }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      member?: { email?: string };
    };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Impossible de rattacher cet accès.");
    }
    return payload.member || { email: ownerEmail };
  }

  async function createDefaultSettings(centerId: string) {
    const { error } = await supabase.from("center_settings").upsert(
      {
        center_id: centerId,
        invoice_prefix: "FAC",
        default_vat_rate: 20,
        currency: "EUR",
      },
      { onConflict: "center_id" },
    );

    if (error) throw new Error(error.message);
  }

  async function createDefaultRooms(centerId: string) {
    const { error } = await supabase.from("rooms").insert([
      { center_id: centerId, name: "Cabine 1", color: "#6415E8", display_order: 1 },
      { center_id: centerId, name: "Cabine 2", color: "#247AF2", display_order: 2 },
    ]);

    if (error) throw new Error(error.message);
  }

  async function createDefaultSources(centerId: string) {
    const { error } = await supabase.from("lead_sources").insert(
      defaultSources.map((source) => ({
        center_id: centerId,
        ...source,
      })),
    );

    if (error) throw new Error(error.message);
  }

  const filteredCenters = useMemo(() => {
    const query = search.trim().toLowerCase();

    return centers.filter((center) => {
      if (activityFilter === "active" && !center.isActive) {
        return false;
      }

      if (activityFilter === "inactive" && center.isActive) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        center.name,
        center.slug,
        center.city,
        center.email,
        center.legalName,
        center.address,
        center.phone,
        ...center.members.map((member) => `${member.name} ${member.email}`),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [activityFilter, centers, search]);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <div className="mx-auto max-w-[1800px] space-y-8 p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">Bookea Admin</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Admin centres
            </h1>
            <p className="mt-3 max-w-4xl text-sm text-slate-500">
              Créez un centre vierge, rattachez un responsable et gardez les
              données de chaque établissement séparées.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadCenters()}
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw className="h-5 w-5" />
            Actualiser
          </button>
        </header>

        {notice && (
          <div
            className={`flex items-center gap-3 rounded-2xl border p-4 font-bold ${
              notice.type === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : notice.type === "error"
                  ? "border-rose-100 bg-rose-50 text-rose-700"
                  : "border-blue-100 bg-blue-50 text-blue-700"
            }`}
          >
            {notice.type === "success" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
            {notice.message}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[460px_1fr]">
          <form
            onSubmit={handleCreateCenter}
            className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Créer un centre</h2>
                <p className="font-medium text-slate-500">
                  Base vierge, prête pour CRM, agenda et factures.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <TextField
                label="Nom du centre"
                value={form.name}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    name: value,
                    slug: current.slug || slugify(value),
                  }))
                }
                placeholder="Clinique exemple Lyon"
                required
              />
              <TextField
                label="Slug"
                value={form.slug}
                onChange={(value) =>
                  setForm((current) => ({ ...current, slug: slugify(value) }))
                }
                placeholder="clinique-exemple-lyon"
                required
              />
              <TextField
                label="Ville"
                value={form.city}
                onChange={(value) => setForm((current) => ({ ...current, city: value }))}
                placeholder="Lyon"
              />
              <TextField
                label="Email public du centre"
                type="email"
                value={form.email}
                onChange={(value) => setForm((current) => ({ ...current, email: value }))}
                placeholder="contact@centre.fr"
              />
              <TextField
                label="Email responsable"
                type="email"
                value={form.ownerEmail}
                onChange={(value) =>
                  setForm((current) => ({ ...current, ownerEmail: value }))
                }
                placeholder="responsable@centre.fr"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              Créer le centre vierge
            </button>

            <p className="mt-4 text-sm font-semibold text-slate-500">
              Si le responsable n&apos;a pas encore de compte, le centre sera
              créé sans responsable. Il faudra rattacher son email après son
              inscription.
            </p>
          </form>

          <div className="space-y-4">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un centre, une ville ou un email…"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["all", "Tous"],
                    ["active", "Actifs"],
                    ["inactive", "Inactifs"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActivityFilter(value)}
                    className={`h-9 rounded-full px-3 text-sm font-medium ${
                      activityFilter === value
                        ? "bg-slate-950 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="self-center text-xs font-medium text-slate-400">
                  {filteredCenters.length} centre
                  {filteredCenters.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="grid min-h-80 place-items-center rounded-[2rem] border border-slate-200 bg-white text-slate-500">
                <div className="flex items-center gap-3 font-semibold">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Chargement des centres...
                </div>
              </div>
            ) : centers.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
                <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-4 text-base font-semibold">Aucun centre</p>
                <p className="mt-2 font-medium text-slate-500">
                  Créez le premier centre Bookea.
                </p>
              </div>
            ) : filteredCenters.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
                <Search className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-4 text-base font-semibold">Aucun résultat</p>
                <p className="mt-2 font-medium text-slate-500">
                  Aucun centre ne correspond à cette recherche.
                </p>
              </div>
            ) : (
              filteredCenters.map((center) => (
                <CenterCard
                  key={center.id}
                  center={center}
                  attaching={attachingCenterId === center.id}
                  removingMemberKey={removingMemberKey}
                  toggling={togglingCenterId === center.id}
                  crediting={creditingCenterId === center.id}
                  savingSeya={savingSeyaCenterId === center.id}
                  onAttachOwner={(email) => handleAttachOwner(center.id, email)}
                  onRemoveMember={(profileId) =>
                    handleRemoveMember(center.id, profileId)
                  }
                  onToggleActive={(nextActive) =>
                    handleToggleActive(center.id, nextActive)
                  }
                  onCreditSms={(amount) => handleCreditSms(center.id, amount)}
                  onSetSeyaQuota={(limit) => handleSetSeyaQuota(center.id, limit)}
                  savingIdentity={savingIdentityCenterId === center.id}
                  onSaveIdentity={(identity) =>
                    handleSaveIdentity(center.id, identity)
                  }
                />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function CenterCard({
  center,
  attaching,
  removingMemberKey,
  toggling,
  crediting,
  savingSeya,
  savingIdentity,
  onAttachOwner,
  onRemoveMember,
  onToggleActive,
  onCreditSms,
  onSetSeyaQuota,
  onSaveIdentity,
}: {
  center: CenterCardData;
  attaching: boolean;
  removingMemberKey: string | null;
  toggling: boolean;
  crediting: boolean;
  savingSeya: boolean;
  savingIdentity: boolean;
  onAttachOwner: (
    email: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onRemoveMember: (profileId: string) => void;
  onToggleActive: (nextActive: boolean) => void;
  onCreditSms: (amount: number) => void;
  onSetSeyaQuota: (limit: number | null) => void;
  onSaveIdentity: (identity: {
    legalName: string;
    address: string;
    phone: string;
    email: string;
  }) => void;
}) {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [identity, setIdentity] = useState({
    legalName: center.legalName,
    address: center.address,
    phone: center.phone || "",
    email: center.email || "",
  });
  const [attachError, setAttachError] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [smsAmount, setSmsAmount] = useState("");
  const [seyaLimit, setSeyaLimit] = useState(
    center.seyaLimit == null ? "unlimited" : String(center.seyaLimit),
  );

  useEffect(() => {
    setSeyaLimit(
      center.seyaLimit == null ? "unlimited" : String(center.seyaLimit),
    );
  }, [center.seyaLimit]);

  useEffect(() => {
    setIdentity({
      legalName: center.legalName,
      address: center.address,
      phone: center.phone || "",
      email: center.email || "",
    });
  }, [center.address, center.email, center.legalName, center.phone]);
  const facebookConnectUrl = center.slug
    ? `/api/meta/connect?center_slug=${encodeURIComponent(center.slug)}${
        facebookPageId.trim()
          ? `&page_id=${encodeURIComponent(facebookPageId.trim())}`
          : ""
      }`
    : "";

  async function submitOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttachError("");
    const result = await onAttachOwner(ownerEmail);
    if (result.ok) {
      setOwnerEmail("");
      return;
    }
    setAttachError(result.error || "Impossible de rattacher cet accès.");
  }

  function submitSmsCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Math.floor(Number(smsAmount));

    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    onCreditSms(amount);
    setSmsAmount("");
  }

  function submitSeyaQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSetSeyaQuota(seyaLimit === "unlimited" ? null : Number(seyaLimit));
  }

  function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveIdentity(identity);
  }

  const seyaRemaining = seyaRemainingConversations(
    center.seyaUsed,
    center.seyaLimit,
  );

  return (
    <article
      id={`center-${center.id}`}
      className={`rounded-[2rem] border bg-white p-6 shadow-sm ${
        center.isActive ? "border-slate-200" : "border-orange-200 bg-orange-50/30"
      }`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{center.name}</h3>
              <p className="font-mono text-sm font-bold text-slate-400">
                {center.slug}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                saveActiveCenterId(center.id);
                window.setTimeout(() => {
                  window.location.href = "/dashboard";
                }, 700);
              }}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Ouvrir ce centre
            </button>
            <button
              type="button"
              disabled={toggling}
              onClick={() => onToggleActive(!center.isActive)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-60 ${
                center.isActive
                  ? "border border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {toggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              {center.isActive ? "Passer inactif" : "Réactiver"}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {center.city && (
              <Badge icon={<MapPin className="h-4 w-4" />}>{center.city}</Badge>
            )}
            {center.email && (
              <Badge icon={<Mail className="h-4 w-4" />}>{center.email}</Badge>
            )}
            <Badge icon={<ShieldCheck className="h-4 w-4" />}>
              {center.public_profile_enabled ? "Profil public actif" : "Profil public masqué"}
            </Badge>
            <Badge icon={<Power className="h-4 w-4" />}>
              {center.isActive ? "Centre actif" : "Centre inactif"}
            </Badge>
          </div>

          <form
            onSubmit={submitIdentity}
            className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-xs font-medium text-slate-400">
              Coordonnées du centre
            </p>
            <TextField
              label="Raison sociale"
              value={identity.legalName}
              onChange={(value) =>
                setIdentity((current) => ({ ...current, legalName: value }))
              }
              placeholder="Ex. JFG Clinic SARL"
            />
            <TextField
              label="Adresse"
              value={identity.address}
              onChange={(value) =>
                setIdentity((current) => ({ ...current, address: value }))
              }
              placeholder="12 rue de la Paix, 63000 Clermont-Ferrand"
            />
            <TextField
              label="Téléphone"
              value={identity.phone}
              onChange={(value) =>
                setIdentity((current) => ({ ...current, phone: value }))
              }
              placeholder="04 73 00 00 00"
            />
            <TextField
              label="Email"
              type="email"
              value={identity.email}
              onChange={(value) =>
                setIdentity((current) => ({ ...current, email: value }))
              }
              placeholder="contact@centre.fr"
            />
            <button
              type="submit"
              disabled={savingIdentity}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingIdentity ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enregistrer les coordonnées
            </button>
          </form>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4 xl:min-w-80">
          <p className="mb-3 text-xs font-medium text-slate-400">
            Accès centre
          </p>
          {center.members.length > 0 ? (
            <div className="space-y-2">
              {center.members.map((member) => {
                const memberKey = `${center.id}:${member.profileId}`;
                const removing = removingMemberKey === memberKey;

                return (
                  <div
                    key={memberKey}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{member.name}</p>
                      <p className="truncate text-sm font-semibold text-slate-400">
                        {member.email}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {member.role}
                      </span>
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => onRemoveMember(member.profileId)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        title="Retirer cet accès"
                        aria-label={`Retirer ${member.email}`}
                      >
                        {removing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-slate-500">
              <UserRoundPlus className="h-5 w-5" />
              <p className="font-bold">Aucun responsable rattaché.</p>
            </div>
          )}

          <form onSubmit={submitOwner} className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-slate-500">
              Rattacher un responsable
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                value={ownerEmail}
                onChange={(event) => {
                  setOwnerEmail(event.target.value);
                  setAttachError("");
                }}
                placeholder="responsable@centre.fr"
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={attaching}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {attaching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserRoundPlus className="h-4 w-4" />
                )}
                Rattacher
              </button>
            </div>
            {attachError ? (
              <p className="text-xs font-semibold text-rose-600">{attachError}</p>
            ) : (
              <p className="text-xs font-semibold text-slate-400">
                Autant d’emails que nécessaire. Retirez un accès pour le remplacer.
                Le compte doit déjà avoir été créé sur la page connexion.
              </p>
            )}
          </form>

          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-violet-600">
              Offre actuelle
            </p>
            <div className="space-y-2 text-sm font-medium text-slate-700">
              {center.whatsappOffer ? (
                <p>
                  WhatsApp {center.whatsappOffer.leads} leads ·{" "}
                  {formatEuro(center.whatsappOffer.price)} / mois
                  <span className="block text-xs font-semibold text-slate-500">
                    {center.whatsappOffer.subscribedAt
                      ? `Souscrit le ${formatOfferDate(center.whatsappOffer.subscribedAt)}`
                      : "Date de souscription non enregistrée"}
                    {center.whatsappOffer.renewsAt
                      ? ` · renouvellement le ${formatOfferDate(center.whatsappOffer.renewsAt)}`
                      : ""}
                  </span>
                </p>
              ) : (
                <p className="text-slate-500">WhatsApp : pas encore souscrit</p>
              )}
              {center.bookeaPlan ? (
                <p>
                  {center.bookeaPlan.title} · {formatEuro(center.bookeaPlan.price)} /
                  mois
                  <span className="block text-xs font-semibold text-slate-500">
                    Souscrit le {formatOfferDate(center.bookeaPlan.subscribedAt)} ·
                    renouvellement le {formatOfferDate(center.bookeaPlan.renewsAt)}
                  </span>
                </p>
              ) : (
                <p className="text-slate-500">Bookea : pas encore souscrit</p>
              )}
              <p>
                SMS : {center.smsRemaining} restants · sans date limite
              </p>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                Historique
              </p>
              {center.offerHistory.length > 0 ? (
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs font-semibold text-slate-600">
                  {center.offerHistory.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl bg-white px-3 py-2"
                    >
                      <p>
                        {item.label} · {formatEuro(item.amountEuros)}
                      </p>
                      <p className="font-medium text-slate-400">
                        {formatOfferDate(item.subscribedAt)}
                        {item.renewsAt
                          ? ` · renouvellement ${formatOfferDate(item.renewsAt)}`
                          : " · sans date limite"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs font-semibold text-slate-400">
                  Aucune souscription enregistrée pour le moment.
                </p>
              )}
            </div>
          </div>

          <form onSubmit={submitSeyaQuota} className="mt-5 border-t border-slate-200 pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-400">Seya / WhatsApp</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                {center.seyaLimit == null
                  ? `${center.seyaUsed} · illimité`
                  : `${center.seyaUsed} / ${center.seyaLimit}`}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {center.seyaLimit == null
                ? "Pas de pack posé : les nouvelles conversations restent ouvertes."
                : center.seyaLimit === 0
                  ? "Bloqué : Seya ne prend plus de nouveau fil."
                  : `${seyaRemaining ?? 0} conversation${
                      (seyaRemaining ?? 0) > 1 ? "s" : ""
                    } restante${(seyaRemaining ?? 0) > 1 ? "s" : ""}.`}
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-500">
              Plafond de conversations
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select
                value={seyaLimit}
                onChange={(event) => setSeyaLimit(event.target.value)}
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="unlimited">Illimité</option>
                <option value="0">Bloqué</option>
                {SEYA_PACK_LIMITS.map((limit) => (
                  <option key={limit} value={limit}>
                    {limit} conversations
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={savingSeya}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingSeya ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Appliquer
              </button>
            </div>
          </form>

          <form onSubmit={submitSmsCredit} className="mt-5 border-t border-slate-200 pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-400">SMS du centre</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <Smartphone className="h-3.5 w-3.5" />
                {center.smsRemaining} restants
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              Forfait {center.smsMonthlyGrant || MONTHLY_SMS_LIMIT} SMS / mois ·{" "}
              {center.smsUsedThisMonth} utilisé{center.smsUsedThisMonth > 1 ? "s" : ""} ce
              mois. Les recharges et le reliquat n’expirent pas.
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-500">
              Ajouter des SMS
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="number"
                min={1}
                step={1}
                value={smsAmount}
                onChange={(event) => setSmsAmount(event.target.value.replace(/[^\d]/g, ""))}
                placeholder="Ex. 100"
                inputMode="numeric"
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={crediting || Math.floor(Number(smsAmount)) <= 0}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {crediting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Ajouter
              </button>
            </div>
          </form>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <label className="block text-sm font-medium text-slate-500">
              Connecter les leads Facebook
            </label>
            {center.facebookPage ? (
              <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                Connecté : {center.facebookPage.pageName}
              </p>
            ) : null}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={facebookPageId}
                onChange={(event) => setFacebookPageId(event.target.value)}
                placeholder="Facultatif : lien facebook.com/… ou ID"
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <a
                href={facebookConnectUrl || undefined}
                aria-disabled={!facebookConnectUrl}
                className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 font-semibold text-white transition ${
                  facebookConnectUrl
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "pointer-events-none bg-slate-300"
                }`}
              >
                <ExternalLink className="h-4 w-4" />
                {center.facebookPage ? "Changer de page" : "Connecter Facebook"}
              </a>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Clique Connecter Facebook, accepte Meta, puis choisis la page du
              centre. Pas besoin de l&apos;ID. Systeme.io se colle dans
              Paramètres → Sources.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function Badge({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
      {icon}
      {children}
    </span>
  );
}

function isCenterActive(settings: CenterRow["settings"] | unknown) {
  const record =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>)
      : {};
  const admin =
    record.admin && typeof record.admin === "object"
      ? (record.admin as { isActive?: boolean })
      : {};

  return admin.isActive !== false;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function relationObject<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] : relation;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
